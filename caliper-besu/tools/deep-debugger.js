#!/usr/bin/env node

/**
 * Deep Debugging Tool for Caliper Execution Reverts
 * Identifies the exact cause of "Execution reverted" errors
 */

const { Web3 } = require('web3');
const fs = require('fs').promises;
const path = require('path');

class ExecutionRevertDebugger {
  constructor() {
    this.web3 = null;
    this.networkConfig = null;
    this.roleControlContract = null;
    this.workspacePath = process.cwd();
  }

  async initialize() {
    // Load network configuration
    const configPath = path.resolve(this.workspacePath, 'networks/ethereum/besu-network.json');
    const configData = await fs.readFile(configPath, 'utf8');
    this.networkConfig = JSON.parse(configData);

    // Initialize Web3 connection
    let besuUrl = this.networkConfig.ethereum.url;
    if (besuUrl.startsWith('ws://')) {
      besuUrl = besuUrl.replace('ws://', 'http://').replace(':8546', ':8545');
    }
    
    this.web3 = new Web3(besuUrl);

    // Load RoleControl contract
    const roleControlConfig = this.networkConfig.ethereum.contracts.RoleControl;
    let contractABI;
    
    if (roleControlConfig.abi) {
      contractABI = roleControlConfig.abi;
    } else {
      const abiPath = path.resolve(this.workspacePath, roleControlConfig.path);
      const abiData = await fs.readFile(abiPath, 'utf8');
      contractABI = JSON.parse(abiData).abi;
    }

    this.roleControlContract = new this.web3.eth.Contract(
      contractABI,
      roleControlConfig.address
    );

    console.log('🔍 Debugger initialized');
    console.log(`📋 Contract: ${roleControlConfig.address}`);
    console.log(`🔗 Network: ${besuUrl}`);
  }

  async debugSpecificFailure() {
    console.log('\n🚨 DEBUGGING SPECIFIC CALIPER FAILURE\n');
    
    // Exact same parameters that failed in Caliper
    const failedRole = 3; // TRUSTEE
    const failedAccount = "0xfe3b557e8fb62b89f4916b721be55ceb828dbd73";
    const deployerAccount = this.networkConfig.ethereum.contractDeployerAddresses || 
                           this.networkConfig.ethereum.fromAddress;

    console.log(`🎯 Failed Operation Details:`);
    console.log(`   Role: ${failedRole} (TRUSTEE)`);
    console.log(`   Target Account: ${failedAccount}`);
    console.log(`   Deployer Account: ${deployerAccount}`);

    // Check current state
    await this.checkAccountStates(deployerAccount, failedAccount);
    
    // Try the exact same call that failed
    await this.simulateFailedCall(deployerAccount, failedRole, failedAccount);
    
    // Check contract constraints
    await this.checkContractConstraints(deployerAccount, failedRole, failedAccount);
  }

  async checkAccountStates(deployerAccount, targetAccount) {
    console.log('\n📊 ACCOUNT STATE ANALYSIS\n');

    try {
      // Check deployer role
      const deployerRole = await this.roleControlContract.methods.getRole(deployerAccount).call();
      console.log(`👤 Deployer (${deployerAccount}) role: ${deployerRole} (${this.getRoleName(deployerRole)})`);

      // Check target account role
      const targetRole = await this.roleControlContract.methods.getRole(targetAccount).call();
      console.log(`🎯 Target (${targetAccount}) role: ${targetRole} (${this.getRoleName(targetRole)})`);

      // Check if deployer can assign roles
      const canAssign = await this.roleControlContract.methods.hasRole(3, deployerAccount).call(); // TRUSTEE role
      console.log(`🔑 Deployer has TRUSTEE role: ${canAssign}`);

      // Check account balances
      const deployerBalance = await this.web3.eth.getBalance(deployerAccount);
      const targetBalance = await this.web3.eth.getBalance(targetAccount);
      console.log(`💰 Deployer balance: ${this.web3.utils.fromWei(deployerBalance, 'ether')} ETH`);
      console.log(`💰 Target balance: ${this.web3.utils.fromWei(targetBalance, 'ether')} ETH`);

    } catch (error) {
      console.error(`❌ Account state check failed: ${error.message}`);
    }
  }

  async simulateFailedCall(deployerAccount, role, targetAccount) {
    console.log('\n🧪 SIMULATING FAILED CALL\n');

    try {
      // Test 1: Call estimation (what diagnostics do)
      console.log('🔍 Test 1: Gas Estimation');
      const gasEstimate = await this.roleControlContract.methods
        .assignRole(role, targetAccount)
        .estimateGas({ from: deployerAccount });
      console.log(`   ✅ Gas estimate successful: ${gasEstimate}`);

    } catch (estimateError) {
      console.log(`   ❌ Gas estimation failed: ${estimateError.message}`);
      
      // Try to get the revert reason
      await this.extractRevertReason(deployerAccount, role, targetAccount);
      return;
    }

    try {
      // Test 2: Dry run call (read-only simulation)
      console.log('\n🔍 Test 2: Dry Run Call');
      await this.roleControlContract.methods
        .assignRole(role, targetAccount)
        .call({ from: deployerAccount });
      console.log(`   ✅ Dry run successful - would not revert`);

    } catch (callError) {
      console.log(`   ❌ Dry run failed: ${callError.message}`);
      await this.extractRevertReason(deployerAccount, role, targetAccount);
      return;
    }

    try {
      // Test 3: Actual transaction (what Caliper tries to do)
      console.log('\n🔍 Test 3: Actual Transaction Simulation');
      
      const deployerKey = this.networkConfig.ethereum.contractDeployerAddressPrivateKeys ||
                          this.networkConfig.ethereum.fromAddressPrivateKey;
      
      if (!deployerKey) {
        console.log(`   ⚠️  No private key available for actual transaction test`);
        return;
      }

      // Create transaction
      const tx = this.roleControlContract.methods.assignRole(role, targetAccount);
      const gas = await tx.estimateGas({ from: deployerAccount });
      const gasPrice = await this.web3.eth.getGasPrice();

      const txData = {
        to: this.roleControlContract.options.address,
        data: tx.encodeABI(),
        gas: parseInt(gas) + 10000, // Add buffer and ensure number type
        gasPrice: gasPrice.toString(), // Convert to string to avoid BigInt issues
        from: deployerAccount
      };

      // Sign transaction
      const signedTx = await this.web3.eth.accounts.signTransaction(txData, deployerKey);
      
      console.log(`   📝 Transaction prepared successfully`);
      console.log(`      Gas: ${txData.gas}`);
      console.log(`      Gas Price: ${gasPrice}`);
      
      // NOTE: We don't actually send it, just verify it can be prepared
      console.log(`   ✅ Transaction would be valid`);

    } catch (txError) {
      console.log(`   ❌ Transaction preparation failed: ${txError.message}`);
    }
  }

  async extractRevertReason(from, role, targetAccount) {
    console.log('\n🔬 EXTRACTING REVERT REASON\n');

    try {
      // Create the transaction data
      const txData = this.roleControlContract.methods.assignRole(role, targetAccount).encodeABI();
      
      // Try to execute and catch the detailed error
      const result = await this.web3.eth.call({
        to: this.roleControlContract.options.address,
        data: txData,
        from: from
      });

      console.log(`   🤔 Call succeeded unexpectedly: ${result}`);

    } catch (error) {
      console.log(`   🚨 Revert reason analysis:`);
      
      // Check for specific error messages
      if (error.message.includes('Unauthorized')) {
        console.log(`      🔑 CAUSE: Caller lacks required permissions`);
        console.log(`      💡 FIX: Ensure ${from} has TRUSTEE role`);
      } else if (error.message.includes('InvalidRole')) {
        console.log(`      📋 CAUSE: Invalid role number provided`);
        console.log(`      💡 FIX: Use valid role (0=NONE, 1=ISSUER, 2=HOLDER, 3=TRUSTEE)`);
      } else if (error.message.includes('execution reverted')) {
        console.log(`      ⚡ CAUSE: Generic execution revert`);
        console.log(`      🔍 Checking contract state constraints...`);
        await this.checkContractConstraints(from, role, targetAccount);
      } else {
        console.log(`      ❓ UNKNOWN CAUSE: ${error.message}`);
      }
    }
  }

  async checkContractConstraints(from, role, targetAccount) {
    console.log('\n🔒 CONTRACT CONSTRAINT ANALYSIS\n');

    try {
      // Check if the caller has TRUSTEE role
      const callerRole = await this.roleControlContract.methods.getRole(from).call();
      console.log(`📋 Caller role: ${callerRole} (${this.getRoleName(callerRole)})`);
      
      if (parseInt(callerRole) !== 3) {
        console.log(`   ❌ CONSTRAINT VIOLATION: Caller must have TRUSTEE role (3), has ${callerRole}`);
        console.log(`   💡 SOLUTION: Assign TRUSTEE role to caller first`);
        return;
      }

      // Check if role is valid
      if (role < 0 || role > 3) {
        console.log(`   ❌ CONSTRAINT VIOLATION: Invalid role ${role}, must be 0-3`);
        return;
      }

      // Check if target account already has the role
      const targetCurrentRole = await this.roleControlContract.methods.getRole(targetAccount).call();
      console.log(`🎯 Target current role: ${targetCurrentRole} (${this.getRoleName(targetCurrentRole)})`);
      
      if (targetCurrentRole === role) {
        console.log(`   ⚠️  TARGET ALREADY HAS ROLE: Account already has role ${role}`);
        console.log(`   💡 This might cause a revert in some contract implementations`);
      }

      // Check role count limits (if any)
      try {
        const roleCount = await this.roleControlContract.methods.getRoleCount(role).call();
        console.log(`📊 Current role count for ${this.getRoleName(role)}: ${roleCount}`);
      } catch (countError) {
        console.log(`   ℹ️  Role count method not available`);
      }

      console.log(`\n🎯 LIKELY CAUSES:`);
      console.log(`   1. Contract logic prevents assigning same role twice`);
      console.log(`   2. Account management issue in Caliper vs diagnostics`);
      console.log(`   3. Transaction context differences (gas, nonce, etc.)`);

    } catch (error) {
      console.log(`❌ Constraint analysis failed: ${error.message}`);
    }
  }

  async compareCaliperVsDiagnostics() {
    console.log('\n🔄 CALIPER vs DIAGNOSTICS COMPARISON\n');

    const deployerAccount = this.networkConfig.ethereum.contractDeployerAddresses || 
                           this.networkConfig.ethereum.fromAddress;

    console.log(`📊 Configuration Comparison:`);
    console.log(`   Deployer Address: ${deployerAccount}`);
    console.log(`   From Address: ${this.networkConfig.ethereum.fromAddress}`);
    console.log(`   Contract Address: ${this.roleControlContract.options.address}`);

    // Check if Caliper might be using a different account
    const accounts = this.networkConfig.ethereum.accounts || [];
    console.log(`\n👥 Available Accounts:`);
    
    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      try {
        const role = await this.roleControlContract.methods.getRole(account.address).call();
        const balance = await this.web3.eth.getBalance(account.address);
        console.log(`   ${i}: ${account.address} - Role: ${this.getRoleName(role)}, Balance: ${this.web3.utils.fromWei(balance, 'ether')} ETH`);
      } catch (error) {
        console.log(`   ${i}: ${account.address} - Error checking: ${error.message}`);
      }
    }

    console.log(`\n💡 DEBUGGING HINTS:`);
    console.log(`   1. Caliper might be using a different account than diagnostics`);
    console.log(`   2. Check if workload specifies fromAddress correctly`);
    console.log(`   3. Verify account index selection in Caliper workload`);
  }

  async generateFixedWorkload() {
    console.log('\n🛠️  GENERATING FIXED CALIPER WORKLOAD\n');

    const deployerAccount = this.networkConfig.ethereum.contractDeployerAddresses || 
                           this.networkConfig.ethereum.fromAddress;

    const fixedWorkload = `'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');

/**
 * Fixed RoleControl assignRole workload
 * Addresses common execution revert issues
 */
class AssignRoleWorkload extends WorkloadModuleBase {
  constructor() {
    super();
    this.contractAddress = '${this.roleControlContract.options.address}';
    this.deployerAddress = '${deployerAccount}';
  }

  async initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext) {
    await super.initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext);
    
    this.operationType = roundArguments.operationType || 'assignRole';
    this.targetRole = roundArguments.targetRole || 1; // ISSUER by default
    
    // Get accounts and ensure we use the right one
    console.log('🔧 Workload initialized with:');
    console.log('   Contract:', this.contractAddress);
    console.log('   Deployer:', this.deployerAddress);
    console.log('   Operation:', this.operationType);
    console.log('   Target Role:', this.targetRole);
  }

  async submitTransaction() {
    try {
      // Get a target account (avoid assigning to deployer)
      const targetAccount = this.getTargetAccount();
      
      // Create the request with explicit account configuration
      const request = {
        contract: 'RoleControl',
        verb: 'assignRole',
        args: [this.targetRole, targetAccount],
        readOnly: false,
        // Explicitly specify the account to use
        fromAddress: this.deployerAddress,
        // Add gas configuration
        gas: {
          limit: 200000
        }
      };

      console.log(\`🚀 Submitting role assignment:\`);
      console.log(\`   Role: \${this.targetRole} (\${this.getRoleName(this.targetRole)})\`);
      console.log(\`   Target: \${targetAccount}\`);
      console.log(\`   From: \${this.deployerAddress}\`);

      const result = await this.sutAdapter.sendRequests(request);
      
      console.log(\`✅ Role assignment successful\`);
      return result;

    } catch (error) {
      console.error(\`❌ Role assignment failed: \${error.message}\`);
      
      // Enhanced error reporting
      console.error(\`   Contract: \${this.contractAddress}\`);
      console.error(\`   Operation: assignRole\`);
      console.error(\`   Args: role=\${this.targetRole}, account=\${this.getTargetAccount()}\`);
      
      throw error;
    }
  }

  getTargetAccount() {
    // Use configured accounts, avoiding the deployer
    if (this.sutAdapter.accounts && this.sutAdapter.accounts.length > 0) {
      // Find an account that's not the deployer
      for (const account of this.sutAdapter.accounts) {
        if (account.address.toLowerCase() !== this.deployerAddress.toLowerCase()) {
          return account.address;
        }
      }
      // Fallback to first account if all are deployer
      return this.sutAdapter.accounts[0].address;
    }
    
    // Fallback to a known account from network config
    return '${this.networkConfig.ethereum.accounts?.[0]?.address || '0xfe3b557e8fb62b89f4916b721be55ceb828dbd73'}';
  }

  getRoleName(role) {
    const roleNames = ['NONE', 'ISSUER', 'HOLDER', 'TRUSTEE'];
    return roleNames[role] || 'UNKNOWN';
  }
}

module.exports.createWorkloadModule = () => new AssignRoleWorkload();
`;

    console.log('Generated fixed workload:');
    console.log('```javascript');
    console.log(fixedWorkload);
    console.log('```');

    // Save to file
    try {
      const workloadPath = path.join(this.workspacePath, 'workloads/auth/assignRole-fixed.js');
      await fs.mkdir(path.dirname(workloadPath), { recursive: true });
      await fs.writeFile(workloadPath, fixedWorkload);
      console.log(`\n💾 Fixed workload saved to: ${workloadPath}`);
    } catch (writeError) {
      console.log(`⚠️  Could not save workload: ${writeError.message}`);
    }
  }

  getRoleName(role) {
    const roleNames = ['NONE', 'ISSUER', 'HOLDER', 'TRUSTEE'];
    return roleNames[role] || 'UNKNOWN';
  }

  async run() {
    try {
      await this.initialize();

      console.log('🚨 EXECUTION REVERT DEBUGGER');
      console.log('============================');

      await this.debugSpecificFailure();
      await this.compareCaliperVsDiagnostics();
      await this.generateFixedWorkload();

      console.log('\n📋 SUMMARY & NEXT STEPS');
      console.log('=======================');
      console.log('1. 🔍 Check the constraint analysis above');
      console.log('2. 🛠️  Use the generated fixed workload');
      console.log('3. ✅ Verify account configuration in Caliper');
      console.log('4. 🚀 Re-run benchmarks with fixes applied');

    } catch (error) {
      console.error(`💥 Debugger failed: ${error.message}`);
      console.error(error.stack);
    }
  }
}

// Run if called directly
if (require.main === module) {
  const debugTool = new ExecutionRevertDebugger();
  debugTool.run().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = ExecutionRevertDebugger;
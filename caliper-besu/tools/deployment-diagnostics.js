#!/usr/bin/env node

/**
 * Diagnose Smart Contract Deployment State
 * Checks if deployer was assigned TRUSTEE role during deployment
 */

const { Web3 } = require('web3');
const fs = require('fs');

class DeploymentDiagnostics {
  constructor() {
    this.web3 = null;
    this.networkConfig = null;
    this.roleControlContract = null;
  }

  async initialize() {
    // Load network configuration
    this.networkConfig = JSON.parse(fs.readFileSync('networks/ethereum/besu-network.json', 'utf8'));

    // Connect to Besu (convert WebSocket to HTTP for better compatibility)
    const besuUrl = this.networkConfig.ethereum.url.replace('ws://', 'http://').replace(':8546', ':8545');
    this.web3 = new Web3(besuUrl);

    // Initialize RoleControl contract
    const roleControlConfig = this.networkConfig.ethereum.contracts.RoleControl;
    this.roleControlContract = new this.web3.eth.Contract(roleControlConfig.abi, roleControlConfig.address);

    console.log(`🔗 Connected to Besu: ${besuUrl}`);
    console.log(`📋 RoleControl contract: ${roleControlConfig.address}`);
  }

  async checkDeploymentState() {
    console.log('\n🔍 DEPLOYMENT STATE DIAGNOSIS\n');

    // Get deployer address from network config
    const deployerAddress = this.networkConfig.ethereum.contractDeployerAddresses ||
      this.networkConfig.ethereum.fromAddress;

    console.log(`👤 Deployer address: ${deployerAddress}`);

    try {
      // Check deployer's role
      const deployerRole = await this.roleControlContract.methods.getRole(deployerAddress).call();
      const roleNames = ['NONE', 'ISSUER', 'HOLDER', 'TRUSTEE'];

      console.log(`📊 Deployer's current role: ${deployerRole} (${roleNames[deployerRole]})`);

      if (deployerRole == 3) { // TRUSTEE
        console.log(`✅ SUCCESS: Deployer has TRUSTEE role - constructor worked correctly`);
        return true;
      } else {
        console.log(`❌ ISSUE: Deployer does NOT have TRUSTEE role`);
        console.log(`   This means the constructor didn't assign TRUSTEE to msg.sender`);
        return false;
      }

    } catch (error) {
      console.error(`💥 Error checking deployer role: ${error.message}`);
      return false;
    }
  }

  async checkContractOwnership() {
    console.log('\n🔍 CONTRACT OWNERSHIP ANALYSIS\n');

    try {
      // Get contract creation transaction
      const deployerAddress = this.networkConfig.ethereum.contractDeployerAddresses ||
        this.networkConfig.ethereum.fromAddress;

      // Check if contract has any TRUSTEE at all
      console.log(`🔍 Scanning for existing TRUSTEE accounts...`);

      // Common accounts to check
      const accountsToCheck = [
        deployerAddress,
        this.networkConfig.ethereum.fromAddress,
        ...this.networkConfig.ethereum.accounts?.map(acc => acc.address) || []
      ].filter(addr => addr); // Remove undefined

      let foundTrustee = false;

      for (const address of accountsToCheck) {
        try {
          const role = await this.roleControlContract.methods.getRole(address).call();
          if (role == 3) { // TRUSTEE
            console.log(`👑 Found TRUSTEE: ${address}`);
            foundTrustee = true;
          } else if (role != 0) { // Not NONE
            console.log(`👤 Found role ${role}: ${address}`);
          }
        } catch (error) {
          // Skip invalid addresses
        }
      }

      if (!foundTrustee) {
        console.log(`🚨 CRITICAL: No TRUSTEE accounts found in the system!`);
        console.log(`   This means the contract constructor didn't assign any initial roles`);
      }

    } catch (error) {
      console.error(`💥 Error checking contract ownership: ${error.message}`);
    }
  }

  async simulateRoleAssignment() {
    console.log('\n🧪 ROLE ASSIGNMENT SIMULATION\n');

    const deployerAddress = this.networkConfig.ethereum.contractDeployerAddresses ||
      this.networkConfig.ethereum.fromAddress;
    const testTarget = '0x1234567890123456789012345678901234567890';

    try {
      // Try to estimate gas for role assignment
      const gasEstimate = await this.roleControlContract.methods.assignRole(1, testTarget).estimateGas({
        from: deployerAddress
      });

      console.log(`✅ Role assignment simulation successful`);
      console.log(`⛽ Gas estimate: ${gasEstimate}`);
      console.log(`🎯 The deployer CAN assign roles`);

    } catch (error) {
      console.log(`❌ Role assignment simulation failed`);
      console.log(`💥 Error: ${error.message}`);

      if (error.message.includes('Unauthorized') || error.message.includes('revert')) {
        console.log(`🔍 DIAGNOSIS: Deployer lacks TRUSTEE permissions`);
        console.log(`   Your assumption is CORRECT - constructor didn't assign TRUSTEE role`);
      }
    }
  }

  async provideSolutions() {
    console.log('\n💡 SOLUTIONS BASED ON DIAGNOSIS\n');

    const deployerAddress = this.networkConfig.ethereum.contractDeployerAddresses ||
      this.networkConfig.ethereum.fromAddress;

    console.log(`🛠️  Solution 1: Manual Role Assignment`);
    console.log(`   If you have access to a TRUSTEE account, manually assign TRUSTEE to deployer:`);
    console.log(`   contract.assignRole(3, "${deployerAddress}")\n`);

    console.log(`🛠️  Solution 2: Redeploy with Fixed Constructor`);
    console.log(`   Update your RoleControl constructor to assign TRUSTEE role:`);
    console.log(`   constructor() { roles[msg.sender] = ROLES.TRUSTEE; }\n`);

    console.log(`🛠️  Solution 3: Use Raw Transaction to Bootstrap`);
    console.log(`   Create initial TRUSTEE assignment during deployment script\n`);

    console.log(`🛠️  Solution 4: Factory Pattern`);
    console.log(`   Deploy through a factory that handles initial role assignment\n`);
  }

  async run() {
    try {
      await this.initialize();

      const hasCorrectRole = await this.checkDeploymentState();
      await this.checkContractOwnership();
      await this.simulateRoleAssignment();
      await this.provideSolutions();

      console.log('\n📊 DIAGNOSIS SUMMARY');
      console.log(`==================`);

      if (hasCorrectRole) {
        console.log(`✅ Your contracts are properly deployed with TRUSTEE permissions`);
        console.log(`🔍 The issue might be elsewhere - check account access in Caliper`);
      } else {
        console.log(`❌ Your assumption is CORRECT!`);
        console.log(`🎯 The deployer was NOT assigned TRUSTEE role during deployment`);
        console.log(`🛠️  You need to manually bootstrap the role system`);
      }

    } catch (error) {
      console.error(`💥 Diagnosis failed: ${error.message}`);
      console.error(`Stack: ${error.stack}`);
    }
  }
}

// Run if called directly
if (require.main === module) {
  const diagnostics = new DeploymentDiagnostics();
  diagnostics.run();
}

module.exports = DeploymentDiagnostics;
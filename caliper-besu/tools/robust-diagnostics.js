#!/usr/bin/env node

/**
 * Robust Deployment Diagnostics with Caliper Integration
 * Compatible with different Caliper versions and API variations
 */

const { Web3 } = require('web3');
const fs = require('fs').promises;
const path = require('path');

// Try to import Caliper modules with fallbacks
let ConfigUtil, CaliperLogger;
try {
  const caliperCore = require('@hyperledger/caliper-core');
  ConfigUtil = caliperCore.ConfigUtil;
  
  // Try different logger access patterns
  try {
    CaliperLogger = caliperCore.CaliperUtils?.getLogger || 
                   caliperCore.Logger?.getLogger ||
                   null;
  } catch (loggerError) {
    CaliperLogger = null;
  }
} catch (importError) {
  console.warn('⚠️  Caliper core not available, using standalone mode');
  ConfigUtil = null;
  CaliperLogger = null;
}

class RobustDeploymentDiagnostics {
  constructor() {
    this.web3 = null;
    this.networkConfig = null;
    this.ethereumConfig = null;
    this.roleControlContract = null;
    this.workspacePath = process.cwd();
    
    // Initialize logger with multiple fallback strategies
    this.initializeLogger();
  }

  initializeLogger() {
    if (CaliperLogger) {
      try {
        this.logger = CaliperLogger('deployment-diagnostics');
      } catch (error) {
        this.logger = this.createFallbackLogger();
      }
    } else {
      this.logger = this.createFallbackLogger();
    }
  }

  createFallbackLogger() {
    return {
      info: (msg) => console.log(`[INFO] ${new Date().toISOString()} ${msg}`),
      error: (msg) => console.error(`[ERROR] ${new Date().toISOString()} ${msg}`),
      warn: (msg) => console.warn(`[WARN] ${new Date().toISOString()} ${msg}`),
      debug: (msg) => console.log(`[DEBUG] ${new Date().toISOString()} ${msg}`)
    };
  }

  async initialize() {
    try {
      this.logger.info('🚀 Initializing Robust Deployment Diagnostics');

      // Load network configuration
      await this.loadNetworkConfig();
      
      // Initialize Web3 connection
      await this.initializeWeb3Connection();
      
      // Initialize RoleControl contract
      await this.initializeRoleControlContract();

      this.logger.info('✅ Initialization completed successfully');

    } catch (error) {
      this.logger.error(`Initialization failed: ${error.message}`);
      throw error;
    }
  }

  async loadNetworkConfig() {
    try {
      // Determine network config path with multiple strategies
      let networkConfigPath;
      
      if (ConfigUtil) {
        try {
          networkConfigPath = ConfigUtil.get(ConfigUtil.keys?.NetworkConfig) || 
                             ConfigUtil.get('caliper-networkconfig') ||
                             'networks/ethereum/besu-network.json';
          
          const workspace = ConfigUtil.get(ConfigUtil.keys?.Workspace) || 
                           ConfigUtil.get('caliper-workspace') ||
                           process.cwd();
          this.workspacePath = workspace;
        } catch (configError) {
          this.logger.warn(`ConfigUtil access failed: ${configError.message}`);
          networkConfigPath = 'networks/ethereum/besu-network.json';
        }
      } else {
        // Default path when Caliper is not available
        networkConfigPath = 'networks/ethereum/besu-network.json';
      }

      // Resolve full path
      const fullConfigPath = path.isAbsolute(networkConfigPath) 
        ? networkConfigPath 
        : path.resolve(this.workspacePath, networkConfigPath);

      this.logger.info(`Loading network config from: ${fullConfigPath}`);

      // Load and parse configuration
      const configData = await fs.readFile(fullConfigPath, 'utf8');
      this.networkConfig = JSON.parse(configData);
      
      // Validate configuration
      if (!this.networkConfig.ethereum) {
        throw new Error('Invalid network configuration: missing ethereum section');
      }

      this.ethereumConfig = this.networkConfig.ethereum;
      this.logger.info('✅ Network configuration loaded successfully');

    } catch (error) {
      this.logger.error(`Failed to load network configuration: ${error.message}`);
      throw new Error(`Network configuration loading failed: ${error.message}`);
    }
  }

  async initializeWeb3Connection() {
    try {
      let besuUrl = this.ethereumConfig.url;

      // Handle WebSocket to HTTP conversion for better compatibility
      if (besuUrl.startsWith('ws://')) {
        besuUrl = besuUrl.replace('ws://', 'http://').replace(':8546', ':8545');
        this.logger.info(`Converted WebSocket URL to HTTP: ${besuUrl}`);
      }

      // Initialize Web3
      this.web3 = new Web3(besuUrl);

      // Test connection
      const isConnected = await this.web3.eth.net.isListening();
      if (!isConnected) {
        throw new Error('Cannot connect to Ethereum node');
      }

      // Get network info
      const networkId = await this.web3.eth.net.getId();
      const blockNumber = await this.web3.eth.getBlockNumber();
      
      this.logger.info(`✅ Connected to network ID: ${networkId}, block: ${blockNumber}`);

    } catch (error) {
      this.logger.error(`Web3 connection failed: ${error.message}`);
      throw error;
    }
  }

  async initializeRoleControlContract() {
    try {
      const roleControlConfig = this.ethereumConfig.contracts?.RoleControl;
      
      if (!roleControlConfig) {
        throw new Error('RoleControl contract configuration not found');
      }

      if (!roleControlConfig.address) {
        throw new Error('RoleControl contract address not specified');
      }

      // Load contract ABI
      let contractABI;
      if (roleControlConfig.abi) {
        contractABI = roleControlConfig.abi;
      } else if (roleControlConfig.path) {
        const abiPath = path.resolve(this.workspacePath, roleControlConfig.path);
        const abiData = await fs.readFile(abiPath, 'utf8');
        const abiJson = JSON.parse(abiData);
        contractABI = abiJson.abi;
      } else {
        throw new Error('RoleControl contract ABI not found in configuration');
      }

      // Initialize contract
      this.roleControlContract = new this.web3.eth.Contract(
        contractABI, 
        roleControlConfig.address
      );

      this.logger.info(`✅ RoleControl contract initialized at: ${roleControlConfig.address}`);

    } catch (error) {
      this.logger.error(`RoleControl contract initialization failed: ${error.message}`);
      throw error;
    }
  }

  getDeployerAddress() {
    return this.ethereumConfig.contractDeployerAddresses || 
           this.ethereumConfig.fromAddress;
  }

  getConfiguredAccounts() {
    const accounts = [];
    
    // Add deployer address
    const deployerAddress = this.getDeployerAddress();
    if (deployerAddress) {
      accounts.push(deployerAddress);
    }

    // Add fromAddress if different
    if (this.ethereumConfig.fromAddress && this.ethereumConfig.fromAddress !== deployerAddress) {
      accounts.push(this.ethereumConfig.fromAddress);
    }

    // Add configured accounts
    if (this.ethereumConfig.accounts) {
      const accountAddresses = this.ethereumConfig.accounts.map(acc => acc.address);
      accounts.push(...accountAddresses);
    }

    // Remove duplicates and undefined values
    return [...new Set(accounts.filter(addr => addr))];
  }

  async checkDeploymentState() {
    console.log('\n🔍 DEPLOYMENT STATE DIAGNOSIS\n');

    const deployerAddress = this.getDeployerAddress();
    console.log(`👤 Deployer address: ${deployerAddress}`);

    try {
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
      this.logger.error(`Error checking deployer role: ${error.message}`);
      console.error(`💥 Error checking deployer role: ${error.message}`);
      return false;
    }
  }

  async checkContractOwnership() {
    console.log('\n🔍 CONTRACT OWNERSHIP ANALYSIS\n');

    try {
      const accountsToCheck = this.getConfiguredAccounts();
      
      console.log(`🔍 Scanning ${accountsToCheck.length} configured accounts for roles...`);
      
      let foundTrustee = false;
      const roleNames = ['NONE', 'ISSUER', 'HOLDER', 'TRUSTEE'];

      for (const address of accountsToCheck) {
        try {
          const role = await this.roleControlContract.methods.getRole(address).call();
          if (role == 3) { // TRUSTEE
            console.log(`👑 Found TRUSTEE: ${address}`);
            foundTrustee = true;
          } else if (role != 0) { // Not NONE
            console.log(`👤 Found ${roleNames[role]}: ${address}`);
          }
        } catch (error) {
          this.logger.warn(`Failed to check role for ${address}: ${error.message}`);
        }
      }

      if (!foundTrustee) {
        console.log(`🚨 CRITICAL: No TRUSTEE accounts found in the configured accounts!`);
      }

      return foundTrustee;

    } catch (error) {
      this.logger.error(`Contract ownership check failed: ${error.message}`);
      return false;
    }
  }

  async simulateRoleAssignment() {
    console.log('\n🧪 ROLE ASSIGNMENT SIMULATION\n');

    const deployerAddress = this.getDeployerAddress();
    const testTarget = '0x1234567890123456789012345678901234567890';

    try {
      // Get gas configuration
      const gasConfig = this.ethereumConfig.contracts?.RoleControl?.gas;
      const gasLimit = gasConfig?.assignRole || 120000;

      const gasEstimate = await this.roleControlContract.methods
        .assignRole(1, testTarget)
        .estimateGas({
          from: deployerAddress,
          gas: gasLimit
        });

      console.log(`✅ Role assignment simulation successful`);
      console.log(`⛽ Gas estimate: ${gasEstimate} (limit: ${gasLimit})`);
      console.log(`🎯 The deployer CAN assign roles`);
      return true;

    } catch (error) {
      console.log(`❌ Role assignment simulation failed`);
      console.log(`💥 Error: ${error.message}`);

      if (error.message.includes('Unauthorized') || 
          error.message.includes('revert') ||
          error.message.includes('execution reverted')) {
        console.log(`🔍 DIAGNOSIS: Deployer lacks TRUSTEE permissions`);
      }
      return false;
    }
  }

  async generateBootstrapSolution() {
    console.log('\n🛠️  BOOTSTRAP SOLUTION GENERATOR\n');

    const deployerAddress = this.getDeployerAddress();
    const contractAddress = this.ethereumConfig.contracts.RoleControl.address;

    // Generate a simple bootstrap script
    const bootstrapScript = `
// Bootstrap script to assign TRUSTEE role
const { Web3 } = require('web3');
const roleControlABI = ${JSON.stringify(this.roleControlContract.options.jsonInterface, null, 2)};

async function bootstrap() {
  const web3 = new Web3('${this.ethereumConfig.url}');
  const contract = new web3.eth.Contract(roleControlABI, '${contractAddress}');
  
  const deployerAddress = '${deployerAddress}';
  const deployerKey = '${this.ethereumConfig.contractDeployerAddressPrivateKeys || this.ethereumConfig.fromAddressPrivateKey}';
  
  try {
    // Create transaction
    const tx = contract.methods.assignRole(3, deployerAddress); // TRUSTEE = 3
    const gas = await tx.estimateGas({ from: deployerAddress });
    
    // Sign and send
    const signedTx = await web3.eth.accounts.signTransaction({
      to: '${contractAddress}',
      data: tx.encodeABI(),
      gas: gas + 10000,
      gasPrice: await web3.eth.getGasPrice()
    }, deployerKey);
    
    const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
    console.log('✅ TRUSTEE role assigned! Transaction:', receipt.transactionHash);
    
  } catch (error) {
    console.error('❌ Bootstrap failed:', error.message);
  }
}

bootstrap();
`;

    console.log('Generated bootstrap script:');
    console.log('```javascript');
    console.log(bootstrapScript);
    console.log('```');

    // Save to file
    try {
      const scriptPath = path.join(this.workspacePath, 'bootstrap-roles.js');
      await fs.writeFile(scriptPath, bootstrapScript);
      console.log(`\n💾 Bootstrap script saved to: ${scriptPath}`);
      console.log(`   Run with: node bootstrap-roles.js`);
    } catch (writeError) {
      console.log(`⚠️  Could not save bootstrap script: ${writeError.message}`);
    }
  }

  async run() {
    try {
      await this.initialize();

      console.log('\n🚀 ROBUST CALIPER DEPLOYMENT DIAGNOSTICS');
      console.log('==========================================');
      
      if (ConfigUtil) {
        console.log('✅ Caliper integration: ACTIVE');
      } else {
        console.log('⚠️  Caliper integration: STANDALONE MODE');
      }

      // Run diagnostics
      const hasCorrectRole = await this.checkDeploymentState();
      const hasTrustee = await this.checkContractOwnership();
      const canAssignRoles = await this.simulateRoleAssignment();

      // Generate solutions if needed
      if (!hasCorrectRole || !hasTrustee || !canAssignRoles) {
        await this.generateBootstrapSolution();
      }

      // Summary
      console.log('\n📊 DIAGNOSIS SUMMARY');
      console.log('===================');
      console.log(`🔧 Deployer TRUSTEE role: ${hasCorrectRole ? '✅' : '❌'}`);
      console.log(`👑 TRUSTEE exists: ${hasTrustee ? '✅' : '❌'}`);
      console.log(`⚡ Can assign roles: ${canAssignRoles ? '✅' : '❌'}`);

      if (hasCorrectRole && hasTrustee && canAssignRoles) {
        console.log('\n🎉 SUCCESS: Your deployment is ready for Caliper benchmarking!');
      } else {
        console.log('\n⚠️  ISSUES DETECTED: Use the generated bootstrap script to fix role assignments');
      }

    } catch (error) {
      this.logger.error(`Diagnosis failed: ${error.message}`);
      console.error(`\n💥 Fatal Error: ${error.message}`);
      process.exit(1);
    }
  }
}

// Run if called directly
if (require.main === module) {
  const diagnostics = new RobustDeploymentDiagnostics();
  diagnostics.run().catch(error => {
    console.error('💥 Fatal error:', error.message);
    process.exit(1);
  });
}

module.exports = RobustDeploymentDiagnostics;
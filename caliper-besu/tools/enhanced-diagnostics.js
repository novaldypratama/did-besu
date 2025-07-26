#!/usr/bin/env node

/**
 * Diagnose Smart Contract Deployment State using Caliper Core
 * Checks if deployer was assigned TRUSTEE role during deployment
 * Uses @hyperledger/caliper-core for proper configuration management
 */

const { Web3 } = require('web3');
const { ConfigUtil } = require('@hyperledger/caliper-core');
const CaliperUtils = require('@hyperledger/caliper-core').CaliperUtils;
const path = require('path');
const fs = require('fs').promises;

class DeploymentDiagnostics {
  constructor() {
    this.web3 = null;
    this.networkConfig = null;
    this.ethereumConfig = null;
    this.roleControlContract = null;
    
    // Initialize logger with fallback
    try {
      this.logger = CaliperUtils.getLogger('deployment-diagnostics');
    } catch (error) {
      // Fallback to console logging if Caliper logger is not available
      this.logger = {
        info: (msg) => console.log(`[INFO] ${msg}`),
        error: (msg) => console.error(`[ERROR] ${msg}`),
        warn: (msg) => console.warn(`[WARN] ${msg}`),
        debug: (msg) => console.log(`[DEBUG] ${msg}`)
      };
    }
  }

  async initialize() {
    try {
      // Initialize Caliper configuration system
      ConfigUtil.set(ConfigUtil.keys.NetworkConfig, 'networks/ethereum/besu-network.json');
      ConfigUtil.set(ConfigUtil.keys.Workspace, process.cwd());

      // Load network configuration using Caliper core
      this.networkConfig = await this.loadNetworkConfig();
      this.ethereumConfig = this.networkConfig.ethereum;

      if (!this.ethereumConfig) {
        throw new Error('Ethereum configuration not found in network config');
      }

      // Connect to Besu using Caliper's configuration
      await this.initializeWeb3Connection();
      
      // Initialize RoleControl contract
      await this.initializeRoleControlContract();

      this.logger.info('🔗 Connected to Besu using Caliper configuration');
      this.logger.info(`📋 RoleControl contract: ${this.ethereumConfig.contracts.RoleControl.address}`);

    } catch (error) {
      this.logger.error(`Initialization failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Load network configuration using Caliper core utilities
   */
  async loadNetworkConfig() {
    try {
      const networkConfigPath = ConfigUtil.get(ConfigUtil.keys.NetworkConfig) || 'networks/ethereum/besu-network.json';
      const workspacePath = ConfigUtil.get(ConfigUtil.keys.Workspace) || process.cwd();
      
      // Resolve the full path
      const fullConfigPath = path.isAbsolute(networkConfigPath) 
        ? networkConfigPath 
        : path.resolve(workspacePath, networkConfigPath);

      this.logger.info(`Loading network config from: ${fullConfigPath}`);

      // Load configuration file using Node.js fs with proper error handling
      let configContent;
      try {
        const configData = await fs.readFile(fullConfigPath, 'utf8');
        configContent = JSON.parse(configData);
      } catch (fileError) {
        // Fallback to synchronous require for JSON files
        if (fullConfigPath.endsWith('.json')) {
          delete require.cache[require.resolve(fullConfigPath)];
          configContent = require(fullConfigPath);
        } else {
          throw fileError;
        }
      }
      
      // Validate that it's an Ethereum configuration
      if (!configContent.ethereum) {
        throw new Error('Invalid network configuration: missing ethereum section');
      }

      this.logger.info('Network configuration loaded successfully');
      return configContent;

    } catch (error) {
      this.logger.error(`Failed to load network configuration: ${error.message}`);
      throw new Error(`Network configuration loading failed: ${error.message}`);
    }
  }

  /**
   * Initialize Web3 connection using Caliper configuration
   */
  async initializeWeb3Connection() {
    try {
      let besuUrl = this.ethereumConfig.url;

      // Handle WebSocket to HTTP conversion for better compatibility
      if (besuUrl.startsWith('ws://')) {
        besuUrl = besuUrl.replace('ws://', 'http://').replace(':8546', ':8545');
        this.logger.info(`Converted WebSocket URL to HTTP: ${besuUrl}`);
      }

      // Initialize Web3 with Caliper-managed configuration
      this.web3 = new Web3(besuUrl);

      // Test the connection
      const isConnected = await this.web3.eth.net.isListening();
      if (!isConnected) {
        throw new Error('Cannot connect to Ethereum node');
      }

      // Get network info for validation
      const networkId = await this.web3.eth.net.getId();
      const blockNumber = await this.web3.eth.getBlockNumber();
      
      this.logger.info(`Connected to network ID: ${networkId}, block: ${blockNumber}`);

    } catch (error) {
      this.logger.error(`Web3 connection failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Initialize RoleControl contract using Caliper configuration
   */
  async initializeRoleControlContract() {
    try {
      const roleControlConfig = this.ethereumConfig.contracts?.RoleControl;
      
      if (!roleControlConfig) {
        throw new Error('RoleControl contract configuration not found');
      }

      if (!roleControlConfig.address) {
        throw new Error('RoleControl contract address not specified');
      }

      // Load contract ABI - handle both inline ABI and file path
      let contractABI;
      if (roleControlConfig.abi) {
        contractABI = roleControlConfig.abi;
      } else if (roleControlConfig.path) {
        const abiPath = path.resolve(ConfigUtil.get(ConfigUtil.keys.Workspace) || process.cwd(), roleControlConfig.path);
        try {
          const abiData = await fs.readFile(abiPath, 'utf8');
          const abiJson = JSON.parse(abiData);
          contractABI = abiJson.abi;
        } catch (fileError) {
          // Fallback to require for JSON files
          if (abiPath.endsWith('.json')) {
            delete require.cache[require.resolve(abiPath)];
            const abiJson = require(abiPath);
            contractABI = abiJson.abi;
          } else {
            throw fileError;
          }
        }
      } else {
        throw new Error('RoleControl contract ABI not found in configuration');
      }

      // Initialize contract instance
      this.roleControlContract = new this.web3.eth.Contract(
        contractABI, 
        roleControlConfig.address
      );

      this.logger.info(`RoleControl contract initialized at: ${roleControlConfig.address}`);

    } catch (error) {
      this.logger.error(`RoleControl contract initialization failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get deployer address from Caliper configuration
   */
  getDeployerAddress() {
    return this.ethereumConfig.contractDeployerAddresses || 
           this.ethereumConfig.fromAddress;
  }

  /**
   * Get configured accounts from Caliper network config
   */
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
      // Check deployer's role using Caliper-managed contract
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
        console.log(`   This means the contract constructor didn't assign any initial roles`);
      }

      return foundTrustee;

    } catch (error) {
      this.logger.error(`Contract ownership check failed: ${error.message}`);
      console.error(`💥 Error checking contract ownership: ${error.message}`);
      return false;
    }
  }

  async simulateRoleAssignment() {
    console.log('\n🧪 ROLE ASSIGNMENT SIMULATION\n');

    const deployerAddress = this.getDeployerAddress();
    const testTarget = '0x1234567890123456789012345678901234567890';

    try {
      // Get gas configuration from Caliper config
      const gasConfig = this.ethereumConfig.contracts?.RoleControl?.gas;
      const gasLimit = gasConfig?.assignRole || 120000; // Default from config

      // Try to estimate gas for role assignment
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
        console.log(`   Your assumption is CORRECT - constructor didn't assign TRUSTEE role`);
      }
      return false;
    }
  }

  async provideSolutions() {
    console.log('\n💡 SOLUTIONS BASED ON DIAGNOSIS\n');

    const deployerAddress = this.getDeployerAddress();
    const contractAddress = this.ethereumConfig.contracts.RoleControl.address;

    console.log(`🛠️  Solution 1: Manual Role Assignment via Caliper`);
    console.log(`   Create a Caliper workload to bootstrap TRUSTEE role:`);
    console.log(`   - Target contract: ${contractAddress}`);
    console.log(`   - Assign TRUSTEE to: ${deployerAddress}\n`);

    console.log(`🛠️  Solution 2: Update Network Configuration`);
    console.log(`   Add role initialization in your deployment script:`);
    console.log(`   - Ensure constructor assigns msg.sender as TRUSTEE`);
    console.log(`   - Update besu-network.json with correct deployer\n`);

    console.log(`🛠️  Solution 3: Use Caliper's Account Management`);
    console.log(`   Leverage Caliper's account configuration:`);
    console.log(`   - Verify fromAddress has necessary permissions`);
    console.log(`   - Check contractDeployerAddresses configuration\n`);

    console.log(`🛠️  Solution 4: Bootstrap Script with Caliper Core`);
    console.log(`   Create a bootstrap workload that handles initial setup`);
    console.log(`   - Use Caliper's transaction management`);
    console.log(`   - Handle gas estimation and retry logic\n`);
  }

  async generateCaliperBootstrap() {
    console.log('\n🔧 CALIPER BOOTSTRAP WORKLOAD GENERATOR\n');

    const deployerAddress = this.getDeployerAddress();
    const contractAddress = this.ethereumConfig.contracts.RoleControl.address;

    const bootstrapWorkload = `
// Bootstrap workload to assign initial TRUSTEE role
const { WorkloadModuleBase } = require('@hyperledger/caliper-core');

class RoleBootstrap extends WorkloadModuleBase {
  async initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext) {
    await super.initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext);
    
    this.deployerAddress = '${deployerAddress}';
    this.contractAddress = '${contractAddress}';
  }

  async submitTransaction() {
    const request = {
      contract: 'RoleControl',
      verb: 'assignRole',
      args: [3, this.deployerAddress], // TRUSTEE role = 3
      readOnly: false
    };

    await this.sutAdapter.sendRequests(request);
  }
}

module.exports.createWorkloadModule = () => new RoleBootstrap();
`;

    console.log('Generated bootstrap workload:');
    console.log(bootstrapWorkload);
  }

  async run() {
    try {
      // Initialize using Caliper core
      await this.initialize();

      console.log('🚀 CALIPER-POWERED DEPLOYMENT DIAGNOSTICS');
      console.log('==========================================\n');

      // Run diagnostics
      const hasCorrectRole = await this.checkDeploymentState();
      const hasTrustee = await this.checkContractOwnership();
      const canAssignRoles = await this.simulateRoleAssignment();

      // Provide solutions
      await this.provideSolutions();
      await this.generateCaliperBootstrap();

      // Summary
      console.log('\n📊 CALIPER DIAGNOSIS SUMMARY');
      console.log('============================');

      if (hasCorrectRole && hasTrustee && canAssignRoles) {
        console.log(`✅ Your contracts are properly deployed with TRUSTEE permissions`);
        console.log(`🎯 Caliper should be able to run SSI workloads successfully`);
      } else {
        console.log(`❌ Configuration issues detected!`);
        console.log(`🔧 Deployer TRUSTEE role: ${hasCorrectRole ? '✅' : '❌'}`);
        console.log(`👑 TRUSTEE exists: ${hasTrustee ? '✅' : '❌'}`);
        console.log(`⚡ Can assign roles: ${canAssignRoles ? '✅' : '❌'}`);
        console.log(`🛠️  Use the provided solutions to fix these issues`);
      }

    } catch (error) {
      this.logger.error(`Diagnosis failed: ${error.message}`);
      console.error(`💥 Diagnosis failed: ${error.message}`);
      console.error(`Stack: ${error.stack}`);
      process.exit(1);
    }
  }
}

// Run if called directly
if (require.main === module) {
  const diagnostics = new DeploymentDiagnostics();
  diagnostics.run().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = DeploymentDiagnostics;
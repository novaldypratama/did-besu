'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');
const { ethers } = require('ethers');  // Add ethers.js for direct WebSocket support

// SSI Contract names - must match network configuration
const SSI_CONTRACTS = {
  ROLE_CONTROL: 'RoleControl',
  DID_REGISTRY: 'DidRegistry',
  CREDENTIAL_REGISTRY: 'CredentialRegistry'
};

// SSI Operation types
const SSI_OPERATIONS = {
  // Role operations
  ASSIGN_ROLE: 'assignRole',
  REVOKE_ROLE: 'revokeRole',
  GET_ROLE: 'getRole',
  
  // DID operations  
  CREATE_DID: 'createDid',
  UPDATE_DID: 'updateDid',
  RESOLVE_DID: 'resolveDid',
  
  // Credential operations
  ISSUE_CREDENTIAL: 'issueCredential',
  UPDATE_CREDENTIAL_STATUS: 'updateCredentialStatus',
  RESOLVE_CREDENTIAL: 'resolveCredential'
};

// Read-only operations (don't require gas/transaction)
const READ_ONLY_OPERATIONS = new Set([
  SSI_OPERATIONS.GET_ROLE,
  SSI_OPERATIONS.RESOLVE_DID,
  SSI_OPERATIONS.RESOLVE_CREDENTIAL
]);

// SSI Role Constants
const SSI_ROLES = {
  NONE: 0,
  ISSUER: 1,
  HOLDER: 2,
  TRUSTEE: 3
};

/**
 * Simplified SSI Operation Base
 * Handles SSI operations using Caliper's standard Ethereum adapter
 */
class SimplifiedSSIOperationBase extends WorkloadModuleBase {
  /**
   * Initialize the SSI workload module
   */
  async initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext) {
    await super.initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext);
    
    // Initialize basic configuration
    this.workerIndex = workerIndex;
    this.totalWorkers = totalWorkers;
    this.roundIndex = roundIndex;

    // Validate connector is Ethereum
    this.assertConnectorType();

    // Initialize SSI configuration
    this.initializeSSIConfiguration();
    
    // Setup account management
    await this.setupAccountManagement();

    // Validate required contracts exist
    this.validateContractAvailability();

    // Initialize state manager if needed (must be implemented by subclass)
    this.ssiState = this.createSSIState();

    console.log(`🔗 Worker ${this.workerIndex} initialized with account: ${this.fromAddress}`);
  }

  /**
   * Override to provide an SSI State Manager instance
   * @protected
   */
  createSSIState() {
    throw new Error('createSSIState must be implemented by subclass');
  }

  /**
   * Ensures the connector type is Ethereum
   * @protected
   */
  assertConnectorType() {
    this.connectorType = this.sutAdapter.getType();
    if (this.connectorType !== 'ethereum') {
      throw new Error(`SSI workload error: Connector type ${this.connectorType} is not supported; expected: ethereum`);
    }
  }

  /**
   * Initialize SSI configuration from round arguments
   * @protected
   */
  initializeSSIConfiguration() {
    // Extract required configuration
    const requiredSettings = ['gasLimit', 'chainId'];
    
    requiredSettings.forEach(setting => {
      if (!this.roundArguments.hasOwnProperty(setting)) {
        throw new Error(`SSI workload error: required setting "${setting}" is missing from benchmark configuration`);
      }
    });
    
    // Get Besu endpoint (support both WebSocket and HTTP)
    let besuEndpoint = this.roundArguments.besuEndpoint;
    
    // If no explicit WebSocket endpoint is provided, try to derive one
    if (!besuEndpoint) {
      // Try to extract from Caliper network config
      try {
        if (this.sutAdapter.ethereumConfig?.url) {
          besuEndpoint = this.sutAdapter.ethereumConfig.url;
        }
      } catch (error) {
        console.warn(`⚠️ Could not determine Besu endpoint from config: ${error.message}`);
        // Default to localhost if no endpoint found
        besuEndpoint = 'ws://localhost:8546';
      }
    }
    
    // Prefer WebSocket connection if available
    if (!besuEndpoint.startsWith('ws://') && !besuEndpoint.startsWith('wss://')) {
      // Try to derive WebSocket endpoint from HTTP
      const wsEndpoint = besuEndpoint.replace(/^http/, 'ws').replace(/8545$/, '8546');
      console.log(`⚠️ Converting HTTP endpoint to WebSocket: ${besuEndpoint} → ${wsEndpoint}`);
      besuEndpoint = wsEndpoint;
    }
    
    // Store SSI configuration
    this.ssiConfig = {
      gasLimit: this.roundArguments.gasLimit || 12000000,
      chainId: this.roundArguments.chainId || 1337,
      besuEndpoint: besuEndpoint,
      contractAddresses: this.roundArguments.contractAddresses || {},
      gasConfig: this.roundArguments.gasConfig || {}
    };

    console.log(`⚙️ SSI Configuration loaded for worker ${this.workerIndex}`);
    console.log(`📡 Using Besu endpoint: ${this.ssiConfig.besuEndpoint}`);
  }

  /**
   * Setup account management using Caliper's standard adapter
   * @protected
   */
  async setupAccountManagement() {
    // Initialize nonce tracker
    this.nonceTracker = {};

    // Try to use available accounts from network config or adapter
    const networkAccounts = this.getNetworkAccounts();
    
    if (networkAccounts && networkAccounts.length > 0) {
      // Select account based on worker index
      const availableAccounts = networkAccounts.length;
      this.clientIdx = this.workerIndex % availableAccounts;
      this.fromAddress = networkAccounts[this.clientIdx].address;
      
      console.log(`👤 Worker ${this.workerIndex} using network account ${this.clientIdx}: ${this.fromAddress}`);
    } else {
      // Fallback to connector's default account
      this.fromAddress = this.sutAdapter.defaultAccount || null;
      
      if (!this.fromAddress) {
        throw new Error('No accounts available from network config or connector defaults');
      }
      
      console.log(`👤 Worker ${this.workerIndex} using default account: ${this.fromAddress}`);
    }

    // Initialize nonce tracker for this account
    this.nonceTracker[this.fromAddress] = 3;
  }

  /**
   * Get accounts from network configuration
   * @returns {Array|null} Array of account objects or null if not found
   * @protected
   */
  getNetworkAccounts() {
    try {
      // Try multiple paths to network accounts
      if (this.sutAdapter.context?.networkConfiguration?.ethereum?.accounts) {
        return this.sutAdapter.context.networkConfiguration.ethereum.accounts;
      }
      
      if (this.sutAdapter.networkConfiguration?.ethereum?.accounts) {
        return this.sutAdapter.networkConfiguration.ethereum.accounts;
      }
      
      if (this.sutAdapter.ethereumConfig?.accounts) {
        return this.sutAdapter.ethereumConfig.accounts;
      }
      
      return null;
    } catch (error) {
      console.warn(`⚠️ Could not access network accounts: ${error.message}`);
      return null;
    }
  }

  /**
   * Validate that required contracts are available
   * @protected
   */
  validateContractAvailability() {
    console.log(`🔍 Validating contract availability...`);

    // Ensure contracts exist in sutAdapter
    if (!this.sutAdapter.ethereumConfig?.contracts) {
      throw new Error('sutAdapter.ethereumConfig.contracts is missing');
    }

    // Check for required SSI contracts
    const requiredSSIContracts = Object.values(SSI_CONTRACTS);
    
    for (const contractName of requiredSSIContracts) {
      const contract = this.sutAdapter.ethereumConfig?.contracts[contractName];
      
      if (!contract) {
        throw new Error(`${contractName} contract not found in sutAdapter`);
      }
      
      if (typeof contract !== 'object') {
        throw new Error(`${contractName} is not a valid contract object`);
      }
      
      console.log(`✅ ${contractName} contract validated`);
    }
  }

  /**
   * Create a Caliper-compatible request for SSI operations
   * @param {string} contractName - Contract name matching network config
   * @param {string} operation - Contract function to call
   * @param {Object} args - Function arguments
   * @param {Object} options - Additional options
   * @returns {Object} Caliper connector request
   * @protected
   */
  createSSIRequest(contractName, operation, args, options = {}) {
    const isReadOnly = READ_ONLY_OPERATIONS.has(operation);

    // For read-only operations, use standard Caliper approach
    if (isReadOnly) {
      // Create basic request for read-only operations
      const request = {
        contract: contractName,
        verb: operation,
        args: Object.values(args),
        readOnly: true,
        fromAddress: this.fromAddress,
        fromAddressPrivateKey: this.fromAddressPrivateKey,
        ...options
      };
      
      return request;
    }
    
    // For write operations, prepare for WebSocket-based execution
    // This is for use with executeSSIOperationWithWebSocket
    return {
      contractName,
      operation,
      args,
      isReadOnly: false,
      fromAddress: this.fromAddress,
      gasLimit: this.getGasLimitFromConfig(contractName, operation),
      ...options
    };
  }

  /**
   * Get gas limit from configuration with fallbacks
   * @param {string} contractName - Contract name
   * @param {string} operation - Operation name
   * @returns {number} Gas limit
   * @protected
   */
  getGasLimitFromConfig(contractName, operation) {
    // Try custom gas config first
    if (this.ssiConfig.gasConfig?.[contractName]?.[operation]) {
      return this.ssiConfig.gasConfig[contractName][operation];
    }

    // Fallback to network config
    try {
      const networkGas = this.sutAdapter.ethereumConfig.contracts[contractName].gas;
      const functionGas = this.sutAdapter.ethereumConfig.contracts[contractName].functions;
      if (networkGas && functionGas[operation]) {
        return functionGas[operation];
      }
    } catch (error) {
      // Continue to fallback values
    }

    // Fallback to reasonable defaults
    const defaultGasLimits = {
      'assignRole': 200000,
      'revokeRole': 100000,
      'createDid': 200000,
      'updateDid': 100000,
      'issueCredential': 250000,
      'updateCredentialStatus': 150000,
      // Read operations
      'getRole': 80000,
      'resolveDid': 80000,
      'resolveCredential': 80000
    };

    return defaultGasLimits[operation] || 200000;
  }

  /**
   * Execute an SSI operation using appropriate connection method
   * @param {string} contractName - Contract name
   * @param {string} operation - Operation name
   * @param {Object} args - Operation arguments
   * @param {Object} options - Additional options
   * @returns {Promise} Operation result
   * @protected
   */
  async executeSSIOperation(contractName, operation, args, options = {}) {
    const isReadOnly = READ_ONLY_OPERATIONS.has(operation);
    
    // Use WebSocket for write operations, standard Caliper for read-only
    if (isReadOnly) {
      return this.executeSSIOperationWithCaliper(contractName, operation, args, options);
    } else {
      return this.executeSSIOperationWithWebSocket(contractName, operation, args, options);
    }
  }

  /**
   * Execute an SSI operation using Caliper's standard pattern (for read-only operations)
   * @param {string} contractName - Contract name
   * @param {string} operation - Operation name
   * @param {Object} args - Operation arguments
   * @param {Object} options - Additional options
   * @returns {Promise} Operation result
   * @protected
   */
  async executeSSIOperationWithCaliper(contractName, operation, args, options = {}) {
    const startTime = Date.now();

    try {
      // Create request using standard Caliper connector
      const request = this.createSSIRequest(contractName, operation, args, options);
      
      // Use sutAdapter.sendRequests to execute the operation
      const result = await this.sutAdapter.sendRequests(request);
      
      const executionTime = Date.now() - startTime;
      console.log(`✅ ${contractName}.${operation} completed in ${executionTime}ms (Caliper)`);
      
      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error(`❌ ${contractName}.${operation} failed after ${executionTime}ms (Caliper): ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Execute an SSI operation using direct WebSocket connection (for write operations)
   * @param {string} contractName - Contract name
   * @param {string} operation - Operation name
   * @param {Object} args - Operation arguments
   * @param {Object} options - Additional options
   * @returns {Promise} Operation result
   * @protected
   */
  async executeSSIOperationWithWebSocket(contractName, operation, args, options = {}) {
    const startTime = Date.now();

    try {
      // Lazy-initialize the WebSocket provider if needed
      if (!this.provider) {
        this.provider = new ethers.WebSocketProvider(this.ssiConfig.besuEndpoint);
        console.log(`🔌 WebSocket provider connected to ${this.ssiConfig.besuEndpoint}`);
      }
      
      // Lazy-initialize wallets
      if (!this.wallets) {
        this.wallets = {};
      }
      
      // Get or create wallet for this client
      if (!this.wallets[this.fromAddress]) {
        // Get private key from Caliper's wallet
        const privateKey = this.sutAdapter.ethereumConfig?.fromAddressPrivateKey ||
                           this.sutAdapter.ethereumConfig?.wallet?.get(this.fromAddress);
        if (!privateKey) {
          throw new Error(`No private key found for ${this.fromAddress}`);
        }
        
        this.wallets[this.fromAddress] = new ethers.Wallet(privateKey, this.provider);
        console.log(`🔑 Created wallet for ${this.fromAddress.substring(0, 10)}...`);
      }
      
      // Get contract ABI from network config
      const contractABI = this.sutAdapter.ethereumConfig?.contracts?.[contractName].abi;
      if (!contractABI) {
        throw new Error(`ABI not found for contract ${contractName}`);
      }
      
      // Get contract address from configuration
      const contractAddress = this.ssiConfig.contractAddresses[contractName] || 
                             this.sutAdapter.ethereumConfig?.contracts?.[contractName]?.address;
      
      if (!contractAddress) {
        throw new Error(`Address not found for contract ${contractName}`);
      }
      
      // Create contract instance
      const contract = new ethers.Contract(
        contractAddress,
        contractABI,
        this.wallets[this.fromAddress]
      );
      
      // Prepare transaction parameters
      const gasLimit = options.gasLimit || this.getGasLimitFromConfig(contractName, operation);
      
      // Create transaction options
      const txOptions = {
        gasLimit: ethers.getBigInt(gasLimit),
      };
      
      // Add gas price if configured
      if (this.ssiConfig.gasConfig?.price) {
        txOptions.gasPrice = ethers.getBigInt(this.ssiConfig.gasConfig.price);
      }
      
      // Execute transaction
      console.log(`📤 Sending ${contractName}.${operation} via WebSocket`);
      
      // Convert args to array if needed
      const argsArray = Array.isArray(args) ? args : Object.values(args);
      
      // Execute the transaction
      const tx = await contract[operation](...argsArray, txOptions);
      
      // Wait for transaction to be mined
      console.log(`⏳ Waiting for transaction ${tx.hash} to be mined...`);
      const receipt = await tx.wait();
      
      const executionTime = Date.now() - startTime;
      console.log(`✅ ${contractName}.${operation} completed in ${executionTime}ms (WebSocket), hash: ${receipt.hash}`);
      
      return receipt;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error(`❌ ${contractName}.${operation} failed after ${executionTime}ms (WebSocket): ${error.message}`);
      throw error;
    }
  }
  /**
   * Clean up resources when the workload module is done
   */
  async cleanupWorkloadModule() {
    // Close any open WebSocket connections
    if (this.provider) {
      try {
        await this.provider.destroy();
        console.log('🔌 WebSocket provider disconnected');
      } catch (error) {
        console.warn(`⚠️ Error disconnecting WebSocket provider: ${error.message}`);
      }
    }
    
    // Cleanup wallets
    if (this.wallets) {
      this.wallets = {};
    }
    
    // Call parent cleanup
    await super.cleanupWorkloadModule();
  }
}

// Export constants for use in workload modules
SimplifiedSSIOperationBase.CONTRACTS = SSI_CONTRACTS;
SimplifiedSSIOperationBase.OPERATIONS = SSI_OPERATIONS;
SimplifiedSSIOperationBase.ROLES = SSI_ROLES;

module.exports = SimplifiedSSIOperationBase;
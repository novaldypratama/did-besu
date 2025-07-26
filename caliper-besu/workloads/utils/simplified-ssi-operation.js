'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');
const Web3SignerClient = require('./web3-signer-client');

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
 * Simplified SSI Operation Base with Web3Signer Integration
 * Handles transaction signing using Web3Signer for Besu security architecture
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

    // Setup Web3Signer client
    this.setupWeb3Signer();
    
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
    const requiredSettings = ['gasLimit', 'chainId', 'web3signerUrl'];
    
    requiredSettings.forEach(setting => {
      if (!this.roundArguments.hasOwnProperty(setting)) {
        throw new Error(`SSI workload error: required setting "${setting}" is missing from benchmark configuration`);
      }
    });
    
    // Store SSI configuration
    this.ssiConfig = {
      gasLimit: this.roundArguments.gasLimit || 12000000,
      chainId: this.roundArguments.chainId || 1337,
      web3signerUrl: this.roundArguments.web3signerUrl,
      besuEndpoint: this.roundArguments.besuEndpoint,
      contractAddresses: this.roundArguments.contractAddresses || {},
      gasConfig: this.roundArguments.gasConfig || {}
    };

    console.log(`⚙️ SSI Configuration loaded for worker ${this.workerIndex}`);
  }

  /**
   * Setup Web3Signer client for transaction signing
   * @protected
   */
  setupWeb3Signer() {
    this.web3Signer = new Web3SignerClient(
      this.ssiConfig.web3signerUrl,
      this.ssiConfig.chainId
    );
    console.log(`🔒 Web3Signer client initialized for worker ${this.workerIndex}`);
  }

  /**
   * Setup account management with Web3Signer integration
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
    this.nonceTracker[this.fromAddress] = 0;
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
      const contract = this.sutAdapter.ethereumConfig.contracts[contractName];
      
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

    // Create basic request
    const request = {
      contract: contractName,
      verb: operation,
      args: Object.values(args),
      readOnly: isReadOnly,
      fromAddress: this.fromAddress,
      ...options
    };

    // Add transaction-specific fields for write operations
    if (!isReadOnly) {
      request.gas = {
        price: 10000000000, // Use network default for private network
        limit: this.getGasLimitFromConfig(contractName, operation)
      };
      
      // Add Web3Signer integration for signed transactions
      request.useRawTransaction = true;
      request.signTransactionCallback = async (txData) => {
        // Use Web3Signer to sign the transaction
        return await this.web3Signer.signTransaction(
          { ...txData, methodName: operation },
          this.fromAddress
        );
      };
    }

    return request;
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
      if (networkGas && networkGas[operation]) {
        return networkGas[operation];
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
   * Execute an SSI operation using Caliper's standard pattern
   * @param {string} contractName - Contract name
   * @param {string} operation - Operation name
   * @param {Object} args - Operation arguments
   * @param {Object} options - Additional options
   * @returns {Promise} Operation result
   * @protected
   */
  async executeSSIOperation(contractName, operation, args, options = {}) {
    const startTime = Date.now();

    try {
      // Create request with Web3Signer callback for transaction signing
      const request = this.createSSIRequest(contractName, operation, args, options);
      
      // Use sutAdapter.sendRequests to execute the operation
      const result = await this.sutAdapter.sendRequests(request);
      
      const executionTime = Date.now() - startTime;
      console.log(`✅ ${contractName}.${operation} completed in ${executionTime}ms`);
      
      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error(`❌ ${contractName}.${operation} failed after ${executionTime}ms: ${error.message}`);
      throw error;
    }
  }
}

// Export constants for use in workload modules
SimplifiedSSIOperationBase.CONTRACTS = SSI_CONTRACTS;
SimplifiedSSIOperationBase.OPERATIONS = SSI_OPERATIONS;
SimplifiedSSIOperationBase.ROLES = SSI_ROLES;

module.exports = SimplifiedSSIOperationBase;
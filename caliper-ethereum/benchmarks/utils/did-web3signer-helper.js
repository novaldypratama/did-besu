'use strict';

const axios = require('axios');
const { Web3 } = require('web3');

/**
 * Enhanced helper class for interacting with Web3Signer
 * optimized for SSI/DID benchmarking with Caliper
 */
class DIDWeb3SignerHelper {
  /**
   * Create a new DIDWeb3SignerHelper
   * @param {string} endpoint - The Web3Signer endpoint URL
   * @param {string} besuEndpoint - The Besu node endpoint
   * @param {number} chainId - The chain ID for transactions
   * @param {number} workerIndex - The Caliper worker index
   * @param {number} totalWorkers - Total number of Caliper workers
   */
  constructor(
    endpoint = 'http://172.16.239.40:8545',
    besuEndpoint = 'http://172.16.239.15:8545',
    chainId = 1337,
    workerIndex = 0,
    totalWorkers = 1
  ) {
    this.endpoint = endpoint;
    this.besuEndpoint = besuEndpoint;
    this.chainId = chainId;
    this.workerIndex = workerIndex;
    this.totalWorkers = totalWorkers;

    // Initialize Web3 instances
    this.web3 = new Web3(besuEndpoint);
    this.web3signer = new Web3(endpoint);

    // Cache for accounts and nonces
    this.accounts = [];
    this.accountNonces = {};
    this._txCount = 0;

    // Map to store public key to address mappings
    this.publicKeyToAddress = new Map();

    // DID Registry ABI snippets for common operations
    this.didRegistryABI = {
      registerDID: {
        "inputs": [
          { "internalType": "string", "name": "did", "type": "string" },
          { "internalType": "string", "name": "publicKey", "type": "string" },
          { "internalType": "string", "name": "serviceEndpoint", "type": "string" },
          { "internalType": "enum DIDRegistry.Role", "name": "role", "type": "uint8" }
        ],
        "name": "registerDID",
        "stateMutability": "nonpayable",
        "type": "function"
      },
      updateDID: {
        "inputs": [
          { "internalType": "string", "name": "did", "type": "string" },
          { "internalType": "string", "name": "publicKey", "type": "string" },
          { "internalType": "string", "name": "serviceEndpoint", "type": "string" }
        ],
        "name": "updateDID",
        "stateMutability": "nonpayable",
        "type": "function"
      },
      deactivateDID: {
        "inputs": [{ "internalType": "string", "name": "did", "type": "string" }],
        "name": "deactivateDID",
        "stateMutabiity": "nonpayable",
        "type": "function"
      },
      resolveDID: {
        "inputs": [{ "internalType": "string", "name": "did", "type": "string" }],
        "name": "resolveDID",
        "stateMutability": "view",
        "type": "function"
      }
    };
  }

  /**
   * Initialize the helper by loading available accounts
   * @param {boolean} assignAccountsToWorkers - If true, assigns accounts to workers
   * @returns {Promise<Array<string>>} - The accounts available to this worker
   */
  async initialize(assignAccountsToWorkers = true) {
    try {
      // Check if Web3Signer is available
      const isAvailable = await this.isAvailable();
      if (!isAvailable) {
        throw new Error('Web3Signer service is not available');
      }

      // Get all available signers from Web3Signer
      this.accounts = await this.getAvailableSigners();
      console.log(`Web3Signer has ${this.accounts.length} available accounts: ${JSON.stringify(this.accounts)}`);

      if (this.accounts.length === 0) {
        throw new Error('No accounts available in Web3Signer');
      }

      // Assign accounts to workers if requested
      if (assignAccountsToWorkers) {
        this.accounts = this.assignAccountsToWorker(this.accounts);
      }

      // Initialize nonces for all accounts
      await this.initializeNonces();

      return this.accounts;
    } catch (error) {
      console.error('Failed to initialize DIDWeb3SignerHelper:', error);
      // Return fallback accounts in case of error
      return this.getFallbackAccounts();
    }
  }

  /**
   * Get a list of fallback accounts from hard-coded values
   * @returns {Array<string>} List of fallback account addresses
   */
  getFallbackAccounts() {
    const fallbackAccounts = [
      '0x06d06c366b213f716b51bca6dc1874afc05467d0',
      '0x2d501ff683a6dcb43b4b12cf334ea7a9692a9f1c',
      '0x8dd478dee59d3b7c16a2e34cb5d321ed23d2677d',
      '0xc9c913c8c3c1cd416d80a0abf475db2062f161f6',
      '0x9b790656b9ec0db1936ed84b3bea605873558198',
      '0xe43f47c497e0eFC3fe96a85B2041aFF2F0d317A5'
    ];

    // Assign fallback accounts based on worker index
    const workerAccounts = [];
    for (let i = this.workerIndex; i < fallbackAccounts.length; i += this.totalWorkers) {
      workerAccounts.push(fallbackAccounts[i]);
    }

    console.warn(`Using ${workerAccounts.length} fallback accounts for worker ${this.workerIndex}`);
    return workerAccounts;
  }

  /**
   * Assign accounts to workers using a round-robin approach
   * @param {Array<string>} allAccounts - All available accounts
   * @returns {Array<string>} Accounts assigned to this worker
   */
  assignAccountsToWorker(allAccounts) {
    const workerAccounts = [];

    // Assign accounts to workers in a round-robin fashion
    for (let i = this.workerIndex; i < allAccounts.length; i += this.totalWorkers) {
      workerAccounts.push(allAccounts[i]);
    }

    console.log(`Worker ${this.workerIndex} assigned ${workerAccounts.length} accounts: ${JSON.stringify(workerAccounts)}`);
    return workerAccounts;
  }

  /**
   * Initialize nonces for all accounts assigned to this worker
   */
  async initializeNonces() {
    for (const account of this.accounts) {
      try {
        const nonce = await this.web3.eth.getTransactionCount(account, 'pending');
        this.accountNonces[account] = parseInt(nonce);
        console.log(`Initialized nonce for account ${account}: ${this.accountNonces[account]}`);
      } catch (error) {
        console.error(`Error initializing nonce for account ${account}:`, error);
        // Start with nonce 0 if unable to retrieve
        this.accountNonces[account] = 0;
      }
    }
  }

  /**
   * Get the next available account from the worker's assigned accounts
   * Uses round-robin to distribute transactions across accounts
   * @returns {string} Next account address to use
   */
  getNextAccount() {
    if (this.accounts.length === 0) {
      throw new Error('No accounts available');
    }

    // Simple round-robin approach
    const nextAccountIndex = this._txCount % this.accounts.length;
    this._txCount++;

    return this.accounts[nextAccountIndex];
  }

  /**
   * Sign a transaction using Web3Signer
   * @param {Object} txData - The transaction data to sign
   * @param {string} txData.from - Sender address
   * @param {string} txData.to - Recipient contract address
   * @param {string} txData.data - Encoded transaction data
   * @param {number} txData.nonce - Transaction nonce
   * @param {number} txData.gas - Gas limit
   * @param {number} txData.gasPrice - Gas price
   * @returns {Promise<string>} The signed transaction
   */
  async signTransaction(txData) {
    // Ensure the transaction has the chain ID and proper values
    const tx = {
      ...txData,
      chainId: this.chainId,
      gasPrice: txData.gasPrice || '0x0',
      value: txData.value || '0x0'
    };

    try {
      // Request Web3Signer to sign the transaction
      const response = await axios.post(`${this.endpoint}/api/v1/eth1/sign`, tx);
      return response.data.signedTransaction;
    } catch (error) {
      console.error('Failed to sign transaction with Web3Signer:', error);
      throw new Error(`Web3Signer signing error: ${error.message}`);
    }
  }

  /**
   * Sign and send a transaction in one operation
   * @param {Object} txData - Transaction data (from, to, data, etc.)
   * @param {boolean} autoNonce - Automatically manage nonce if true
   * @returns {Promise<string>} Transaction hash
   */
  async signAndSendTransaction(txData, autoNonce = true) {
    try {
      // Ensure we have a from address
      const from = txData.from || this.getNextAccount();

      // Manage nonce if requested
      let nonce = txData.nonce;
      if (autoNonce) {
        nonce = this.accountNonces[from] || 0;
      }

      // Prepare transaction with proper nonce
      const tx = {
        ...txData,
        from,
        nonce: nonce,
        gas: txData.gas || 3000000,
        gasPrice: txData.gasPrice || 0
      };

      // Sign the transaction
      const signedTx = await this.signTransaction(tx);

      // Send the raw transaction to Besu
      const receipt = await this.web3.eth.sendSignedTransaction(signedTx);

      // Update nonce on success
      if (autoNonce) {
        this.accountNonces[from] = nonce + 1;
      }

      return receipt.transactionHash;
    } catch (error) {
      // Handle nonce errors
      if (error.message.includes('nonce') || error.message.includes('Invalid nonce')) {
        console.warn(`Nonce error detected for ${txData.from}, refreshing nonce...`);
        await this.refreshAccountNonce(txData.from);

        // Only retry once to avoid infinite loop
        if (autoNonce) {
          console.log(`Retrying transaction with updated nonce ${this.accountNonces[txData.from]}`);
          return this.signAndSendTransaction({
            ...txData,
            nonce: this.accountNonces[txData.from]
          }, false);
        }
      }

      console.error('Transaction failed:', error);
      throw error;
    }
  }

  /**
   * Refresh the nonce for a specific account
   * @param {string} account - The account address
   * @returns {Promise<number>} The updated nonce
   */
  async refreshAccountNonce(account) {
    try {
      const nonce = await this.web3.eth.getTransactionCount(account, 'pending');
      this.accountNonces[account] = parseInt(nonce);
      console.log(`Refreshed nonce for ${account}: ${this.accountNonces[account]}`);
      return this.accountNonces[account];
    } catch (error) {
      console.error(`Error refreshing nonce for ${account}:`, error);
      // Increment as a fallback strategy
      this.accountNonces[account] = (this.accountNonces[account] || 0) + 1;
      return this.accountNonces[account];
    }
  }

  /**
   * Get available signing keys from Web3Signer
   * @returns {Promise<Array<string>>} Array of public addresses that can be used for signing
   */
  async getAvailableSigners() {
    try {
      const response = await axios.get(`${this.endpoint}/api/v1/eth1/publicKeys`);
      return response.data;
    } catch (error) {
      console.error('Failed to get available signers:', error);
      throw new Error(`Web3Signer accounts error: ${error.message}`);
    }
  }

  /**
   * Check if Web3Signer is available and responding
   * @returns {Promise<boolean>} True if Web3Signer is available
   */
  async isAvailable() {
    try {
      await axios.get(`${this.endpoint}/upcheck`);
      return true;
    } catch (error) {
      console.error('Web3Signer is not available:', error);
      return false;
    }
  }

  /**
   * Create a contract instance that uses Web3Signer for transactions
   * @param {Array} abi - Contract ABI
   * @param {string} address - Contract address
   * @param {string} defaultFrom - Default sender address
   * @returns {Object} Contract instance
   */
  createContractInstance(abi, address, defaultFrom = null) {
    // Create the contract instance with web3
    const contract = new this.web3.eth.Contract(abi, address);

    // Get default from address if not provided
    if (!defaultFrom && this.accounts.length > 0) {
      defaultFrom = this.accounts[0];
    }

    // Enhanced contract methods with automatic signing
    const enhancedContract = {
      ...contract,
      signAndSend: async (method, args, txOptions = {}) => {
        // Get method from contract
        const contractMethod = contract.methods[method](...args);

        // Get transaction data
        const from = txOptions.from || defaultFrom;
        const nonce = txOptions.nonce || this.accountNonces[from] || 0;

        const txData = {
          from: from,
          to: address,
          data: contractMethod.encodeABI(),
          gas: txOptions.gas || 3000000,
          gasPrice: txOptions.gasPrice || 0,
          nonce: nonce
        };

        // Sign and send the transaction
        return this.signAndSendTransaction(txData);
      }
    };

    return enhancedContract;
  }

  /**
   * Create a DIDRegistry contract instance with helper methods
   * @param {string} address - Contract address
   * @returns {Object} Enhanced DIDRegistry contract instance
   */
  createDIDRegistryContract(address) {
    // Create base contract
    const didAbi = [
      this.didRegistryABI.registerDID,
      this.didRegistryABI.resolveDID,
      {
        "inputs": [{ "internalType": "string", "name": "did", "type": "string" }],
        "name": "isDIDActive",
        "stateMutability": "view",
        "type": "function"
      },
      {
        "inputs": [{ "internalType": "address", "name": "owner", "type": "address" }],
        "name": "getDIDsByOwner",
        "stateMutability": "view",
        "type": "function"
      }
    ];

    const contract = this.createContractInstance(didAbi, address);

    // Add specialized methods
    return {
      ...contract,
      // Helper to register a DID with automatic signing
      registerDID: async (did, publicKey, serviceEndpoint, role, account = null) => {
        const from = account || this.getNextAccount();
        return contract.signAndSend('registerDID', [did, publicKey, serviceEndpoint, role], { from });
      },
      // Helper to check if a DID is active (read-only)
      isDIDActive: async (did) => {
        return contract.methods.isDIDActive(did).call();
      },
      // Helper to resolve a DID (read-only)
      resolveDID: async (did) => {
        return contract.methods.resolveDID(did).call();
      }
    };
  }
}

module.exports = DIDWeb3SignerHelper;

'use strict';

const axios = require('axios');
const { Web3 } = require('web3');
const { isAddress } = require('web3-validator');

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
   * @param {Object} options - Additional configuration options
   * @param {boolean} options.useJsonRpc - Whether to use JSON-RPC API (default: true)
   * @param {number} options.jsonRpcTimeout - Timeout for JSON-RPC calls in ms (default: 30000)
   */
  constructor(
    endpoint = 'http://127.0.0.1:18545',
    besuEndpoint = 'ws://172.16.239.15:8546',
    chainId = 1337,
    workerIndex = 0,
    totalWorkers = 1,
    options = {}
  ) {
    this.endpoint = endpoint;
    this.besuEndpoint = besuEndpoint;
    this.chainId = chainId;
    this.workerIndex = workerIndex;
    this.totalWorkers = totalWorkers;

    // Parse options with defaults
    this.options = {
      useJsonRpc: options.useJsonRpc !== false, // Default to true
      jsonRpcTimeout: options.jsonRpcTimeout || 30000, // Default 30s timeout
      ...options
    };

    // Initialize Web3 instances
    this.web3 = new Web3(besuEndpoint);
    this.web3signer = new Web3(endpoint);

    // Cache for accounts and nonces
    this.accounts = [];
    this.accountNonces = {};
    this._txCount = 0;

    // Map to store public key to address mappings
    this.publicKeyToAddress = new Map();

    // Track if we're using fallback accounts
    this.usingFallback = false;

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
        "inputs": [
          { "internalType": "string", "name": "did", "type": "string" }
        ],
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

    console.log(`Worker ${this.workerIndex}: Web3Signer helper initialized with JSON-RPC: ${this.options.useJsonRpc ? 'enabled' : 'disabled'}`);
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
        console.warn(`Worker ${this.workerIndex}: Web3Signer service is not available, using fallback accounts`);
        this.usingFallback = true;
        this.accounts = this.getFallbackAccounts();
        return this.accounts;
      }

      // Try getting accounts from Web3Signer
      try {
        this.accounts = await this.getAvailableSigners();
        console.log(`Worker ${this.workerIndex}: Web3Signer has ${this.accounts.length} available accounts`);
      } catch (error) {
        console.warn(`Worker ${this.workerIndex}: Failed to get accounts from Web3Signer: ${error.message}`);
        this.usingFallback = true;
        this.accounts = this.getFallbackAccounts();
      }

      if (this.accounts.length === 0) {
        console.warn(`Worker ${this.workerIndex}: No accounts available in Web3Signer, using fallback accounts`);
        this.usingFallback = true;
        this.accounts = this.getFallbackAccounts();
      }

      // Assign accounts to workers if requested
      if (assignAccountsToWorkers) {
        this.accounts = this.assignAccountsToWorker(this.accounts);
      }

      // Initialize nonces for all accounts
      await this.initializeNonces();

      return this.accounts;
    } catch (error) {
      console.error(`Worker ${this.workerIndex}: Failed to initialize DIDWeb3SignerHelper: ${error.message}`);
      // Return fallback accounts in case of error
      this.usingFallback = true;
      this.accounts = this.getFallbackAccounts();
      return this.accounts;
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

    console.warn(`Worker ${this.workerIndex}: Using ${workerAccounts.length} fallback accounts`);
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

    console.log(`Worker ${this.workerIndex}: Assigned ${workerAccounts.length} accounts: ${JSON.stringify(workerAccounts)}`);
    return workerAccounts;
  }

  /**
   * Initialize nonces for all accounts assigned to this worker
   */
  async initializeNonces() {
    for (const account of this.accounts) {
      try {
        // Validate account format before using
        if (!isAddress(account)) {
          console.error(`Worker ${this.workerIndex}: Invalid Ethereum address format: ${account}`);
          this.accountNonces[account] = 0;
          continue;
        }

        const nonce = await this.web3.eth.getTransactionCount(account, 'pending');
        this.accountNonces[account] = parseInt(nonce);
        console.log(`Worker ${this.workerIndex}: Initialized nonce for account ${account}: ${this.accountNonces[account]}`);
      } catch (error) {
        console.error(`Worker ${this.workerIndex}: Error initializing nonce for account ${account}:`, error);
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
   * Convert a public key to an Ethereum address
   * @param {string} publicKey - The public key to convert
   * @returns {string} The Ethereum address
   * @private
   */
  _publicKeyToAddress(publicKey) {
    try {
      // Check if we've already converted this key
      if (this.publicKeyToAddress.has(publicKey)) {
        return this.publicKeyToAddress.get(publicKey);
      }

      // Remove '0x' prefix if present
      const cleanKey = publicKey.startsWith('0x') ? publicKey.slice(2) : publicKey;

      // For uncompressed public keys, remove the '04' prefix if present (Ethereum format)
      const keyToHash = cleanKey.startsWith('04') ? cleanKey.slice(2) : cleanKey;

      // Hash with keccak256 and take last 20 bytes
      const hash = this.web3.utils.keccak256('0x' + keyToHash);
      const address = '0x' + hash.slice(-40);

      // Store for future reference
      this.publicKeyToAddress.set(publicKey, address);

      return address;
    } catch (error) {
      console.error(`Worker ${this.workerIndex}: Failed to convert public key to address: ${error.message}`);
      return null;
    }
  }

  /**
   * Sign a transaction using Web3Signer JSON-RPC API
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
    // Skip if using fallback mode - caller should handle direct sending
    if (this.usingFallback) {
      throw new Error('Using fallback accounts - direct signing not available');
    }

    // If JSON-RPC is disabled, throw an error
    if (!this.options.useJsonRpc) {
      throw new Error('JSON-RPC is disabled in configuration');
    }

    // Ensure the transaction has the chain ID and proper values
    const tx = {
      ...txData,
      chainId: this._ensureHex(this.chainId),
      gasPrice: this._ensureHex(txData.gasPrice || 0),
      value: this._ensureHex(txData.value || 0),
      nonce: this._ensureHex(txData.nonce),
      gas: this._ensureHex(txData.gas),
      data: txData.data || '0x'
    };

    console.log(`Worker ${this.workerIndex}: Signing transaction with JSON-RPC for account ${txData.from}`);
    console.log(`Worker ${this.workerIndex}: Transaction data:`, JSON.stringify(tx, null, 2));

    try {
      // Using JSON-RPC to sign the transaction
      const rpcRequest = {
        jsonrpc: '2.0',
        method: 'eth_signTransaction',
        params: [tx],
        id: Date.now()
      };

      console.log(`Worker ${this.workerIndex}: Sending JSON-RPC request to ${this.endpoint}`);

      const response = await axios.post(this.endpoint, rpcRequest, {
        timeout: this.options.jsonRpcTimeout // Use configured timeout
      });

      if (!response.data || response.data.error) {
        const errorMessage = response.data?.error?.message || 'Unknown JSON-RPC error';
        console.error(`Worker ${this.workerIndex}: JSON-RPC error: ${errorMessage}`);
        throw new Error(`JSON-RPC error: ${errorMessage}`);
      }

      const signedTx = response.data.result;

      console.log(`Worker ${this.workerIndex}: Successfully signed transaction with JSON-RPC`);

      return signedTx;
    } catch (error) {
      console.error(`Worker ${this.workerIndex}: Failed to sign transaction:`, error.message);

      // If it's an Axios error, provide more detailed information
      if (error.response) {
        console.error(`Worker ${this.workerIndex}: Server responded with status ${error.response.status}`);
        console.error(`Worker ${this.workerIndex}: Response data:`, error.response.data);
      }

      throw new Error(`Web3Signer JSON-RPC signing error: ${error.message}`);
    }
  }

  /**
   * Helper to ensure a value is in hexadecimal format
   * @param {string|number} value - The value to convert
   * @returns {string} - Hexadecimal representation with 0x prefix
   * @private
   */
  _ensureHex(value) {
    if (value === undefined || value === null) {
      return '0x0';
    }

    // If it's already a hex string with 0x prefix, return it as is
    if (typeof value === 'string' && value.startsWith('0x')) {
      return value;
    }

    // Convert to hex
    let hexValue;
    if (typeof value === 'number') {
      hexValue = value.toString(16);
    } else {
      // Try to parse as number first
      const num = Number(value);
      if (!isNaN(num)) {
        hexValue = num.toString(16);
      } else {
        // If it's not a number, keep it as is
        return value;
      }
    }

    // Ensure it has 0x prefix
    return `0x${hexValue}`;
  }

  /**
   * Sign and send a transaction in one operation using JSON-RPC
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

      let txHash;

      // Different handling based on fallback mode
      if (this.usingFallback) {
        // For fallback accounts, we need to get the private key and create a wallet
        const privateKey = this._getPrivateKeyForAddress(from);

        if (privateKey) {
          // If we have the private key, use it directly
          console.log(`Worker ${this.workerIndex}: Using fallback account ${from} with private key to sign and send transaction`);
          const account = this.web3.eth.accounts.privateKeyToAccount(privateKey);
          const signedTx = await account.signTransaction(tx);

          // Send the raw transaction using JSON-RPC
          txHash = await this._sendRawTransaction(signedTx.rawTransaction);
        } else {
          // If we don't have the private key, try to use eth_sendTransaction JSON-RPC method
          console.log(`Worker ${this.workerIndex}: Using eth_sendTransaction with fallback account ${from} (requires unlocked account)`);
          txHash = await this._sendTransaction(tx);
        }
      } else {
        // Use Web3Signer JSON-RPC for signing
        console.log(`Worker ${this.workerIndex}: Using Web3Signer JSON-RPC to sign transaction for account ${from}`);
        const signedTx = await this.signTransaction(tx);

        // Use JSON-RPC to send the raw transaction
        txHash = await this._sendRawTransaction(signedTx);
      }

      // Update nonce on success
      if (autoNonce) {
        this.accountNonces[from] = nonce + 1;
      }

      return txHash;
    } catch (error) {
      // Handle nonce errors
      if (error.message && (error.message.includes('nonce') || error.message.includes('Invalid nonce'))) {
        console.warn(`Worker ${this.workerIndex}: Nonce error detected for ${txData.from}, refreshing nonce...`);
        await this.refreshAccountNonce(txData.from);

        // Only retry once to avoid infinite loop
        if (autoNonce) {
          console.log(`Worker ${this.workerIndex}: Retrying transaction with updated nonce ${this.accountNonces[txData.from]}`);
          return this.signAndSendTransaction({
            ...txData,
            nonce: this.accountNonces[txData.from]
          }, false);
        }
      }

      console.error(`Worker ${this.workerIndex}: Transaction failed:`, error.message);
      throw error;
    }
  }

  /**
   * Send a raw transaction using JSON-RPC eth_sendRawTransaction
   * @param {string} signedTx - The signed transaction data
   * @returns {Promise<string>} Transaction hash
   * @private
   */
  async _sendRawTransaction(signedTx) {
    try {
      // If JSON-RPC is disabled, throw to fallback immediately
      if (!this.options.useJsonRpc) {
        throw new Error('JSON-RPC is disabled in configuration');
      }

      // Try to use JSON-RPC directly
      const rpcRequest = {
        jsonrpc: '2.0',
        method: 'eth_sendRawTransaction',
        params: [signedTx],
        id: Date.now()
      };

      console.log(`Worker ${this.workerIndex}: Sending raw transaction via JSON-RPC`);

      const response = await axios.post(this.endpoint, rpcRequest, {
        timeout: this.options.jsonRpcTimeout // Use configured timeout
      });

      if (!response.data || response.data.error) {
        const errorMessage = response.data?.error?.message || 'Unknown JSON-RPC error';
        console.error(`Worker ${this.workerIndex}: JSON-RPC error on sendRawTransaction: ${errorMessage}`);

        // Fallback to web3.js if JSON-RPC fails
        console.log(`Worker ${this.workerIndex}: Falling back to web3.js for sending raw transaction`);
        const receipt = await this.web3.eth.sendSignedTransaction(signedTx);
        return receipt.transactionHash;
      }

      return response.data.result;
    } catch (error) {
      console.error(`Worker ${this.workerIndex}: Error sending raw transaction:`, error.message);

      // Fallback to web3.js if JSON-RPC fails
      try {
        console.log(`Worker ${this.workerIndex}: Falling back to web3.js for sending raw transaction`);
        const receipt = await this.web3.eth.sendSignedTransaction(signedTx);
        return receipt.transactionHash;
      } catch (fallbackError) {
        console.error(`Worker ${this.workerIndex}: Fallback also failed:`, fallbackError.message);
        throw new Error(`Failed to send raw transaction: ${error.message}`);
      }
    }
  }

  /**
   * Send a transaction using JSON-RPC eth_sendTransaction
   * @param {Object} tx - The transaction data
   * @returns {Promise<string>} Transaction hash
   * @private
   */
  async _sendTransaction(tx) {
    try {
      // If JSON-RPC is disabled, throw to fallback immediately
      if (!this.options.useJsonRpc) {
        throw new Error('JSON-RPC is disabled in configuration');
      }

      // Format transaction for JSON-RPC
      const formattedTx = {
        from: tx.from,
        to: tx.to,
        gas: this._ensureHex(tx.gas),
        gasPrice: this._ensureHex(tx.gasPrice),
        value: this._ensureHex(tx.value || 0),
        data: tx.data || '0x',
        nonce: this._ensureHex(tx.nonce)
      };

      // Try to use JSON-RPC directly
      const rpcRequest = {
        jsonrpc: '2.0',
        method: 'eth_sendTransaction',
        params: [formattedTx],
        id: Date.now()
      };

      console.log(`Worker ${this.workerIndex}: Sending transaction via JSON-RPC`);

      const response = await axios.post(this.endpoint, rpcRequest, {
        timeout: this.options.jsonRpcTimeout // Use configured timeout
      });

      if (!response.data || response.data.error) {
        const errorMessage = response.data?.error?.message || 'Unknown JSON-RPC error';
        console.error(`Worker ${this.workerIndex}: JSON-RPC error on sendTransaction: ${errorMessage}`);

        // Fallback to web3.js if JSON-RPC fails
        console.log(`Worker ${this.workerIndex}: Falling back to web3.js for sending transaction`);
        const receipt = await this.web3.eth.sendTransaction(tx);
        return receipt.transactionHash;
      }

      return response.data.result;
    } catch (error) {
      console.error(`Worker ${this.workerIndex}: Error sending transaction:`, error.message);

      // Fallback to web3.js if JSON-RPC fails
      try {
        console.log(`Worker ${this.workerIndex}: Falling back to web3.js for sending transaction`);
        const receipt = await this.web3.eth.sendTransaction(tx);
        return receipt.transactionHash;
      } catch (fallbackError) {
        console.error(`Worker ${this.workerIndex}: Fallback also failed:`, fallbackError.message);
        throw new Error(`Failed to send transaction: ${error.message}`);
      }
    }
  }

  /**
   * Get private key for fallback address if available
   * @param {string} address - Ethereum address
   * @returns {string|null} - Private key if available, null otherwise
   * @private
   */
  _getPrivateKeyForAddress(address) {
    // Map of hardcoded addresses to private keys for fallback accounts
    const addressToPrivateKey = {
      '0x06d06c366b213f716b51bca6dc1874afc05467d0': '0xb37a2494f2330ee4fdf516b38bad42b8e27e35e810abf1baf1fb51ad880872ed',
      '0x2d501ff683a6dcb43b4b12cf334ea7a9692a9f1c': '0x270bbbfd7748547ec9bc983e16864d37a303720ae76044114dc00cb42ee0c446',
      '0x8dd478dee59d3b7c16a2e34cb5d321ed23d2677d': '0x8a5fb061550c3db1a78665259a44222d33e14246c914c1b70bdf43ce05d2b119',
      '0xc9c913c8c3c1cd416d80a0abf475db2062f161f6': '0x60bbe10a196a4e71451c0f6e9ec9beab454c2a5ac0542aa5b8b733ff5719fec3',
      '0x9b790656b9ec0db1936ed84b3bea605873558198': '0x797bbe0373132e8c5483515b68ecbb6d3581b56f0205b653ad2b30a559e83891',
      '0xe43f47c497e0efc3fe96a85b2041aff2f0d317a5': '0x69df614162f5c1ed4f00a924ece67035a86a2011a2f72a381273599e8c49a1c0'
    };

    // Normalize address format (lowercase)
    const normalizedAddress = address.toLowerCase();

    return addressToPrivateKey[normalizedAddress] || null;
  }

  /**
   * Refresh the nonce for a specific account
   * @param {string} account - The account address
   * @returns {Promise<number>} The updated nonce
   */
  async refreshAccountNonce(account) {
    try {
      if (!isAddress(account)) {
        console.error(`Worker ${this.workerIndex}: Cannot refresh nonce - invalid address format: ${account}`);
        return this.accountNonces[account] || 0;
      }

      const nonce = await this.web3.eth.getTransactionCount(account, 'pending');
      this.accountNonces[account] = parseInt(nonce);
      console.log(`Worker ${this.workerIndex}: Refreshed nonce for ${account}: ${this.accountNonces[account]}`);
      return this.accountNonces[account];
    } catch (error) {
      console.error(`Worker ${this.workerIndex}: Error refreshing nonce for ${account}:`, error);
      // Increment as a fallback strategy
      this.accountNonces[account] = (this.accountNonces[account] || 0) + 1;
      return this.accountNonces[account];
    }
  }

  /**
   * Get available signing keys from Web3Signer and convert to Ethereum addresses
   * @returns {Promise<Array<string>>} Array of public addresses that can be used for signing
   */
  async getAvailableSigners() {
    try {
      // Only use the standard path per Web3Signer documentation
      console.log(`Worker ${this.workerIndex}: Attempting to get keys from: ${this.endpoint}/api/v1/eth1/publicKeys`);
      const response = await axios.get(`${this.endpoint}/api/v1/eth1/publicKeys`);

      if (response.data) {
        let keys;

        // Handle different possible response formats
        if (Array.isArray(response.data)) {
          keys = response.data;
        } else if (response.data.data && Array.isArray(response.data.data)) {
          keys = response.data.data;
        } else if (typeof response.data === 'object') {
          // Try to extract keys from object
          keys = Object.values(response.data).filter(val => typeof val === 'string');
        } else {
          console.warn(`Worker ${this.workerIndex}: Unexpected key response format`);
          return this.getFallbackAccounts();
        }

        if (keys && keys.length > 0) {
          console.log(`Worker ${this.workerIndex}: Successfully retrieved ${keys.length} keys from Web3Signer`);

          // Convert keys to addresses
          const addresses = [];
          for (const key of keys) {
            const address = this._publicKeyToAddress(key);
            if (address) {
              addresses.push(address);
            }
          }

          if (addresses.length === 0) {
            console.warn(`Worker ${this.workerIndex}: Failed to convert any keys to addresses`);
            return this.getFallbackAccounts();
          }

          console.log(`Worker ${this.workerIndex}: Successfully converted ${addresses.length} keys to addresses`);
          return addresses;
        }
      }

      // Fall back to predefined accounts if no keys found
      console.warn(`Worker ${this.workerIndex}: Could not retrieve any keys from Web3Signer, using fallback accounts`);
      return this.getFallbackAccounts();
    } catch (error) {
      console.error(`Worker ${this.workerIndex}: Failed to get available signers:`, error.message);
      return this.getFallbackAccounts();
    }
  }

  /**
   * Check if Web3Signer is available and responding
   * @returns {Promise<boolean>} True if Web3Signer is available
   */
  async isAvailable() {
    // Try using JSON-RPC web3_clientVersion method which is lightweight
    if (this.options.useJsonRpc) {
      try {
        console.log(`Worker ${this.workerIndex}: Checking Web3Signer availability via JSON-RPC web3_clientVersion`);

        const rpcRequest = {
          jsonrpc: '2.0',
          method: 'web3_clientVersion',
          params: [],
          id: Date.now()
        };

        const response = await axios.post(this.endpoint, rpcRequest, {
          timeout: Math.min(5000, this.options.jsonRpcTimeout) // Use shorter timeout for health check
        });

        if (response.data && !response.data.error) {
          console.log(`Worker ${this.workerIndex}: Web3Signer available via JSON-RPC, version: ${response.data.result}`);
          return true;
        }
      } catch (rpcError) {
        console.warn(`Worker ${this.workerIndex}: JSON-RPC check failed: ${rpcError.message}`);
        // Continue to health check endpoint
      }
    }

    // If JSON-RPC fails or is disabled, try the health check endpoint
    try {
      console.log(`Worker ${this.workerIndex}: Checking Web3Signer availability at: ${this.endpoint}/healthcheck`);
      const response = await axios.get(`${this.endpoint}/healthcheck`, {
        timeout: 3000, // Add shorter timeout for health checks
        validateStatus: null // Don't throw on error status codes
      });

      if (response.status >= 200 && response.status < 300) {
        console.log(`Worker ${this.workerIndex}: Web3Signer available via health check endpoint`);
        return true;
      }
    } catch (error) {
      console.warn(`Worker ${this.workerIndex}: Health check failed: ${error.message}`);
    }

    // Try a last resort option - see if we can get keys
    try {
      console.log(`Worker ${this.workerIndex}: Trying to retrieve keys as a last resort availability check`);
      const keys = await this.getAvailableSigners();
      if (keys && keys.length > 0) {
        console.log(`Worker ${this.workerIndex}: Web3Signer appears available (keys retrievable)`);
        return true;
      }
    } catch (error) {
      console.warn(`Worker ${this.workerIndex}: Failed to retrieve keys: ${error.message}`);
    }

    console.error(`Worker ${this.workerIndex}: Web3Signer is not available through any method`);
    return false;
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
      this.didRegistryABI.updateDID,
      this.didRegistryABI.deactivateDID,
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
        // Use managed nonce from helper
        const nonce = this.accountNonces[from] || 0;

        console.log(`Worker ${this.workerIndex}: Registering DID with nonce ${nonce} for ${from}`);

        return contract.signAndSend('registerDID', [did, publicKey, serviceEndpoint, role, nonce], { from });
      },
      // Helper to update a DID with automatic signing
      updateDID: async (did, publicKey, serviceEndpoint, account = null) => {
        const from = account || this.getNextAccount();
        // Use managed nonce from helper
        const nonce = this.accountNonces[from] || 0;

        console.log(`Worker ${this.workerIndex}: Updating DID with nonce ${nonce} for ${from}`);

        return contract.signAndSend('updateDID', [did, publicKey, serviceEndpoint, nonce], { from });
      },
      // Helper to deactivate a DID with automatic signing
      deactivateDID: async (did, account = null) => {
        const from = account || this.getNextAccount();
        // Use managed nonce from helper
        const nonce = this.accountNonces[from] || 0;

        console.log(`Worker ${this.workerIndex}: Deactivating DID with nonce ${nonce} for ${from}`);

        return contract.signAndSend('deactivateDID', [did, nonce], { from });
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

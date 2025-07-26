'use strict';

const axios = require('axios');

/**
 * Web3SignerClient - A lightweight client for interacting with Web3Signer API
 * Handles transaction signing separate from Besu node for security and privacy
 */
class Web3SignerClient {
  /**
   * Initialize the Web3Signer client
   * @param {string} signerUrl - The URL of the Web3Signer service
   * @param {number} chainId - The chain ID to use for signing
   */
  constructor(signerUrl, chainId) {
    this.signerUrl = signerUrl;
    this.chainId = chainId;
    this.axios = axios.create({
      baseURL: signerUrl,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log(`📝 Web3SignerClient initialized with URL: ${signerUrl}, Chain ID: ${chainId}`);
  }

  /**
   * Sign a transaction using Web3Signer API
   * @param {Object} txData - Unsigned transaction data
   * @param {string} fromAddress - Signer address
   * @returns {Promise<string>} Signed transaction (hex string)
   */
  async signTransaction(txData, fromAddress) {
    try {
      // Prepare transaction for signing
      const transaction = {
        from: fromAddress,
        to: txData.to,
        gas: txData.gas || txData.gasLimit,
        gasPrice: txData.gasPrice,
        value: txData.value || '0x0',
        data: txData.data,
        nonce: txData.nonce,
        chainId: this.chainId
      };

      console.log(`🔑 Sending transaction to Web3Signer for ${fromAddress}:`, {
        to: transaction.to,
        gasLimit: transaction.gas,
        methodName: txData.methodName || 'unknown'
      });

      // Call eth_signTransaction at Web3Signer endpoint
      const response = await this.axios.post('', {
        jsonrpc: '2.0',
        method: 'eth_signTransaction',
        params: [transaction],
        id: Date.now()
      });

      if (response.data.error) {
        throw new Error(`Web3Signer error: ${response.data.error.message}`);
      }

      const signedTx = response.data.result;
      console.log(`✅ Transaction signed successfully: ${signedTx.substring(0, 20)}...`);
      return signedTx;

    } catch (error) {
      console.error(`❌ Failed to sign transaction: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get accounts available from Web3Signer
   * @returns {Promise<string[]>} List of account addresses
   */
  async getAccounts() {
    try {
      const response = await this.axios.post('', {
        jsonrpc: '2.0',
        method: 'eth_accounts',
        params: [],
        id: Date.now()
      });

      if (response.data.error) {
        throw new Error(`Web3Signer error: ${response.data.error.message}`);
      }

      const accounts = response.data.result;
      console.log(`👤 Retrieved ${accounts.length} accounts from Web3Signer`);
      return accounts;

    } catch (error) {
      console.error(`❌ Failed to get accounts: ${error.message}`);
      return [];
    }
  }
}

module.exports = Web3SignerClient;
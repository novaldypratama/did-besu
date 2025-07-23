'use strict';

const axios = require('axios');

/**
 * Helper class for interacting with Web3Signer
 */
class Web3SignerHelper {
    /**
     * Create a new Web3SignerHelper
     * @param {string} endpoint - The Web3Signer endpoint URL
     * @param {number} chainId - The chain ID for transactions
     */
    constructor(endpoint = 'http://172.16.239.40:8545', chainId = 1337) {
        this.endpoint = endpoint;
        this.chainId = chainId;
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
        try {
            // Ensure the transaction has the chain ID
            const tx = {
                ...txData,
                chainId: this.chainId
            };

            // Request Web3Signer to sign the transaction
            const response = await axios.post(`${this.endpoint}/eth1/transaction`, tx);
            
            // Return the signed transaction data
            return response.data.signedTransaction;
        } catch (error) {
            console.error('Failed to sign transaction with Web3Signer:', error);
            throw new Error(`Web3Signer signing error: ${error.message}`);
        }
    }

    /**
     * Get available signing keys from Web3Signer
     * @returns {Promise<Array<string>>} Array of public addresses that can be used for signing
     */
    async getAvailableSigners() {
        try {
            const response = await axios.get(`${this.endpoint}/eth1/accounts`);
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
}

module.exports = Web3SignerHelper;
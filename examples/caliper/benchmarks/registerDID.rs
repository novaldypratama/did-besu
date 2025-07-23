'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');
const { Web3 } = require('web3');

/**
 * Workload module for benchmarking DID Registry registerDID operations
 * Enhanced with proper nonce management and BigInt handling
 */
class RegisterDIDWorkload extends WorkloadModuleBase {
    constructor() {
        super();
        this.contractId = '';
        this.didCount = 0;
        this.accounts = [];
        this.web3 = null;
        this.contractAddress = '';
        
        // Add nonce management
        this.nonceTracker = {};
        this.pendingTxs = {};
        this.nonceRetryMax = 5;
    }
    
    /**
     * Helper function to safely convert BigInt values to strings in objects for logging
     */
    toJsonSafe(obj) {
        return JSON.stringify(obj, (key, value) => 
            typeof value === 'bigint' ? value.toString() : value
        );
    }

    /**
     * Initialize the workload module
     */
    async initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext) {
        await super.initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext);
        
        this.contractId = 'DIDRegistry';
        this.workerIndex = workerIndex;
        this.roundIndex = roundIndex;
        
        // Initialize web3 with the ethsigner endpoint
        let ethsignerUrl = roundArguments.ethsignerUrl || 'http://172.16.239.40:8545';
        console.log(`Worker ${workerIndex}: Connecting to EthSigner at ${ethsignerUrl}`);
        this.web3 = new Web3(ethsignerUrl);
        
        // Get accounts with enhanced error handling and fallbacks
        this.accounts = await this.getAccounts(sutContext, workerIndex);
        
        // Use gas limit from arguments if provided
        this.gasLimit = roundArguments.gasLimit || 3000000;
        
        // Initialize nonce for each account
        await this.initializeNonces();
        
        // Use safe JSON stringification to handle BigInt values
        console.log(`Worker ${workerIndex}: Initialized with ${this.accounts.length} accounts: ${this.toJsonSafe(this.accounts)}`);
        console.log(`Worker ${workerIndex}: Initial nonces: ${this.toJsonSafe(this.nonceTracker)}`);
    }

    /**
     * Initialize nonce values for all accounts
     */
    async initializeNonces() {
        try {
            for (const account of this.accounts) {
                // Get the transaction count (nonce) from the blockchain
                const nonceValue = await this.web3.eth.getTransactionCount(account, 'pending');
                
                // Convert potential BigInt to normal number
                const nonce = typeof nonceValue === 'bigint' ? Number(nonceValue) : nonceValue;
                
                this.nonceTracker[account] = nonce;
                this.pendingTxs[account] = 0;
                console.log(`Worker ${this.workerIndex}: Account ${account} initialized with nonce ${nonce}`);
            }
        } catch (error) {
            console.error(`Worker ${this.workerIndex}: Error initializing nonces: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get next nonce for an account with locking mechanism
     */
    getNextNonce(account) {
        if (this.nonceTracker[account] === undefined) {
            throw new Error(`No nonce initialized for account ${account}`);
        }
        
        // Get and increment the nonce
        const nonce = this.nonceTracker[account];
        this.nonceTracker[account]++;
        this.pendingTxs[account]++;
        
        return nonce;
    }

    /**
     * Release a nonce after transaction completion or failure
     */
    releaseNonce(account) {
        if (this.pendingTxs[account] > 0) {
            this.pendingTxs[account]--;
        }
    }

    /**
     * Reset nonce tracking when needed (e.g., after errors)
     */
    async resetNonce(account) {
        try {
            const nonceValue = await this.web3.eth.getTransactionCount(account, 'pending');
            
            // Convert potential BigInt to normal number
            const nonce = typeof nonceValue === 'bigint' ? Number(nonceValue) : nonceValue;
            
            console.log(`Worker ${this.workerIndex}: Resetting nonce for ${account} to ${nonce}`);
            this.nonceTracker[account] = nonce;
            this.pendingTxs[account] = 0;
            return nonce;
        } catch (error) {
            console.error(`Worker ${this.workerIndex}: Error resetting nonce: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get accounts - first try web3, then fall back to configuration
     */
    async getAccounts(sutContext, workerIndex) {
        // Try to get accounts from EthSigner/Web3 first
        try {
            const web3Accounts = await this.web3.eth.getAccounts();
            if (web3Accounts && web3Accounts.length > 0) {
                console.log(`Worker ${workerIndex}: Successfully retrieved ${web3Accounts.length} accounts from web3`);
                return web3Accounts;
            }
        } catch (error) {
            console.warn(`Worker ${workerIndex}: Error getting accounts from web3: ${error.message}`);
        }

        // Fall back to the predefined accounts from genesis file
        const fallbackAccounts = [
            '0x21307fd33e7daebeff0c4bead2a4976527dc5c71', // From genesis file
            '0x00a20e0d51d6f9a8692d884016769bad98192db8'  // From genesis file
        ];
        
        console.warn(`Worker ${workerIndex}: Using fallback accounts from genesis file`);
        return [fallbackAccounts[workerIndex % fallbackAccounts.length]];
    }

    /**
     * Generate a unique, deterministic DID for testing
     */
    generateDID() {
        const did = `did:test:${this.workerIndex}:${this.roundIndex}:${this.didCount++}`;
        return did;
    }

    /**
     * Generate random bytes for testing
     */
    generateBytes(length) {
        let result = '0x';
        const chars = '0123456789abcdef';
        for (let i = 0; i < length * 2; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    /**
     * Submit a transaction with retry logic and nonce management
     */
    async submitTransaction() {
        // Generate DID and parameters
        const did = this.generateDID();
        const publicKey = this.generateBytes(32);
        const serviceEndpoint = this.generateBytes(32);
        const role = Math.random() > 0.5 ? 1 : 2;
        
        // Select an account
        const accountIndex = this.workerIndex % this.accounts.length;
        const from = this.accounts[accountIndex];
        
        // Get the next nonce for this account
        let nonce = this.getNextNonce(from);
        let attempts = 0;
        
        while (attempts < this.nonceRetryMax) {
            try {
                console.log(`Worker ${this.workerIndex}: Preparing tx for DID: ${did} from account ${from} with nonce ${nonce}`);
                
                // Create the proper request object with explicit nonce
                const request = {
                    contract: this.contractId,
                    verb: 'registerDID',
                    args: [did, publicKey, serviceEndpoint, role],
                    txConfig: {
                        from: from,
                        gas: this.gasLimit,
                        gasPrice: '0',
                        chainId: 1337,
                        nonce: nonce.toString() // Ensure nonce is a string to avoid BigInt issues
                    }
                };
                
                // Send the request through the Caliper adapter
                const result = await this.sutAdapter.sendRequests(request);
                
                console.log(`Worker ${this.workerIndex}: Transaction successful for DID: ${did} with nonce ${nonce}`);
                this.releaseNonce(from);
                return did;
                
            } catch (error) {
                attempts++;
                
                // Check for nonce-related errors
                const errorMsg = error.message.toLowerCase();
                if (errorMsg.includes('nonce too low') || 
                    errorMsg.includes('already known') || 
                    errorMsg.includes('replacement transaction underpriced')) {
                    
                    console.warn(`Worker ${this.workerIndex}: Nonce issue detected (${errorMsg}). Attempt ${attempts}/${this.nonceRetryMax}`);
                    
                    // If we've tried too many times with incremental nonces, reset from blockchain
                    if (attempts >= Math.min(2, this.nonceRetryMax - 1)) {
                        nonce = await this.resetNonce(from);
                    } else {
                        // Otherwise just increment the nonce and try again
                        nonce++;
                        this.nonceTracker[from] = nonce + 1;
                    }
                    
                    // Add a small delay before retrying
                    await new Promise(resolve => setTimeout(resolve, 100 * attempts));
                    continue;
                }
                
                // For other errors, log and rethrow
                console.error(`Worker ${this.workerIndex}: Error in registerDID transaction: ${error.message}`);
                this.releaseNonce(from);
                throw error;
            }
        }
        
        // If we exhausted all retries
        const error = new Error(`Failed to submit transaction after ${this.nonceRetryMax} attempts`);
        this.releaseNonce(from);
        throw error;
    }
    
    /**
     * Clean up resources
     */
    async cleanupWorkloadModule() {
        // Optional: log final nonce values - safely handling BigInt
        console.log(`Worker ${this.workerIndex}: Final nonces: ${this.toJsonSafe(this.nonceTracker)}`);
        console.log(`Worker ${this.workerIndex}: Pending transactions: ${this.toJsonSafe(this.pendingTxs)}`);
        await super.cleanupWorkloadModule();
    }
}

/**
 * Create a new instance of the workload module
 * @return {RegisterDIDWorkload}
 */
function createWorkloadModule() {
    return new RegisterDIDWorkload();
}

module.exports.createWorkloadModule = createWorkloadModule;
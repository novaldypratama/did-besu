'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');
const { Web3 } = require('web3');

/**
 * Workload module for benchmarking DID Registry registerDID operations
 * Enhanced to work with Hyperledger Besu, EthSigner, and nonce management
 */
class RegisterDIDWorkload extends WorkloadModuleBase {
    constructor() {
        super();
        this.contractId = '';
        this.didCount = 0;
        this.accounts = [];
        this.web3 = null;
        this.contractAddress = '';
        this.accountNonces = {}; // Track nonces for each account
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
        // Using ethsigner as a proxy which will sign our transactions
        let ethsignerUrl = roundArguments.ethsignerUrl || 'http://172.16.239.40:8545';
        console.log(`Worker ${workerIndex}: Connecting to EthSigner at ${ethsignerUrl}`);
        this.web3 = new Web3(ethsignerUrl);
        
        // Get contract address from arguments or use default
        this.contractAddress = roundArguments.contractAddress || '0x51A21A51aa59B0b4BF99Ea7a79c7293d601FF689';
        console.log(`Worker ${workerIndex}: Using DIDRegistry contract at ${this.contractAddress}`);
        
        // Get accounts with enhanced error handling and fallbacks
        this.accounts = await this.getAccounts(sutContext, workerIndex);
        
        // Use gas limit from arguments if provided
        this.gasLimit = roundArguments.gasLimits?.didRegistry || roundArguments.gasLimit || 3000000;
        
        // Initialize nonces for each account
        await this.initializeNonces();
        
        console.log(`Worker ${workerIndex}: Initialized with ${this.accounts.length} accounts: ${JSON.stringify(this.accounts)}`);
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
            '0x21307fd33e7daebeff0c4bead2a4976527dc5c71',
            '0x00a20e0d51d6f9a8692d884016769bad98192db8',
            '0x06d06c366b213f716b51bca6dc1874afc05467d0',
            '0x2d501ff683a6dcb43b4b12cf334ea7a9692a9f1c',
            '0xc9c913c8c3c1cd416d80a0abf475db2062f161f6',
            '0xe43f47c497e0eFC3fe96a85B2041aFF2F0d317A5'
        ];
        
        console.warn(`Worker ${workerIndex}: Using fallback accounts from genesis file`);
        return [fallbackAccounts[workerIndex % fallbackAccounts.length]];
    }

    /**
     * Initialize nonces for each account by querying the contract
     */
    async initializeNonces() {
        if (!this.contractAddress) {
            console.warn(`Worker ${this.workerIndex}: Contract address not available, cannot initialize nonces`);
            return;
        }

        // DIDRegistry ABI for the getAddressNonce function - only include what we need
        const didRegistryABI = [
            {
                "inputs": [{"internalType": "address", "name": "owner", "type": "address"}],
                "name": "getAddressNonce",
                "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
                "stateMutability": "view",
                "type": "function"
            }
        ];

        for (const account of this.accounts) {
            try {
                // Create a contract instance using minimal ABI
                const contract = new this.web3.eth.Contract(didRegistryABI, this.contractAddress);
                
                // Call getAddressNonce function to get the current nonce for the account
                const nonce = await contract.methods.getAddressNonce(account).call();
                this.accountNonces[account] = parseInt(nonce);
                
                console.log(`Worker ${this.workerIndex}: Initialized nonce for account ${account}: ${this.accountNonces[account]}`);
            } catch (error) {
                console.error(`Worker ${this.workerIndex}: Error initializing nonce for account ${account}: ${error.message}`);
                // Default to starting at nonce 0 if we can't get it from the contract
                this.accountNonces[account] = 0;
            }
        }
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
     * Submit a transaction using the ethsigner proxy
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
        
        // Get the current nonce for the account
        let expectedNonce = this.accountNonces[from] || 0;
        
        // Log the attempt
        console.log(`Worker ${this.workerIndex}: Preparing transaction for DID: ${did} from account ${from} with nonce ${expectedNonce}`);
        
        try {
            // DIDRegistry ABI - only include the function we need
            const registerDidABI = [{
                "inputs": [
                    {"internalType": "string", "name": "did", "type": "string"},
                    {"internalType": "string", "name": "publicKey", "type": "string"},
                    {"internalType": "string", "name": "serviceEndpoint", "type": "string"},
                    {"internalType": "enum DIDRegistry.Role", "name": "role", "type": "uint8"},
                    {"internalType": "uint256", "name": "expectedNonce", "type": "uint256"}
                ],
                "name": "registerDID",
                "outputs": [],
                "stateMutability": "nonpayable",
                "type": "function"
            }];
            
            // Get the Ethereum transaction nonce
            const ethTxNonce = await this.web3.eth.getTransactionCount(from, 'latest');
            
            // Two options to submit the transaction
            let result;
            
            if (this.sutAdapter.sendRequests) {
                // Option 1: Use Caliper adapter if available
                const request = {
                    contract: this.contractId,
                    verb: 'registerDID',
                    args: [did, publicKey, serviceEndpoint, role, expectedNonce],
                    txConfig: {
                        from: from,
                        gas: this.gasLimit,
                        gasPrice: '0',
                        nonce: ethTxNonce.toString(),
                        chainId: 1337
                    }
                };
                
                result = await this.sutAdapter.sendRequests(request);
            } else {
                // Option 2: Use Web3 directly if adapter method is not available
                const contract = new this.web3.eth.Contract(registerDidABI, this.contractAddress);
                
                // Prepare the transaction data
                const txData = contract.methods.registerDID(
                    did, publicKey, serviceEndpoint, role, expectedNonce
                ).encodeABI();
                
                // Send the transaction through ethsigner
                const txReceipt = await this.web3.eth.sendTransaction({
                    from: from,
                    to: this.contractAddress,
                    data: txData,
                    gas: this.gasLimit,
                    gasPrice: '0',
                    nonce: ethTxNonce,
                    chainId: 1337
                });
                
                result = txReceipt;
            }
            
            // Increment the account nonce for next transaction
            this.accountNonces[from] = expectedNonce + 1;
            
            console.log(`Worker ${this.workerIndex}: Transaction successful for DID: ${did}. New nonce: ${this.accountNonces[from]}`);
            return did;
            
        } catch (error) {
            // Handle nonce errors - this could happen in concurrent scenarios
            if (error.message.includes('nonce') || error.message.includes('Invalid nonce')) {
                console.warn(`Worker ${this.workerIndex}: Nonce error detected, attempting to recover...`);
                
                try {
                    // Re-query the contract for the current nonce using minimal ABI
                    const nonceABI = [{
                        "inputs": [{"internalType": "address", "name": "owner", "type": "address"}],
                        "name": "getAddressNonce",
                        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
                        "stateMutability": "view",
                        "type": "function"
                    }];
                    
                    const contract = new this.web3.eth.Contract(nonceABI, this.contractAddress);
                    const updatedNonce = await contract.methods.getAddressNonce(from).call();
                    
                    this.accountNonces[from] = parseInt(updatedNonce);
                    console.log(`Worker ${this.workerIndex}: Updated nonce for ${from} to ${this.accountNonces[from]}`);
                } catch (nonceError) {
                    console.error(`Worker ${this.workerIndex}: Failed to recover nonce: ${nonceError.message}`);
                    // Increment as a fallback strategy
                    this.accountNonces[from] = (this.accountNonces[from] || 0) + 1;
                }
            }
            
            console.error(`Worker ${this.workerIndex}: Error in registerDID transaction: ${error.message}`);
            console.error(error.stack);
            throw error;
        }
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
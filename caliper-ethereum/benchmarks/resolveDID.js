'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');

/**
 * Workload module for benchmarking DID Registry resolveDID operations
 */
class ResolveDIDWorkload extends WorkloadModuleBase {
    constructor() {
        super();
        this.contractId = '';
        this.dids = [];
        this.accounts = [];
    }

    /**
     * Initialize the workload module
     */
    async initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext) {
        await super.initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext);
        
        this.contractId = 'DIDRegistry';
        
        // Instead of using sutAdapter.getAccounts(), get accounts from the network configuration
        this.accounts = this.getAccountsFromConfig(sutContext);
        
        if (this.accounts.length === 0) {
            throw new Error('No accounts found in the network configuration. Please provide accounts in your network configuration.');
        }
        
        console.log(`Worker ${workerIndex}: Initialized with ${this.accounts.length} accounts`);
        
        // Use gas limit from arguments if provided
        this.gasLimit = roundArguments.gasLimit || 1000000;
        
        // Generate and register DIDs before resolving them
        const txCount = Math.min(50, roundArguments.assets); // Register up to 50 DIDs
        const batchSize = roundArguments.batchSize || 5; // Register DIDs in batches
        
        for (let i = 0; i < txCount; i += batchSize) {
            const promises = [];
            const currentBatch = Math.min(batchSize, txCount - i);
            
            for (let j = 0; j < currentBatch; j++) {
                const did = `did:test:resolve:${workerIndex}:${i+j}`;
                const publicKey = this.generateBytes(32);
                const serviceEndpoint = this.generateBytes(32);
                
                // Role.ISSUER=1, Role.HOLDER=2
                const role = Math.random() > 0.5 ? 1 : 2;
                
                promises.push(this.registerDID(did, publicKey, serviceEndpoint, role, this.accounts[workerIndex % this.accounts.length]));
            }
            
            const results = await Promise.allSettled(promises);
            
            for (let r of results) {
                if (r.status === 'fulfilled') {
                    this.dids.push(r.value);
                }
            }
            
            // Small delay between batches
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        console.log(`Worker ${workerIndex}: Registered ${this.dids.length} DIDs for the resolveDID workload`);
    }

    /**
     * Extract accounts from the Caliper network configuration
     */
    getAccountsFromConfig(sutContext) {
        if (!sutContext || !sutContext.networkConfig || !sutContext.networkConfig.ethereum) {
            return [];
        }

        const ethConfig = sutContext.networkConfig.ethereum;
        
        // Try to get accounts from different possible locations in the config
        if (ethConfig.accounts && Array.isArray(ethConfig.accounts)) {
            return ethConfig.accounts.map(acc => acc.address);
        }
        
        if (ethConfig.fromAddress) {
            return [ethConfig.fromAddress];
        }
        
        if (ethConfig.contractDeployerAddresses && Array.isArray(ethConfig.contractDeployerAddresses)) {
            return [...ethConfig.contractDeployerAddresses];
        }
        
        return [];
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
     * Register a DID for testing
     */
    async registerDID(did, publicKey, serviceEndpoint, role, account) {
        let txArgs = {
            from: account,
            gas: 3000000,
            gasPrice: 0
        };

        try {
            await this.sutAdapter.sendTransaction('registerDID', this.contractId, txArgs, [did, publicKey, serviceEndpoint, role]);
            return did;
        } catch (error) {
            console.error(`Error in registerDID during setup: ${error}`);
            throw error;
        }
    }

    /**
     * Submit a transaction to the SUT
     */
    async submitTransaction() {
        if (this.dids.length === 0) {
            throw new Error('No DIDs registered for resolving');
        }
        
        // Randomly select a DID to resolve
        const index = Math.floor(Math.random() * this.dids.length);
        const did = this.dids[index];
        
        // Account index to use for this transaction
        const accountIndex = this.workerIndex % this.accounts.length;
        
        let txArgs = {
            from: this.accounts[accountIndex],
            gas: this.gasLimit,
            gasPrice: 0
        };

        try {
            await this.sutAdapter.sendTransaction('resolveDID', this.contractId, txArgs, [did]);
            return did;
        } catch (error) {
            console.error(`Error in resolveDID transaction: ${error}`);
            return error;
        }
    }
}

/**
 * Create a new instance of the workload module
 * @return {ResolveDIDWorkload}
 */
function createWorkloadModule() {
    return new ResolveDIDWorkload();
}

module.exports.createWorkloadModule = createWorkloadModule;
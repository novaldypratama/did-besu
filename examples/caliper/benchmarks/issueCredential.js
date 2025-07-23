'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');
const { Web3 } = require('web3');

/**
 * Workload module for benchmarking CredentialRegistry issueCredential operations
 */
class IssueCredentialWorkload extends WorkloadModuleBase {
    constructor() {
        super();
        this.didRegistryId = '';
        this.credentialRegistryId = '';
        this.issuerDids = [];
        this.holderDids = [];
        this.credentialCount = 0;
        this.accounts = [];
        this.web3 = new Web3();
    }

    /**
     * Initialize the workload module
     */
    async initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext) {
        await super.initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext);
        
        this.didRegistryId = 'DIDRegistry';
        this.credentialRegistryId = 'CredentialRegistry';
        
        // Instead of using sutAdapter.getAccounts(), get accounts from the network configuration
        this.accounts = this.getAccountsFromConfig(sutContext);
        
        if (this.accounts.length === 0) {
            throw new Error('No accounts found in the network configuration. Please provide accounts in your network configuration.');
        }
        
        // Use gas limit from arguments if provided
        this.gasLimit = roundArguments.gasLimit || 4000000;
        
        // Register issuer and holder DIDs for credential issuance
        const account = this.accounts[workerIndex % this.accounts.length];
        
        // Register an issuer DID
        const issuerDid = `did:test:issuer:${workerIndex}:${roundIndex}`;
        await this.registerDID(issuerDid, this.generateBytes(32), this.generateBytes(32), 1, account);
        this.issuerDids.push(issuerDid);
        
        // Register multiple holder DIDs
        const holderCount = roundArguments.initialDIDs || 5; // Number of holder DIDs per worker
        for (let i = 0; i < holderCount; i++) {
            const holderDid = `did:test:holder:${workerIndex}:${roundIndex}:${i}`;
            await this.registerDID(holderDid, this.generateBytes(32), this.generateBytes(32), 2, account);
            this.holderDids.push(holderDid);
        }
        
        console.log(`Worker ${workerIndex}: Registered ${this.issuerDids.length} issuer DIDs and ${this.holderDids.length} holder DIDs for credential issuance`);
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
     * Generate a random credential hash
     */
    generateCredentialHash() {
        return this.web3.utils.keccak256(
            this.web3.utils.utf8ToHex(`credential_content_${this.workerIndex}_${this.credentialCount}`)
        );
    }

    /**
     * Generate a random schema ID
     */
    generateSchemaId() {
        const schemaTypes = this.roundArguments ? this.roundArguments.schemaTypes || 10 : 10;
        return this.web3.utils.keccak256(
            this.web3.utils.utf8ToHex(`schema_${Math.floor(Math.random() * schemaTypes)}`)
        );
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
            await this.sutAdapter.sendTransaction('registerDID', this.didRegistryId, txArgs, [did, publicKey, serviceEndpoint, role]);
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
        if (this.issuerDids.length === 0 || this.holderDids.length === 0) {
            throw new Error('No DIDs registered for credential issuance');
        }
        
        // Generate a unique credential ID
        const credentialId = `credential:${this.workerIndex}:${this.credentialCount++}`;
        
        // Select an issuer and holder DID
        const issuerDid = this.issuerDids[0]; // Use the first issuer for all credentials
        const holderIndex = Math.floor(Math.random() * this.holderDids.length);
        const holderDid = this.holderDids[holderIndex];
        
        // Generate credential data
        const credentialHash = this.generateCredentialHash();
        const schemaId = this.generateSchemaId();
        
        // Calculate expiration date
        const expirationDays = this.roundArguments ? this.roundArguments.expirationDays || 365 : 365;
        const expirationDate = Math.floor(Date.now() / 1000) + (expirationDays * 24 * 60 * 60);
        
        // Account to use for this transaction
        const account = this.accounts[this.workerIndex % this.accounts.length];
        
        let txArgs = {
            from: account,
            gas: this.gasLimit,
            gasPrice: 0
        };

        try {
            await this.sutAdapter.sendTransaction('issueCredential', this.credentialRegistryId, txArgs, 
                [credentialId, issuerDid, holderDid, credentialHash, schemaId, expirationDate]);
            return credentialId;
        } catch (error) {
            console.error(`Error in issueCredential transaction: ${error}`);
            return error;
        }
    }
}

/**
 * Create a new instance of the workload module
 * @return {IssueCredentialWorkload}
 */
function createWorkloadModule() {
    return new IssueCredentialWorkload();
}

module.exports.createWorkloadModule = createWorkloadModule;
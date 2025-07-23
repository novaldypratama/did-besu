'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');
const { Web3 } = require('web3');

/**
 * Workload module for benchmarking CredentialRegistry verifyCredential operations
 */
class VerifyCredentialWorkload extends WorkloadModuleBase {
    constructor() {
        super();
        this.didRegistryId = '';
        this.credentialRegistryId = '';
        this.credentials = [];
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
        this.gasLimit = roundArguments.gasLimit || 3000000;
        
        // Register DIDs and issue credentials for verification
        const account = this.accounts[workerIndex % this.accounts.length];
        
        // Register an issuer DID
        const issuerDid = `did:test:verify:issuer:${workerIndex}`;
        await this.registerDID(issuerDid, this.generateBytes(32), this.generateBytes(32), 1, account);
        
        // Register holder DIDs
        const holderCount = Math.min(10, roundArguments.initialDIDs || 10); // Number of holder DIDs per worker
        const holderDids = [];
        
        for (let i = 0; i < holderCount; i++) {
            const holderDid = `did:test:verify:holder:${workerIndex}:${i}`;
            await this.registerDID(holderDid, this.generateBytes(32), this.generateBytes(32), 2, account);
            holderDids.push(holderDid);
        }
        
        // Issue credentials
        const credentialCount = Math.min(20, roundArguments.initialCredentials || 20); // Issue some credentials per worker
        
        for (let i = 0; i < credentialCount; i++) {
            const credentialId = `credential:verify:${workerIndex}:${i}`;
            const holderDid = holderDids[i % holderDids.length];
            
            // Generate credential data
            const credentialHash = this.generateCredentialHash(i);
            const schemaId = this.generateSchemaId();
            const expirationDate = Math.floor(Date.now() / 1000) + 31536000; // Now + 1 year
            
            try {
                await this.issueCredential(credentialId, issuerDid, holderDid, credentialHash, schemaId, expirationDate, account);
                this.credentials.push({
                    id: credentialId,
                    issuerDid: issuerDid,
                    holderDid: holderDid
                });
            } catch (error) {
                console.error(`Error issuing credential during setup: ${error}`);
            }
        }
        
        console.log(`Worker ${workerIndex}: Issued ${this.credentials.length} credentials for verification`);
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
     * Generate a credential hash
     */
    generateCredentialHash(index) {
        return this.web3.utils.keccak256(
            this.web3.utils.utf8ToHex(`credential_content_verify_${this.workerIndex}_${index}`)
        );
    }

    /**
     * Generate a schema ID
     */
    generateSchemaId() {
        const schemaTypes = this.roundArguments ? this.roundArguments.schemaTypes || 10 : 10;
        return this.web3.utils.keccak256(
            this.web3.utils.utf8ToHex(`schema_verify_${Math.floor(Math.random() * schemaTypes)}`)
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
     * Issue a credential for testing
     */
    async issueCredential(credentialId, issuerDid, holderDid, credentialHash, schemaId, expirationDate, account) {
        let txArgs = {
            from: account,
            gas: 4000000,
            gasPrice: 0
        };

        try {
            await this.sutAdapter.sendTransaction('issueCredential', this.credentialRegistryId, txArgs, 
                [credentialId, issuerDid, holderDid, credentialHash, schemaId, expirationDate]);
            return credentialId;
        } catch (error) {
            console.error(`Error in issueCredential during setup: ${error}`);
            throw error;
        }
    }

    /**
     * Submit a transaction to the SUT
     */
    async submitTransaction() {
        if (this.credentials.length === 0) {
            throw new Error('No credentials issued for verification');
        }
        
        // Select a random credential to verify
        const index = Math.floor(Math.random() * this.credentials.length);
        const credential = this.credentials[index];
        
        // Account to use for this transaction
        const account = this.accounts[this.workerIndex % this.accounts.length];
        
        let txArgs = {
            from: account,
            gas: this.gasLimit,
            gasPrice: 0
        };

        try {
            await this.sutAdapter.sendTransaction('verifyCredential', this.credentialRegistryId, txArgs, 
                [credential.id, credential.issuerDid, credential.holderDid]);
            return credential.id;
        } catch (error) {
            console.error(`Error in verifyCredential transaction: ${error}`);
            return error;
        }
    }
}

/**
 * Create a new instance of the workload module
 * @return {VerifyCredentialWorkload}
 */
function createWorkloadModule() {
    return new VerifyCredentialWorkload();
}

module.exports.createWorkloadModule = createWorkloadModule;
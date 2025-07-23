'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');
const { Web3 } = require('web3');

/**
 * Workload module for benchmarking a mix of SSI operations
 */
class BatchOperationsWorkload extends WorkloadModuleBase {
    constructor() {
        super();
        this.didRegistryId = '';
        this.credentialRegistryId = '';
        this.issuerDids = [];
        this.holderDids = [];
        this.credentials = [];
        this.didCount = 0;
        this.credentialCount = 0;
        this.accounts = [];
        this.operationMix = {};
        this.web3 = new Web3();
    }

    /**
     * Initialize the workload module
     */
    async initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext) {
        await super.initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext);
        
        this.didRegistryId = 'DIDRegistry';
        this.credentialRegistryId = 'CredentialRegistry';
        this.accounts = await this.sutAdapter.getAccounts();
        
        // Store the operation mix ratios from the arguments
        this.operationMix = roundArguments.mix || {
            registerDID: 0.2,
            updateDID: 0.1,
            resolveDID: 0.3,
            issueCredential: 0.2,
            verifyCredential: 0.2
        };
        
        // Register some initial DIDs for operations that need them
        const account = this.accounts[workerIndex % this.accounts.length];
        
        // Register an issuer DID
        const issuerDid = `did:test:batch:issuer:${workerIndex}`;
        await this.registerDID(issuerDid, this.generateBytes(32), this.generateBytes(32), 1, account);
        this.issuerDids.push(issuerDid);
        
        // Register some holder DIDs
        const holderCount = 5;
        for (let i = 0; i < holderCount; i++) {
            const holderDid = `did:test:batch:holder:${workerIndex}:${i}`;
            await this.registerDID(holderDid, this.generateBytes(32), this.generateBytes(32), 2, account);
            this.holderDids.push(holderDid);
        }
        
        // Issue some initial credentials
        const credentialCount = 5;
        for (let i = 0; i < credentialCount; i++) {
            const credentialId = `credential:batch:${workerIndex}:${i}`;
            const holderDid = this.holderDids[i % this.holderDids.length];
            
            try {
                await this.issueCredential(
                    credentialId, 
                    this.issuerDids[0], 
                    holderDid, 
                    this.generateCredentialHash(i),
                    this.generateSchemaId(),
                    Math.floor(Date.now() / 1000) + 31536000, // 1 year
                    account
                );
                
                this.credentials.push({
                    id: credentialId,
                    issuerDid: this.issuerDids[0],
                    holderDid: holderDid
                });
            } catch (error) {
                console.error(`Error issuing credential during setup: ${error}`);
            }
        }
        
        this.didCount = holderCount + 1; // issuer + holders
        this.credentialCount = credentialCount;
        
        console.log(`Worker ${workerIndex}: Initialized with ${this.issuerDids.length} issuer DIDs, ${this.holderDids.length} holder DIDs, and ${this.credentials.length} credentials`);
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
     * Generate a unique, deterministic DID for testing
     */
    generateDID() {
        const did = `did:test:batch:${this.workerIndex}:${this.didCount++}`;
        return did;
    }
    
    /**
     * Generate a credential hash
     */
    generateCredentialHash(index) {
        return this.web3.utils.keccak256(
            this.web3.utils.utf8ToHex(`credential_content_batch_${this.workerIndex}_${index}`)
        );
    }
    
    /**
     * Generate a schema ID
     */
    generateSchemaId() {
        return this.web3.utils.keccak256(
            this.web3.utils.utf8ToHex(`schema_batch_${Math.floor(Math.random() * 10)}`)
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
     * Select a random operation based on the defined mix
     */
    selectRandomOperation() {
        const random = Math.random();
        let cumulativeProbability = 0;
        
        for (const [operation, probability] of Object.entries(this.operationMix)) {
            cumulativeProbability += probability;
            if (random < cumulativeProbability) {
                return operation;
            }
        }
        
        return 'registerDID'; // Default fallback
    }
    
    /**
     * Execute register DID operation
     */
    async executeRegisterDID(account) {
        const did = this.generateDID();
        const publicKey = this.generateBytes(32);
        const serviceEndpoint = this.generateBytes(32);
        const role = Math.random() > 0.5 ? 1 : 2;
        
        let txArgs = {
            from: account,
            gas: 3000000,
            gasPrice: 0
        };
        
        try {
            await this.sutAdapter.sendTransaction('registerDID', this.didRegistryId, txArgs, [did, publicKey, serviceEndpoint, role]);
            
            if (role === 1) {
                this.issuerDids.push(did);
            } else {
                this.holderDids.push(did);
            }
            
            return `registerDID:${did}`;
        } catch (error) {
            console.error(`Error in registerDID operation: ${error}`);
            return error;
        }
    }
    
    /**
     * Execute update DID operation
     */
    async executeUpdateDID(account) {
        if (this.holderDids.length === 0) {
            return this.executeRegisterDID(account);
        }
        
        const index = Math.floor(Math.random() * this.holderDids.length);
        const did = this.holderDids[index];
        const newPublicKey = this.generateBytes(32);
        const newServiceEndpoint = this.generateBytes(32);
        
        let txArgs = {
            from: account,
            gas: 3000000,
            gasPrice: 0
        };
        
        try {
            await this.sutAdapter.sendTransaction('updateDID', this.didRegistryId, txArgs, [did, newPublicKey, newServiceEndpoint]);
            return `updateDID:${did}`;
        } catch (error) {
            console.error(`Error in updateDID operation: ${error}`);
            return error;
        }
    }
    
    /**
     * Execute resolve DID operation
     */
    async executeResolveDID(account) {
        const dids = [...this.issuerDids, ...this.holderDids];
        
        if (dids.length === 0) {
            return this.executeRegisterDID(account);
        }
        
        const index = Math.floor(Math.random() * dids.length);
        const did = dids[index];
        
        let txArgs = {
            from: account,
            gas: 3000000,
            gasPrice: 0
        };
        
        try {
            await this.sutAdapter.sendTransaction('resolveDID', this.didRegistryId, txArgs, [did]);
            return `resolveDID:${did}`;
        } catch (error) {
            console.error(`Error in resolveDID operation: ${error}`);
            return error;
        }
    }
    
    /**
     * Execute issue credential operation
     */
    async executeIssueCredential(account) {
        if (this.issuerDids.length === 0 || this.holderDids.length === 0) {
            // If we don't have DIDs, register some first
            await this.executeRegisterDID(account);
            return this.executeIssueCredential(account);
        }
        
        const credentialId = `credential:batch:${this.workerIndex}:${this.credentialCount++}`;
        const issuerIndex = Math.floor(Math.random() * this.issuerDids.length);
        const holderIndex = Math.floor(Math.random() * this.holderDids.length);
        const issuerDid = this.issuerDids[issuerIndex];
        const holderDid = this.holderDids[holderIndex];
        
        const credentialHash = this.generateCredentialHash(this.credentialCount);
        const schemaId = this.generateSchemaId();
        const expirationDate = Math.floor(Date.now() / 1000) + 31536000; // 1 year
        
        let txArgs = {
            from: account,
            gas: 4000000,
            gasPrice: 0
        };
        
        try {
            await this.sutAdapter.sendTransaction('issueCredential', this.credentialRegistryId, txArgs, 
                [credentialId, issuerDid, holderDid, credentialHash, schemaId, expirationDate]);
            
            this.credentials.push({
                id: credentialId,
                issuerDid: issuerDid,
                holderDid: holderDid
            });
            
            return `issueCredential:${credentialId}`;
        } catch (error) {
            console.error(`Error in issueCredential operation: ${error}`);
            return error;
        }
    }
    
    /**
     * Execute verify credential operation
     */
    async executeVerifyCredential(account) {
        if (this.credentials.length === 0) {
            // If we don't have credentials, issue some first
            await this.executeIssueCredential(account);
            return this.executeVerifyCredential(account);
        }
        
        const index = Math.floor(Math.random() * this.credentials.length);
        const credential = this.credentials[index];
        
        let txArgs = {
            from: account,
            gas: 3000000,
            gasPrice: 0
        };
        
        try {
            await this.sutAdapter.sendTransaction('verifyCredential', this.credentialRegistryId, txArgs, 
                [credential.id, credential.issuerDid, credential.holderDid]);
            return `verifyCredential:${credential.id}`;
        } catch (error) {
            console.error(`Error in verifyCredential operation: ${error}`);
            return error;
        }
    }
    
    /**
     * Submit a transaction to the SUT
     */
    async submitTransaction() {
        const operation = this.selectRandomOperation();
        const account = this.accounts[this.workerIndex % this.accounts.length];
        
        switch (operation) {
            case 'registerDID':
                return this.executeRegisterDID(account);
            case 'updateDID':
                return this.executeUpdateDID(account);
            case 'resolveDID':
                return this.executeResolveDID(account);
            case 'issueCredential':
                return this.executeIssueCredential(account);
            case 'verifyCredential':
                return this.executeVerifyCredential(account);
            default:
                return this.executeRegisterDID(account);
        }
    }
}

/**
 * Create a new instance of the workload module
 * @return {BatchOperationsWorkload}
 */
function createWorkloadModule() {
    return new BatchOperationsWorkload();
}

module.exports.createWorkloadModule = createWorkloadModule;
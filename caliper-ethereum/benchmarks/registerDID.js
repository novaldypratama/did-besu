'use strict';

const DIDOperationBase = require('./utils/did-operation-base');
const DIDState = require('./utils/did-state');
const DIDWeb3SignerHelper = require('./utils/did-web3signer-helper');

/**
 * Workload module for registering DIDs in the SSI/DID system.
 * Benchmarks the registerDID operation of the DIDRegistry contract.
 */
class RegisterDID extends DIDOperationBase {
  /**
   * Initializes the parameters of the workload.
   */
  constructor() {
    super();
    this.web3signerHelper = null;
    this.didRegistryContract = null;
  }

  /**
   * Initialize the workload module with the enhanced Web3Signer integration.
   */
  async initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext) {
    await super.initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext);

    // Initialize DIDWeb3SignerHelper if web3signerUrl is provided
    if (roundArguments.web3signerUrl) {
      // Create Web3Signer helper with worker-specific information
      this.web3signerHelper = new DIDWeb3SignerHelper(
        roundArguments.web3signerUrl,
        roundArguments.besuEndpoint || 'http://172.16.239.15:8545',
        roundArguments.chainId || 1337,
        workerIndex,
        totalWorkers
      );
      
      console.log(`Worker ${workerIndex}: Created Web3Signer helper for ${roundArguments.web3signerUrl}`);
      
      try {
        // Initialize helper and get accounts
        this.accounts = await this.web3signerHelper.initialize();
        console.log(`Worker ${workerIndex}: Assigned ${this.accounts.length} accounts from Web3Signer`);
        
        // Create DID Registry contract instance for direct interactions
        if (this.contractAddresses && this.contractAddresses.DIDRegistry) {
          this.didRegistryContract = this.web3signerHelper.createDIDRegistryContract(
            this.contractAddresses.DIDRegistry
          );
          console.log(`Worker ${workerIndex}: Created DID Registry contract instance at ${this.contractAddresses.DIDRegistry}`);
        }
      } catch (error) {
        console.error(`Worker ${workerIndex}: Failed to initialize Web3Signer helper: ${error.message}`);
        // Continue with operation - will use fallback mechanisms
      }
    } else {
      console.log(`Worker ${workerIndex}: No Web3Signer URL provided, using standard adapter only`);
    }
  }

  /**
   * Create an SSI/DID state instance.
   * @return {DIDState} The state instance.
   */
  createDIDState() {
    return new DIDState(
      this.workerIndex,
      this.didPrefix,
      this.issuerCount,
      this.holderCount,
      this.verifierCount
    );
  }

  /**
   * Assemble transactions for registering DIDs.
   * @async
   */
  async submitTransaction() {
    // Determine what type of DID to register based on target counts
    let registerArgs;
    
    if (this.didState.issuerCount < this.didState.targetIssuerCount) {
      registerArgs = this.didState.getRegisterIssuerDIDArguments();
      console.log(`Worker ${this.workerIndex}: Registering ISSUER DID: ${registerArgs.did}`);
    } 
    else if (this.didState.holderCount < this.didState.targetHolderCount) {
      registerArgs = this.didState.getRegisterHolderDIDArguments();
      console.log(`Worker ${this.workerIndex}: Registering HOLDER DID: ${registerArgs.did}`);
    } 
    else if (this.didState.verifierCount < this.didState.targetVerifierCount) {
      registerArgs = this.didState.getRegisterVerifierDIDArguments();
      console.log(`Worker ${this.workerIndex}: Registering VERIFIER DID: ${registerArgs.did}`);
    } 
    else {
      // If all targets are met, alternate between issuer and holder
      if (this.didState.issuerCount <= this.didState.holderCount) {
        registerArgs = this.didState.getRegisterIssuerDIDArguments();
        console.log(`Worker ${this.workerIndex}: Additional ISSUER DID: ${registerArgs.did}`);
      } else {
        registerArgs = this.didState.getRegisterHolderDIDArguments();
        console.log(`Worker ${this.workerIndex}: Additional HOLDER DID: ${registerArgs.did}`);
      }
    }
    
    try {
      // First attempt - try using Web3Signer helper directly if available
      if (this.web3signerHelper && this.didRegistryContract) {
        console.log(`Worker ${this.workerIndex}: Using Web3Signer helper to register DID`);
        
        // Get the next account to use
        const account = this.web3signerHelper.getNextAccount();
        
        // Register DID directly using the helper
        const txHash = await this.didRegistryContract.registerDID(
          registerArgs.did,
          registerArgs.publicKey,
          registerArgs.serviceEndpoint,
          registerArgs.role,
          account
        );
        
        console.log(`Worker ${this.workerIndex}: Successfully registered DID via Web3Signer. TX: ${txHash}`);
        return registerArgs.did;
      }
      
      // Second attempt - standard Caliper adapter
      console.log(`Worker ${this.workerIndex}: Using Caliper adapter to register DID`);
      await this.sutAdapter.sendRequests(this.createDIDRegistryRequest('registerDID', registerArgs));
      console.log(`Worker ${this.workerIndex}: Successfully registered DID via Caliper adapter`);
    } 
    catch (error) {
      console.error(`Worker ${this.workerIndex}: Error in registerDID transaction: ${error.message}`);
      
      // Attempt recovery with Web3Signer helper if available
      if (this.web3signerHelper && this.didRegistryContract) {
        console.log(`Worker ${this.workerIndex}: Attempting recovery using Web3Signer helper...`);
        
        try {
          // Refresh nonces and try again with a different account if available
          await this.web3signerHelper.refreshAccountNonce(this.web3signerHelper.getNextAccount());
          
          // Register DID with direct signing and retry logic built into the helper
          const txHash = await this.didRegistryContract.registerDID(
            registerArgs.did,
            registerArgs.publicKey,
            registerArgs.serviceEndpoint,
            registerArgs.role
          );
          
          console.log(`Worker ${this.workerIndex}: Recovery successful. TX: ${txHash}`);
        } catch (retryError) {
          console.error(`Worker ${this.workerIndex}: Recovery failed: ${retryError.message}`);
          throw retryError;
        }
      } else {
        throw error;
      }
    }
    
    return registerArgs.did;
  }
}

/**
 * Create a new instance of the workload module.
 * @return {WorkloadModuleInterface}
 */
function createWorkloadModule() {
  return new RegisterDID();
}

module.exports.createWorkloadModule = createWorkloadModule;
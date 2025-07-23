'use strict';

const DIDOperationBase = require('./utils/did-operation-base');
const DIDState = require('./utils/did-state');
const DIDWeb3SignerHelper = require('./utils/did-web3signer-helper');
const { isAddress } = require('web3-validator');

/**
 * Workload module for registering DIDs in the SSI/DID system.
 * Benchmarks the registerDID operation of the DIDRegistry contract.
 * Enhanced with robust error handling and fallback mechanisms.
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
    if (this.useWeb3Signer && this.web3signerUrl) {
      console.log(`Worker ${workerIndex}: Creating Web3Signer helper for ${this.web3signerUrl} (JSON-RPC: ${this.useJsonRpc ? 'enabled' : 'disabled'})`);

      try {
        // Create Web3Signer helper with worker-specific information
        this.web3signerHelper = new DIDWeb3SignerHelper(
          this.web3signerUrl,
          this.besuEndpoint,
          this.chainId,
          workerIndex,
          totalWorkers,
          {
            useJsonRpc: this.useJsonRpc,
            jsonRpcTimeout: this.jsonRpcTimeout || 30000
          }
        );

        // Initialize helper and get accounts
        this.accounts = await this.web3signerHelper.initialize();
        console.log(`Worker ${workerIndex}: Assigned ${this.accounts.length} accounts from Web3Signer`);

        // Create DID Registry contract instance for direct interactions
        if (this.contractAddresses && this.contractAddresses.DIDRegistry) {
          this.didRegistryContract = this.web3signerHelper.createDIDRegistryContract(
            this.contractAddresses.DIDRegistry
          );
          console.log(`Worker ${workerIndex}: Created DID Registry contract instance at ${this.contractAddresses.DIDRegistry}`);
        } else {
          console.warn(`Worker ${workerIndex}: No DIDRegistry contract address provided, direct contract interaction disabled`);
        }
      } catch (error) {
        console.error(`Worker ${workerIndex}: Failed to initialize Web3Signer helper: ${error.message}`);
        console.log(`Worker ${workerIndex}: Will use standard Caliper adapter as fallback`);
        this.web3signerHelper = null;
      }
    } else {
      console.log(`Worker ${workerIndex}: No Web3Signer URL provided, using standard adapter only`);
    }

    // Initialize transaction stats for reporting
    this.registerStats = {
      issuers: { success: 0, failed: 0 },
      holders: { success: 0, failed: 0 },
      verifiers: { success: 0, failed: 0 }
    };
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
    let didType;

    if (this.didState.issuerCount < this.didState.targetIssuerCount) {
      registerArgs = this.didState.getRegisterIssuerDIDArguments();
      didType = 'issuer';
    }
    else if (this.didState.holderCount < this.didState.targetHolderCount) {
      registerArgs = this.didState.getRegisterHolderDIDArguments();
      didType = 'holder';
    }
    else if (this.didState.verifierCount < this.didState.targetVerifierCount) {
      registerArgs = this.didState.getRegisterVerifierDIDArguments();
      didType = 'verifier';
    }
    else {
      // If all targets are met, alternate between issuer and holder
      if (this.didState.issuerCount <= this.didState.holderCount) {
        registerArgs = this.didState.getRegisterIssuerDIDArguments();
        didType = 'issuer';
      } else {
        registerArgs = this.didState.getRegisterHolderDIDArguments();
        didType = 'holder';
      }
    }

    // Execute the registration with fallback mechanisms
    try {
      // Use the executeWithFallback helper from the base class
      await this.executeWithFallback(
        // Primary method - use Web3Signer helper if available
        async () => {
          if (!this.web3signerHelper || !this.didRegistryContract) {
            throw new Error('Web3Signer helper or contract not available');
          }

          console.log(`Worker ${this.workerIndex}: Using Web3Signer to register ${didType.toUpperCase()} DID: ${registerArgs.did}`);

          // Get the next account to use
          const account = this.web3signerHelper.getNextAccount();

          console.log(`Worker ${this.workerIndex}: Using Web3Signer to register ${didType.toUpperCase()} DID: ${registerArgs.did}`);

          // Register DID directly using the helper
          const txHash = await this.didRegistryContract.registerDID(
            registerArgs.did,
            registerArgs.publicKey,
            registerArgs.serviceEndpoint,
            registerArgs.role,
            account
          );

          console.log(`Worker ${this.workerIndex}: Successfully registered ${didType.toUpperCase()} DID via Web3Signer. TX: ${txHash}`);
          return registerArgs.did;
        },

        // Fallback method - use standard Caliper adapter
        async () => {
          console.log(`Worker ${this.workerIndex}: Using Caliper adapter to register ${didType.toUpperCase()} DID: ${registerArgs.did}`);

          // Add nonce parameter if needed (for newer DID registry contracts)
          const args = { ...registerArgs };
          if (this.roundArguments.useNonce) {
            args.expectedNonce = 0; // Default to 0 for adapter calls
          }

          await this.sutAdapter.sendRequests(this.createDIDRegistryRequest(
            'registerDID',
            args,
            { gas: this.gasLimit }
          ));

          console.log(`Worker ${this.workerIndex}: Successfully registered ${didType.toUpperCase()} DID via Caliper adapter`);
          return registerArgs.did;
        },

        // Operation name for logging
        `registerDID-${didType}`
      );

      // Track success by type
      this.registerStats[`${didType}s`].success++;

      return registerArgs.did;
    }
    catch (error) {
      console.error(`Worker ${this.workerIndex}: Failed to register ${didType.toUpperCase()} DID after all attempts: ${error.message}`);

      // Track failure by type
      this.registerStats[`${didType}s`].failed++;

      // Return null to indicate failure - Caliper will record this as a failed tx
      return null;
    }
  }

  /**
   * Report DID registration statistics
   */
  async cleanupWorkloadModule() {
    // Log DID state statistics
    const stats = this.didState.getStats();
    console.log(`Worker ${this.workerIndex} DID Statistics:
    Issuers: ${stats.issuers.total} (${stats.issuers.active} active)
    Holders: ${stats.holders.total} (${stats.holders.active} active)
    Verifiers: ${stats.verifiers.total} (${stats.verifiers.active} active)
    Total DIDs: ${stats.total}
    
    Registration Success Rates:
    Issuers: ${this.registerStats.issuers.success}/${this.registerStats.issuers.success + this.registerStats.issuers.failed} (${this.registerStats.issuers.success > 0 ? (this.registerStats.issuers.success / (this.registerStats.issuers.success + this.registerStats.issuers.failed) * 100).toFixed(2) : 0}%)
    Holders: ${this.registerStats.holders.success}/${this.registerStats.holders.success + this.registerStats.holders.failed} (${this.registerStats.holders.success > 0 ? (this.registerStats.holders.success / (this.registerStats.holders.success + this.registerStats.holders.failed) * 100).toFixed(2) : 0}%)
    Verifiers: ${this.registerStats.verifiers.success}/${this.registerStats.verifiers.success + this.registerStats.verifiers.failed} (${this.registerStats.verifiers.success > 0 ? (this.registerStats.verifiers.success / (this.registerStats.verifiers.success + this.registerStats.verifiers.failed) * 100).toFixed(2) : 0}%)
    `);

    // Call parent cleanup for transaction stats
    await super.cleanupWorkloadModule();
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
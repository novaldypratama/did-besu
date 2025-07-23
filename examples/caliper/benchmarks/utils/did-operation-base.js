'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');

const SUPPORTED_CONNECTOR = 'ethereum';

/**
 * Base class for SSI/DID Ethereum operations.
 * Extends the standard Caliper WorkloadModuleBase with SSI-specific functionality.
 */
class DIDOperationBase extends WorkloadModuleBase {
  /**
   * Initializes the workload module with the given parameters.
   * @param {number} workerIndex - Index of the worker instantiating the module.
   * @param {number} totalWorkers - Total number of workers.
   * @param {number} roundIndex - Index of the current round.
   * @param {Object} roundArguments - Benchmark configuration arguments.
   * @param {ConnectorBase} sutAdapter - System under test adapter.
   * @param {Object} sutContext - Custom context from the adapter.
   */
  async initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext) {
    await super.initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext);

    this.assertConnectorType();

    // Common default values
    this.defaultValues = {
      didPrefix: 'did:besu:',
      issuerCount: 2,
      holderCount: 2,
      verifierCount: 2,
      gasLimit: 6000000
    };

    // Store common SSI/DID settings with fallbacks to defaults
    this.didPrefix = roundArguments.didPrefix || this.defaultValues.didPrefix;
    this.issuerCount = roundArguments.issuerCount || this.defaultValues.issuerCount;
    this.holderCount = roundArguments.holderCount || this.defaultValues.holderCount;
    this.verifierCount = roundArguments.verifierCount || this.defaultValues.verifierCount;

    // Use Web3Signer if provided - Now supporting both REST API and JSON-RPC API
    this.useWeb3Signer = !!roundArguments.web3signerUrl;
    this.web3signerUrl = roundArguments.web3signerUrl;
    this.besuEndpoint = roundArguments.besuEndpoint || 'ws://172.16.239.15:8546';
    this.chainId = roundArguments.chainId || 1337;

    // JSON-RPC specific settings
    this.useJsonRpc = roundArguments.useJsonRpc !== false; // Default to true
    this.jsonRpcTimeout = roundArguments.jsonRpcTimeout || 30000; // Default 30s timeout

    // Contract addresses - with validation
    if (roundArguments.contractAddresses) {
      this.contractAddresses = roundArguments.contractAddresses;
      // Validate that at least the DIDRegistry address is provided
      if (!this.contractAddresses.DIDRegistry) {
        console.warn(`Worker ${workerIndex}: Missing DIDRegistry address. Some operations may fail.`);
      }
    } else {
      console.warn(`Worker ${workerIndex}: No contract addresses provided. Using default adapter calls.`);
      this.contractAddresses = {}; // Initialize as empty object to avoid null reference errors
    }

    // Gas limit settings
    this.gasLimit = roundArguments.gasLimit || this.defaultValues.gasLimit;

    // Track transaction statuses for reporting
    this.txStats = {
      attempted: 0,
      succeeded: 0,
      failed: 0,
      errors: {}  // Count of different error types
    };

    // Initialize SSI/DID state
    try {
      this.didState = this.createDIDState();
      console.log(`Worker ${workerIndex}: Successfully initialized DID state`);
    } catch (error) {
      console.error(`Worker ${workerIndex}: Failed to initialize DID state: ${error.message}`);
      throw error; // Re-throw to halt initialization - can't proceed without state
    }
  }

  /**
   * Override to provide a DIDState instance.
   * Each specific workload module must implement this.
   * @protected
   */
  createDIDState() {
    throw new Error('SSI/DID workload error: "createDIDState" must be overridden in derived classes');
  }

  /**
   * Ensures the connectorType is supported (Ethereum only).
   * @protected
   */
  assertConnectorType() {
    this.connectorType = this.sutAdapter.getType();
    if (this.connectorType !== SUPPORTED_CONNECTOR) {
      throw new Error(`Connector type ${this.connectorType} is not supported; expected: ${SUPPORTED_CONNECTOR}`);
    }
  }

  /**
   * Ensures a required setting is present in roundArguments.
   * @param {string} settingName - Name of the required setting
   * @param {boolean} fatal - If true, throws an error; otherwise, logs a warning
   * @protected
   */
  assertSetting(settingName, fatal = true) {
    if (!this.roundArguments.hasOwnProperty(settingName)) {
      const message = `SSI/DID workload error: module setting "${settingName}" is missing from the benchmark configuration file`;

      if (fatal) {
        throw new Error(message);
      } else {
        console.warn(`Worker ${this.workerIndex}: ${message}`);
      }

      return false;
    }
    return true;
  }

  /**
   * Creates an Ethereum-specific request for a DID Registry operation.
   * @param {string} operation - The contract operation to invoke
   * @param {Object} args - The arguments for the operation
   * @param {Object} options - Additional options (gas, etc.)
   * @returns {Object} - The connector request object
   * @protected
   */
  createDIDRegistryRequest(operation, args, options = {}) {
    // Determine if this is a read-only operation
    const readOnlyOps = ['resolveDID', 'isDIDActive', 'getDIDsByOwner', 'isDIDOwnedBy'];
    const readOnly = readOnlyOps.includes(operation);

    return {
      contract: 'DIDRegistry',
      verb: operation,
      args: Object.values(args),
      readOnly: readOnly,
      gas: options.gas || this.gasLimit
    };
  }

  /**
   * Creates an Ethereum-specific request for a Credential Registry operation.
   * @param {string} operation - The contract operation to invoke
   * @param {Object} args - The arguments for the operation
   * @param {Object} options - Additional options (gas, etc.)
   * @returns {Object} - The connector request object
   * @protected
   */
  createCredentialRegistryRequest(operation, args, options = {}) {
    // Determine if this is a read-only operation
    const readOnlyOps = ['getCredential', 'getCredentialsByIssuer', 'getCredentialsByHolder', 'verifyCredential'];
    const readOnly = readOnlyOps.includes(operation);

    return {
      contract: 'CredentialRegistry',
      verb: operation,
      args: Object.values(args),
      readOnly: readOnly,
      gas: options.gas || this.gasLimit
    };
  }

  /**
   * Helper to execute a transaction with fallback and error tracking
   * @param {Function} primaryMethod - The primary method to try
   * @param {Function} fallbackMethod - The fallback method to use if primary fails
   * @param {string} operationName - Name of the operation for logging
   * @returns {Promise<any>} - Result of the operation
   * @protected
   */
  async executeWithFallback(primaryMethod, fallbackMethod, operationName) {
    this.txStats.attempted++;

    try {
      const result = await primaryMethod();
      this.txStats.succeeded++;
      return result;
    } catch (primaryError) {
      // Enhanced error logging for RPC errors
      if (primaryError.response && primaryError.response.data) {
        console.warn(`Worker ${this.workerIndex}: Primary method failed for ${operationName} with server error:`, {
          status: primaryError.response.status,
          error: primaryError.response.data.error || primaryError.response.data
        });
      } else {
        console.warn(`Worker ${this.workerIndex}: Primary method failed for ${operationName}: ${primaryError.message}`);
      }

      console.warn(`Worker ${this.workerIndex}: Attempting fallback for ${operationName}`);

      // Track error type
      let errorType = "unknown";
      if (primaryError.message) {
        // For JSON-RPC errors, extract the error code if available
        if (primaryError.response && primaryError.response.data && primaryError.response.data.error) {
          errorType = `JSON-RPC-${primaryError.response.data.error.code || 'unknown'}: ${primaryError.response.data.error.message || primaryError.message.substring(0, 50)
            }`;
        } else {
          errorType = primaryError.message.substring(0, 50); // Truncate long messages
        }
      }

      this.txStats.errors[errorType] = (this.txStats.errors[errorType] || 0) + 1;

      try {
        const result = await fallbackMethod();
        this.txStats.succeeded++;
        return result;
      } catch (fallbackError) {
        // Enhanced error logging for fallback errors
        if (fallbackError.response && fallbackError.response.data) {
          console.error(`Worker ${this.workerIndex}: Fallback also failed for ${operationName} with server error:`, {
            status: fallbackError.response.status,
            error: fallbackError.response.data.error || fallbackError.response.data
          });
        } else {
          console.error(`Worker ${this.workerIndex}: Fallback also failed for ${operationName}: ${fallbackError.message}`);
        }

        // Track error type
        let fallbackErrorType = "unknown";
        if (fallbackError.message) {
          if (fallbackError.response && fallbackError.response.data && fallbackError.response.data.error) {
            fallbackErrorType = `Fallback-JSON-RPC-${fallbackError.response.data.error.code || 'unknown'}: ${fallbackError.response.data.error.message || fallbackError.message.substring(0, 50)
              }`;
          } else {
            fallbackErrorType = `Fallback: ${fallbackError.message.substring(0, 50)}`; // Truncate long messages
          }
        }

        this.txStats.errors[fallbackErrorType] = (this.txStats.errors[fallbackErrorType] || 0) + 1;

        this.txStats.failed++;
        throw fallbackError; // Re-throw to let caller handle
      }
    }
  }

  /**
   * Report transaction statistics at round end
   */
  async cleanupWorkloadModule() {
    console.log(`Worker ${this.workerIndex} Transaction Statistics:
    Attempted: ${this.txStats.attempted}
    Succeeded: ${this.txStats.succeeded}
    Failed: ${this.txStats.failed}
    Success Rate: ${(this.txStats.succeeded / this.txStats.attempted * 100).toFixed(2)}%
    Error Types: ${JSON.stringify(this.txStats.errors, null, 2)}
    `);

    // Call parent cleanup
    if (super.cleanupWorkloadModule) {
      await super.cleanupWorkloadModule();
    }
  }
}

module.exports = DIDOperationBase;

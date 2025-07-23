'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');

const SUPPORTED_CONNECTOR = 'ethereum';

/**
 * Base class for simple Ethereum operations.
 */
class OperationBase extends WorkloadModuleBase {
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
    this.assertSetting('initialMoney');
    this.assertSetting('moneyToTransfer');
    this.assertSetting('numberOfAccounts');

    this.initialMoney = roundArguments.initialMoney;
    this.moneyToTransfer = roundArguments.moneyToTransfer;
    this.numberOfAccounts = roundArguments.numberOfAccounts;

    // Initialize a nonce tracker for transaction sequencing
    this.nonceTracker = {};

    // Safely check if accounts exist before accessing
    if (this.sutAdapter.accounts && this.sutAdapter.accounts.length > 0) {
      // Use consistent account selection based on worker index to avoid nonce conflicts
      this.clientIdx = this.workerIndex % this.sutAdapter.accounts.length;
      this.fromAddress = this.sutAdapter.accounts[this.clientIdx].address;
      this.fromAddressPrivateKey = this.sutAdapter.accounts[this.clientIdx].privateKey;

      console.log(`Worker ${this.workerIndex} using account: ${this.fromAddress}`);
    } else {
      // Fallback - this allows the code to work even if accounts aren't properly set up
      console.log(`Worker ${this.workerIndex} couldn't find accounts in sutAdapter, using default connector settings`);
    }

    // Initialize the simple state after setting up accounts
    this.simpleState = this.createSimpleState();
  }

  /**
   * Override to provide a SimpleState instance.
   * @protected
   */
  createSimpleState() {
    throw new Error('Simple workload error: "createSimpleState" must be overridden in derived classes');
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
   * @param {string} settingName
   * @protected
   */
  assertSetting(settingName) {
    if (!this.roundArguments.hasOwnProperty(settingName)) {
      throw new Error(`Simple workload error: module setting "${settingName}" is missing from the benchmark configuration file`);
    }
  }

  /**
   * Creates an Ethereum-specific request with transaction signing details.
   * @param {string} operation The contract function to call
   * @param {Object} args The arguments for the function call
   * @returns {Object} The connector request configuration
   * @protected
   */
  createConnectorRequest(operation, args) {
    const query = operation === 'query';

    // For query (read-only) operations, we don't need transaction signing
    if (query) {
      return {
        contract: 'SimpleContract',
        verb: operation,
        args: Object.values(args),
        readOnly: true
      };
    }

    // For write operations, include transaction signing details
    return {
      contract: 'SimpleContract',
      verb: operation,
      args: Object.values(args),
      readOnly: false,
      // The following fields enable transaction signing in the connector
      fromAddress: this.fromAddress,
      fromAddressPrivateKey: this.fromAddressPrivateKey,
      // The gas settings are important - take them from the network config
      gas: {
        price: 0, // Use the gas price from contract configuration
        limit: operation === 'open' ? 70000 :
          operation === 'transfer' ? 70000 : 100000
      },
      // Flag to tell Caliper to sign the transaction
      useRawTransaction: true
    };
  }
}

module.exports = OperationBase;
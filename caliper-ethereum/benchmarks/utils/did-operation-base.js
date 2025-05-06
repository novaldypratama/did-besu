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

    // Assert required SSI-specific settings
    this.assertSetting('didPrefix');
    this.assertSetting('issuerCount');
    this.assertSetting('holderCount');
    this.assertSetting('verifierCount');

    // Store common SSI/DID settings
    this.didPrefix = roundArguments.didPrefix;
    this.issuerCount = roundArguments.issuerCount;
    this.holderCount = roundArguments.holderCount;
    this.verifierCount = roundArguments.verifierCount;

    // Contract addresses
    this.assertSetting('contractAddresses');
    this.contractAddresses = roundArguments.contractAddresses;

    // Gas limit settings
    this.gasLimit = roundArguments.gasLimit || 6000000;

    // Initialize SSI/DID state
    this.didState = this.createDIDState();
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
   * @param {string} settingName
   * @protected
   */
  assertSetting(settingName) {
    if (!this.roundArguments.hasOwnProperty(settingName)) {
      throw new Error(`SSI/DID workload error: module setting "${settingName}" is missing from the benchmark configuration file`);
    }
  }

  /**
   * Creates an Ethereum-specific request for a DID Registry operation.
   * @param {string} operation - The contract operation to invoke
   * @param {Object} args - The arguments for the operation
   * @returns {Object} - The connector request object
   * @protected
   */
  createDIDRegistryRequest(operation, args) {
    const query = ['registerDID', 'updateDID', 'deactivateDID', 'resolveDID', 'isDIDActive', 'getDIDsByOwner', 'isDIDOwnedBy'].includes(operation);
    return {
      contract: 'DIDRegistry',
      verb: operation,
      args: Object.values(args),
      readOnly: query
    };
  }

  /**
   * Creates an Ethereum-specific request for a Credential Registry operation.
   * @param {string} operation - The contract operation to invoke
   * @param {Object} args - The arguments for the operation
   * @returns {Object} - The connector request object
   * @protected
   */
  createCredentialRegistryRequest(operation, args) {
    const query = ['issueCredential', 'revokeCredential', 'suspendCredential', 'activeCredential', 'verifyCredential', 'getCredential', 'getCredentialsByIssuer', 'getCredentialsByHolder'].includes(operation);
    return {
      contract: 'CredentialRegistry',
      verb: operation,
      args: Object.values(args),
      readOnly: query
    };
  }
}

module.exports = DIDOperationBase;

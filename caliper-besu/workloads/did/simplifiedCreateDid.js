'use strict';

const SimplifiedSSIOperationBase = require('../utils/simplified-ssi-operation');
const SimplifiedSSIStateManager = require('../utils/simplified-ssi-state');

/**
 * Simplified DID Creation Workload for Caliper Benchmarking
 * Integrates with Web3Signer for Besu security architecture
 */
class SimplifiedCreateDid extends SimplifiedSSIOperationBase {
  /**
   * Initialize the workload module
   */
  constructor() {
    super();
    this.operationType = 'createDid';
  }

  /**
   * Create an SSI state manager instance
   * @returns {SimplifiedSSIStateManager} State manager instance
   */
  createSSIState() {
    return new SimplifiedSSIStateManager(this.workerIndex, 'did', this.ssiConfig);
  }

  /**
   * Execute a single transaction
   * @returns {Promise} Transaction result
   */
  async submitTransaction() {
    try {
      console.log(`Worker ${this.workerIndex}: Starting DID creation...`);
      
      // Get DID creation arguments from state manager
      const didArgs = this.ssiState.getDIDCreationArguments();
      
      if (!didArgs) {
        throw new Error('Failed to generate DID creation arguments');
      }
      
      console.log(`DID creation args:`, {
        identity: didArgs.identity,
        docHash: `${didArgs.docHash.substring(0, 10)}...`,
        cidLength: didArgs.docCid.length
      });
      
      // Execute DID creation operation
      const result = await this.executeSSIOperation(
        SimplifiedSSIOperationBase.CONTRACTS.DID_REGISTRY,
        SimplifiedSSIOperationBase.OPERATIONS.CREATE_DID,
        didArgs
      );
      
      console.log(`✅ DID creation successful for Worker ${this.workerIndex}`);
      
      return result;
    } catch (error) {
      console.error(`❌ DID creation failed for Worker ${this.workerIndex}: ${error.message}`);
      throw error;
    }
  }
}

/**
 * Create a new workload module instance
 * @returns {SimplifiedCreateDid} Workload module instance
 */
function createWorkloadModule() {
  return new SimplifiedCreateDid();
}

module.exports.createWorkloadModule = createWorkloadModule;
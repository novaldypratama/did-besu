'use strict';

const SSIOperationBase = require('../utils/ssi-operation-base');
const SSIStateManager = require('../utils/ssi-state-manager');

/**
 * DID Creation Workload for SSI Benchmarking
 * Tests the performance of DID creation operations on the DidRegistry contract
 */
class CreateDID extends SSIOperationBase {
  constructor() {
    super();
  }

  /**
   * Create SSI state manager configured for DID operations
   */
  createSSIState() {
    return new SSIStateManager(
      this.workerIndex,
      SSIStateManager.ENTITY_TYPES.DID,
      this.ssiConfig
    );
  }

  /**
   * Execute DID creation transaction
   */
  async submitTransaction() {
    try {
      console.log(`🆔 Worker ${this.workerIndex}: Starting DID creation...`);

      // Get DID creation arguments from state manager
      const didArgs = this.ssiState.getDIDCreationArguments();
      console.log(`📋 DID creation args:`, {
        identity: didArgs.identity,
        docHash: didArgs.docHash.substring(0, 10) + '...',
        docCid: didArgs.docCid
      });

      // Execute the DID creation on DidRegistry contract
      await this.executeSSIOperation(
        SSIOperationBase.CONTRACTS.DID_REGISTRY,
        SSIOperationBase.OPERATIONS.CREATE_DID,
        didArgs
      );

      console.log(`✅ DID creation completed for Worker ${this.workerIndex}`);

      // Log state statistics
      const stats = this.ssiState.getStateStatistics();
      console.log(`📊 Worker ${this.workerIndex} state: ${stats.entities.dids} DIDs created`);

    } catch (error) {
      console.error(`❌ DID creation failed for Worker ${this.workerIndex}: ${error.message}`);
      throw error;
    }
  }
}

/**
 * Caliper workload module factory function
 */
function createWorkloadModule() {
  return new CreateDID();
}

module.exports.createWorkloadModule = createWorkloadModule;
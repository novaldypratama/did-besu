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
    this.debugMode = false; // Set to true for verbose logging
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
      // Get DID creation arguments from state manager - now async
      const didArgs = await this.ssiState.getDIDCreationArguments();
      
      if (!didArgs) {
        throw new Error('Failed to generate DID creation arguments');
      }
      
      // Execute DID creation operation using WebSocket provider
      // For createDid(address identity, bytes32 docHash, string calldata docCid)
      // The identity address will be used as the fromAddress (caller) for the transaction
      const createDidArgs = {
        identity: didArgs.identity,
        docHash: didArgs.docHash,
        docCid: didArgs.docCid
      };
      
      // CRITICAL FIX: Use the identity address as the transaction sender
      // This distributes transactions across multiple accounts instead of using only DEPLOYER_ADDRESS
      // Prevents nonce conflicts when running high TPS benchmarks
      const result = await this.executeSSIOperation(
        SimplifiedSSIOperationBase.CONTRACTS.DID_REGISTRY,
        SimplifiedSSIOperationBase.OPERATIONS.CREATE_DID,
        createDidArgs,
        { fromAddress: didArgs.identity } // Use identity as the transaction sender
      );
      
      if (this.debugMode) {
        console.log(`✅ DID creation successful for Worker ${this.workerIndex}`);
      }
      
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
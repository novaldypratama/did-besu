'use strict';

const SSIOperationBase = require('../utils/ssi-operation-base');
const SSIStateManager = require('../utils/ssi-state-manager');

/**
 * Role Assignment using Deployer Account (Quick Fix)
 * Uses the contract deployer account which has TRUSTEE permissions by default
 */
class AssignRole extends SSIOperationBase {
  constructor() {
    super();
  }

  createSSIState() {
    return new SSIStateManager(
      this.workerIndex,
      SSIStateManager.ENTITY_TYPES.ROLE,
      this.ssiConfig
    );
  }

  /**
   * Override account setup to use deployer account instead of worker account
   */
  setupAccountManagement() {
    // Initialize nonce tracker
    this.nonceTracker = {};

    // Get deployer account from network configuration (has TRUSTEE role by default)
    const deployerInfo = this.getDeployerAccountInfo();
    
    if (deployerInfo.address && deployerInfo.privateKey) {
      this.fromAddress = deployerInfo.address;
      this.fromAddressPrivateKey = deployerInfo.privateKey;
      
      console.log(`👤 Worker ${this.workerIndex} using DEPLOYER account with TRUSTEE permissions: ${this.fromAddress}`);
    } else {
      // Fallback to parent setup
      super.setupAccountManagement();
      console.log(`⚠️  Worker ${this.workerIndex} falling back to worker account - may lack permissions`);
    }

    // Initialize nonce tracker
    if (this.fromAddress) {
      this.nonceTracker[this.fromAddress] = 0;
    }
  }

  /**
   * Get deployer account information from network configuration
   */
  getDeployerAccountInfo() {
    try {
      // Try multiple paths to find deployer account
      const accessPaths = [
        () => ({
          address: this.sutAdapter.context?.networkConfiguration?.ethereum?.contractDeployerAddresses,
          privateKey: this.sutAdapter.context?.networkConfiguration?.ethereum?.contractDeployerAddressPrivateKeys
        }),
        () => ({
          address: this.sutAdapter.networkConfiguration?.ethereum?.contractDeployerAddresses,
          privateKey: this.sutAdapter.networkConfiguration?.ethereum?.contractDeployerAddressPrivateKeys
        }),
        () => ({
          address: this.sutAdapter.ethereumConfig?.contractDeployerAddresses,
          privateKey: this.sutAdapter.ethereumConfig?.contractDeployerAddressPrivateKeys
        }),
        () => ({
          address: this.sutAdapter.context?.networkConfiguration?.ethereum?.fromAddress,
          privateKey: this.sutAdapter.context?.networkConfiguration?.ethereum?.fromAddressPrivateKey
        })
      ];

      for (const getInfo of accessPaths) {
        try {
          const info = getInfo();
          if (info.address && info.privateKey) {
            console.log(`✅ Found deployer account via network configuration`);
            return info;
          }
        } catch (error) {
          // Try next path
          continue;
        }
      }

      console.warn(`⚠️  Could not find deployer account in network configuration`);
      return { address: null, privateKey: null };

    } catch (error) {
      console.warn(`⚠️  Error accessing deployer account: ${error.message}`);
      return { address: null, privateKey: null };
    }
  }

  async submitTransaction() {
    try {
      console.log(`👤 Worker ${this.workerIndex}: Starting role assignment with TRUSTEE permissions...`);

      // Use deployer account which has TRUSTEE role by default
      const roleControlContract = SSIOperationBase.CONTRACTS.ROLE_CONTROL;
      const assignRoleOperation = SSIOperationBase.OPERATIONS.ASSIGN_ROLE;

      // Get role assignment arguments
      const roleArgs = this.ssiState.getRoleAssignmentArguments();
      console.log(`📋 Role assignment args:`, {
        role: roleArgs.role,
        account: roleArgs.account,
        assignedBy: this.fromAddress,
        worker: this.workerIndex
      });

      // Execute role assignment with TRUSTEE permissions
      await this.executeSSIOperation(
        roleControlContract,
        assignRoleOperation,
        roleArgs
      );

      console.log(`✅ Role assignment completed with TRUSTEE permissions for Worker ${this.workerIndex}`);

    } catch (error) {
      console.error(`❌ Role assignment failed for Worker ${this.workerIndex}:`, {
        error: error.message,
        usingDeployerAccount: this.fromAddress,
        hasPrivateKey: !!this.fromAddressPrivateKey
      });
      throw error;
    }
  }
}

function createWorkloadModule() {
  return new AssignRole();
}

module.exports.createWorkloadModule = createWorkloadModule;
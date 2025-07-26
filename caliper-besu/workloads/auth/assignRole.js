'use strict';

const SSIOperationBase = require('../utils/ssi-operation-base');
const SSIStateManager = require('../utils/ssi-state-manager');

/**
 * Workload module for assigning roles in the SSI system.
 * ENHANCED: Uses integrated bootstrap functionality from SSIOperationBase.
 */
class AssignRole extends SSIOperationBase {
  /**
   * Initializes the workload parameters.
   * Bootstrap is now handled automatically by SSIOperationBase.
   */
  constructor() {
    super();
  }

  /**
   * Create the SSI state manager for role operations.
   * @return {SSIStateManager} The state instance.
   */
  createSSIState() {
    return new SSIStateManager(this.workerIndex, 'role', this.ssiConfig);
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

  /**
   * Enhanced role assignment using integrated bootstrap functionality.
   */
  async submitTransaction() {
    try {
      console.log(`Worker ${this.workerIndex}: Starting role assignment...`);

      // Use bootstrap-aware role assignment from state manager
      const roleArgs = this.ssiState.getBootstrapAwareRoleAssignment();
      
      if (!roleArgs) {
        throw new Error('Could not generate role assignment arguments');
      }

      // Enhanced arguments with additional context
      const enhancedArgs = {
        ...roleArgs,
        assignedBy: this.fromAddress,
        worker: this.workerIndex,
        timestamp: Date.now()
      };

      console.log(`Role assignment args:`, {
        role: roleArgs.role,
        account: roleArgs.account,
        isPredefined: roleArgs.isPredefined || false,
        accountName: roleArgs.accountName || 'generated'
      });

      // Validate prerequisites before attempting assignment
      const validation = this.ssiState.validateEntityPrerequisites(SSIStateManager.ENTITY_TYPES.ROLE);
      if (!validation.canProceed) {
        console.warn(`⚠️  Prerequisites not met: ${validation.missingPrerequisites.join(', ')}`);
        console.warn(`💡 Recommendations: ${validation.recommendations.join(', ')}`);
        // Continue anyway - the integrated bootstrap should have fixed this
      }

      // Execute the role assignment
      const result = await this.executeSSIOperationWithRetry(
        SSIOperationBase.CONTRACTS.ROLE_CONTROL,
        SSIOperationBase.OPERATIONS.ASSIGN_ROLE,
        { 
          role: roleArgs.role, 
          account: roleArgs.account 
        } // Use only the contract-required args
      );

      // Update state manager with successful assignment
      this.ssiState.markBootstrapAccountInitialized(roleArgs.account, {
        role: roleArgs.role,
        assignedAt: Date.now(),
        assignedBy: this.fromAddress
      });

      console.log(`✅ Role assignment successful for Worker ${this.workerIndex}`);
      console.log(`   🎯 Assigned role ${roleArgs.role} to ${roleArgs.account}`);
      
      return result;

    } catch (error) {
      console.error(`❌ Role assignment failed for Worker ${this.workerIndex}:`, {
        error: error.message,
        usingAccount: this.fromAddress,
        hasPrivateKey: !!this.fromAddressPrivateKey
      });

      // Provide targeted troubleshooting
      this.provideTroubleshootingGuidance(error);
      
      throw error;
    }
  }

  /**
   * Execute SSI operation with retry logic for transient failures.
   */
  async executeSSIOperationWithRetry(contractName, operation, args, maxRetries = 2) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 1) {
          console.log(`🔄 Worker ${this.workerIndex}: Retry attempt ${attempt}/${maxRetries}`);
          await this.delay(1000 * attempt); // Progressive backoff
        }

        return await this.executeSSIOperation(contractName, operation, args);

      } catch (error) {
        lastError = error;
        
        if (attempt < maxRetries && this.isRetryableError(error)) {
          console.warn(`⚠️  Retryable error on attempt ${attempt}: ${error.message}`);
        } else {
          break;
        }
      }
    }

    throw lastError;
  }

  /**
   * Check if an error is retryable.
   */
  isRetryableError(error) {
    const retryablePatterns = [
      'network error',
      'timeout',
      'connection',
      'nonce too low'
    ];

    const errorMessage = error.message.toLowerCase();
    return retryablePatterns.some(pattern => errorMessage.includes(pattern));
  }

  /**
   * Provide targeted troubleshooting guidance for role assignment failures.
   */
  provideTroubleshootingGuidance(error) {
    console.log(`\n🔧 TROUBLESHOOTING GUIDANCE for Worker ${this.workerIndex}:`);
    console.log(`=====================================`);

    if (error.message.includes('Execution reverted')) {
      console.log(`❌ EXECUTION REVERTED - This should have been fixed by bootstrap!`);
      console.log(`🔍 Possible remaining issues:`);
      console.log(`   1. Bootstrap didn't complete successfully`);
      console.log(`   2. Contract constructor is fundamentally broken`);
      console.log(`   3. Role validation logic has additional restrictions`);
      console.log(`   4. Gas limit still insufficient (current: ${this.getGasLimitFromConfig('RoleControl', 'assignRole')})`);
      
      console.log(`\n📊 System State Check:`);
      const stats = this.ssiState.getEnhancedSystemStatistics();
      console.log(`   🏥 System Readiness: ${(stats.systemReadiness * 100).toFixed(1)}%`);
      console.log(`   👑 Bootstrap Initialized: ${stats.bootstrap.initialized}`);
      console.log(`   💚 System Health: ${stats.bootstrap.systemHealth}`);
      console.log(`   🔑 Deployer Role: ${stats.bootstrap.deployerRole} (should be 3)`);

    } else if (error.message.includes('network')) {
      console.log(`🌐 NETWORK ERROR - Check Besu connectivity`);
    } else if (error.message.includes('nonce')) {
      console.log(`🔢 NONCE ERROR - Check account nonce management`);
    }

    console.log(`\n⚙️  CURRENT CONFIGURATION:`);
    console.log(`   📄 Contract: ${SSIOperationBase.CONTRACTS.ROLE_CONTROL}`);
    console.log(`   🏠 From Address: ${this.fromAddress}`);
    console.log(`   🔑 Has Private Key: ${!!this.fromAddressPrivateKey}`);
    console.log(`   ⛽ Gas Limit: ${this.getGasLimitFromConfig('RoleControl', 'assignRole')}`);
    console.log(`=====================================\n`);
  }

  /**
   * Utility method for delays.
   */
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Create a new instance of the workload module.
 * @return {WorkloadModuleInterface}
 */
function createWorkloadModule() {
  return new AssignRole();
}

module.exports.createWorkloadModule = createWorkloadModule;
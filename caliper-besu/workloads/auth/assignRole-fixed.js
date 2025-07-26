'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');

/**
 * Fixed RoleControl assignRole workload
 * Addresses common execution revert issues
 */
class AssignRoleWorkload extends WorkloadModuleBase {
  constructor() {
    super();
    this.contractAddress = '0x42699A7612A82f1d9C36148af9C77354759b210b';
    this.deployerAddress = '0xfe3b557e8fb62b89f4916b721be55ceb828dbd73';
  }

  async initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext) {
    await super.initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext);
    
    this.operationType = roundArguments.operationType || 'assignRole';
    this.targetRole = roundArguments.targetRole || 1; // ISSUER by default
    
    // Get accounts and ensure we use the right one
    console.log('🔧 Workload initialized with:');
    console.log('   Contract:', this.contractAddress);
    console.log('   Deployer:', this.deployerAddress);
    console.log('   Operation:', this.operationType);
    console.log('   Target Role:', this.targetRole);
  }

  async submitTransaction() {
    try {
      // Get a target account (avoid assigning to deployer)
      const targetAccount = this.getTargetAccount();
      
      // Create the request with explicit account configuration
      const request = {
        contract: 'RoleControl',
        verb: 'assignRole',
        args: [this.targetRole, targetAccount],
        readOnly: false,
        // Explicitly specify the account to use
        fromAddress: this.deployerAddress,
        // Add gas configuration
        gas: {
          limit: 200000
        }
      };

      console.log(`🚀 Submitting role assignment:`);
      console.log(`   Role: ${this.targetRole} (${this.getRoleName(this.targetRole)})`);
      console.log(`   Target: ${targetAccount}`);
      console.log(`   From: ${this.deployerAddress}`);

      const result = await this.sutAdapter.sendRequests(request);
      
      console.log(`✅ Role assignment successful`);
      return result;

    } catch (error) {
      console.error(`❌ Role assignment failed: ${error.message}`);
      
      // Enhanced error reporting
      console.error(`   Contract: ${this.contractAddress}`);
      console.error(`   Operation: assignRole`);
      console.error(`   Args: role=${this.targetRole}, account=${this.getTargetAccount()}`);
      
      throw error;
    }
  }

  getTargetAccount() {
    // Use configured accounts, avoiding the deployer
    if (this.sutAdapter.accounts && this.sutAdapter.accounts.length > 0) {
      // Find an account that's not the deployer
      for (const account of this.sutAdapter.accounts) {
        if (account.address.toLowerCase() !== this.deployerAddress.toLowerCase()) {
          return account.address;
        }
      }
      // Fallback to first account if all are deployer
      return this.sutAdapter.accounts[0].address;
    }
    
    // Fallback to a known account from network config
    return '0xfe3b557e8fb62b89f4916b721be55ceb828dbd73';
  }

  getRoleName(role) {
    const roleNames = ['NONE', 'ISSUER', 'HOLDER', 'TRUSTEE'];
    return roleNames[role] || 'UNKNOWN';
  }
}

module.exports.createWorkloadModule = () => new AssignRoleWorkload();

'use strict';

const crypto = require('crypto');
const { ethers } = require('ethers');

// SSI Entity Types
const SSI_ENTITY_TYPES = {
  ROLE: 'role',
  DID: 'did', 
  CREDENTIAL: 'credential'
};

// SSI Role Types (based on RoleControl contract)
const SSI_ROLES = {
  NONE: 0,
  ISSUER: 1, 
  HOLDER: 2,
  TRUSTEE: 3
};

/**
 * Simplified SSI State Manager
 * Generates transaction arguments for SSI operations without complex state tracking
 */
class SimplifiedSSIStateManager {
  /**
   * Initializes the simplified SSI state manager
   * @param {number} workerIndex - Worker index
   * @param {string} primaryEntityType - Primary entity type for this workload
   * @param {Object} config - SSI configuration
   */
  constructor(workerIndex, primaryEntityType, config = {}) {
    this.workerIndex = workerIndex;
    this.primaryEntityType = primaryEntityType;
    this.config = config;
    
    // Generate worker-specific prefix for unique identifiers
    this.workerPrefix = `w${workerIndex}`;
    
    // Basic entity counters
    this.counters = {
      [SSI_ENTITY_TYPES.ROLE]: 0,
      [SSI_ENTITY_TYPES.DID]: 0,
      [SSI_ENTITY_TYPES.CREDENTIAL]: 0
    };
    
    // Minimal state tracking
    this.entities = {
      roles: new Map(),
      dids: new Map(),
      credentials: new Map()
    };
    
    // Predefined accounts for stable testing
    this.predefinedAccounts = this.initializePredefinedAccounts();
    
    console.log(`🗃️ Simplified SSI State Manager initialized for worker ${workerIndex}`);
  }
  
  /**
   * Initialize predefined accounts from network configuration
   * @returns {Map} Map of predefined accounts
   * @private
   */
  initializePredefinedAccounts() {
    const accounts = new Map();
    
    // Add predefined accounts from genesis/network config
    const predefinedAccounts = [
      { address: '0x627306090abaB3A6e1400e9345bC60c78a8BEf57', role: SSI_ROLES.ISSUER, name: 'Primary Issuer' },
      { address: '0xf17f52151EbEF6C7334FAD080c5704D77216b732', role: SSI_ROLES.HOLDER, name: 'Primary Holder' },
      { address: '0xc9c913c8c3c1cd416d80a0abf475db2062f161f6', role: SSI_ROLES.TRUSTEE, name: 'Secondary Trustee' },
      { address: '0x06d06c366b213f716b51bca6dc1874afc05467d0', role: SSI_ROLES.HOLDER, name: 'Secondary Holder' },
      { address: '0x2d501ff683a6dcb43b4b12cf334ea7a9692a9f1c', role: SSI_ROLES.ISSUER, name: 'Secondary Issuer' }
    ];
    
    // Add accounts to map
    predefinedAccounts.forEach(account => {
      accounts.set(account.address, {
        role: account.role,
        name: account.name,
        used: false
      });
    });
    
    return accounts;
  }
  
  /**
   * Generate a random Ethereum address
   * @returns {string} Ethereum address
   * @private
   */
  _generateRandomAddress() {
    const randomBytes = crypto.randomBytes(20);
    return '0x' + randomBytes.toString('hex');
  }
  
  /**
   * Generate a random hash (bytes32)
   * @param {string} prefix - Optional prefix
   * @returns {string} Hash
   * @private
   */
  _generateRandomHash(prefix = '') {
    const randomString = `${prefix}-${Date.now()}-${Math.random()}`;
    return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(randomString));
  }
  
  /**
   * Generate a random IPFS CID
   * @returns {string} CID
   * @private
   */
  _generateRandomCid() {
    // Simple mock CID generation
    const randomSuffix = crypto.randomBytes(23).toString('base64')
      .replace(/[+/]/g, '')
      .substring(0, 44);
    return `Qm${randomSuffix}`;
  }
  
  /**
   * Get a random role type
   * @returns {number} Role type
   * @private
   */
  _getRandomRoleType() {
    const roles = [SSI_ROLES.ISSUER, SSI_ROLES.HOLDER, SSI_ROLES.TRUSTEE];
    return roles[Math.floor(Math.random() * roles.length)];
  }
  
  /**
   * Get a predefined account with specific role
   * @param {number} role - Role type
   * @returns {Object|null} Account or null if not found
   * @private
   */
  _getPredefinedAccountWithRole(role) {
    // Find unused account with matching role
    for (const [address, account] of this.predefinedAccounts.entries()) {
      if (account.role === role && !account.used) {
        // Mark as used
        account.used = true;
        return { address, ...account };
      }
    }
    
    // No matching unused account found
    return null;
  }

  // === ROLE MANAGEMENT ===
  
  /**
   * Get arguments for role assignment
   * @param {number} role - Role type (optional)
   * @returns {Object} Role assignment arguments
   */
  getRoleAssignmentArguments(role = null) {
    const targetRole = role !== null ? role : this._getRandomRoleType();
    
    // Try to use predefined account first
    const predefinedAccount = this._getPredefinedAccountWithRole(targetRole);
    
    if (predefinedAccount) {
      console.log(`🎯 Using predefined account for role ${targetRole}: ${predefinedAccount.name}`);
      
      // Store in roles map
      this.entities.roles.set(predefinedAccount.address, {
        role: targetRole
      });
      
      return {
        role: targetRole,
        account: predefinedAccount.address
      };
    }
    
    // Generate random address if no predefined account available
    const address = this._generateRandomAddress();
    
    // Store in roles map
    this.entities.roles.set(address, {
      role: targetRole
    });
    
    // Increment counter
    this.counters[SSI_ENTITY_TYPES.ROLE]++;
    
    return {
      role: targetRole,
      account: address
    };
  }
  
  // === DID MANAGEMENT ===
  
  /**
   * Get arguments for DID creation
   * @returns {Object} DID creation arguments
   */
  getDIDCreationArguments() {
    const identity = this._generateRandomAddress();
    const docHash = this._generateRandomHash('did-doc');
    const docCid = this._generateRandomCid();
    
    // Store in DIDs map
    this.entities.dids.set(identity, {
      docHash,
      docCid,
      createdAt: Date.now()
    });
    
    // Increment counter
    this.counters[SSI_ENTITY_TYPES.DID]++;
    
    return {
      identity,
      docHash,
      docCid
    };
  }
  
  // === CREDENTIAL MANAGEMENT ===
  
  /**
   * Get arguments for credential issuance
   * @returns {Object} Credential issuance arguments
   */
  getCredentialIssuanceArguments() {
    const identity = this._generateRandomAddress(); // Holder
    const credentialId = this._generateRandomHash('credential');
    const credentialCid = this._generateRandomCid();
    
    // Store in credentials map
    this.entities.credentials.set(credentialId, {
      holder: identity,
      credentialCid,
      issuedAt: Date.now()
    });
    
    // Increment counter
    this.counters[SSI_ENTITY_TYPES.CREDENTIAL]++;
    
    return {
      identity,
      credentialId,
      credentialCid
    };
  }
  
  /**
   * Get entity state statistics
   * @returns {Object} State statistics
   */
  getStateStatistics() {
    return {
      worker: this.workerIndex,
      entityCounts: {
        roles: this.entities.roles.size,
        dids: this.entities.dids.size,
        credentials: this.entities.credentials.size
      },
      counters: { ...this.counters }
    };
  }
}

// Export constants
SimplifiedSSIStateManager.ENTITY_TYPES = SSI_ENTITY_TYPES;
SimplifiedSSIStateManager.ROLES = SSI_ROLES;

module.exports = SimplifiedSSIStateManager;
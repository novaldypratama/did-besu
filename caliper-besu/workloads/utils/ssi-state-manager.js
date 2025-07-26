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

// Credential Status Types (based on CredentialRegistry contract)
const CREDENTIAL_STATUS = {
  NONE: 0,
  ACTIVE: 1,
  REVOKED: 2,
  SUSPENDED: 3
};

// DID Status Types (based on DidRegistry contract)
const DID_STATUS = {
  NONE: 0,
  ACTIVE: 1,
  DEACTIVATED: 2
};

// Character dictionary for generating unique identifiers
const Dictionary = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Complete SSI State Manager with Integrated Bootstrap System
 * Manages complex SSI entity relationships with automatic prerequisite validation
 */
class SSIStateManager {
  /**
   * Initializes the SSI state manager with integrated bootstrap functionality.
   * NOW INCLUDES: Bootstrap state tracking and system health monitoring.
   * @param {number} workerIndex - Index of the worker
   * @param {string} primaryEntityType - Primary entity type for this workload
   * @param {Object} config - SSI configuration object
   */
  constructor(workerIndex, primaryEntityType, config = {}) {
    this.workerIndex = workerIndex;
    this.primaryEntityType = primaryEntityType;
    this.config = config;

    // Generate worker-specific prefix to avoid conflicts
    this.workerPrefix = this._generateWorkerPrefix(workerIndex);
    
    // State counters for different entity types
    this.counters = {
      [SSI_ENTITY_TYPES.ROLE]: 0,
      [SSI_ENTITY_TYPES.DID]: 0,
      [SSI_ENTITY_TYPES.CREDENTIAL]: 0
    };

    // State storage for entities and relationships
    this.entities = {
      roles: new Map(),        // address -> role info
      dids: new Map(),         // address -> DID info  
      credentials: new Map()   // credentialId -> credential info
    };

    // Cross-entity relationships
    this.relationships = {
      didToRole: new Map(),           // DID address -> role
      credentialToIssuer: new Map(),  // credentialId -> issuer address
      credentialToHolder: new Map(),  // credentialId -> holder address
      issuerCredentials: new Map(),   // issuer address -> [credentialIds]
      holderCredentials: new Map()    // holder address -> [credentialIds]
    };

    // NEW: Bootstrap state tracking (integrated from bootstrap-ssi-system.js)
    this.bootstrapState = {
      initialized: false,
      systemHealth: 'unknown',
      deployerRole: 0,
      roleDistribution: new Map(),
      knownAccounts: new Map(),
      lastHealthCheck: null,
      bootstrapErrors: [],
      initializationTime: Date.now(),
      validationResults: new Map()
    };

    // NEW: System configuration tracking
    this.systemConfig = {
      totalWorkers: 1,
      currentWorker: workerIndex,
      contractAddresses: config.contractAddresses || {},
      gasConfig: config.gasConfig || {},
      besuEndpoint: config.besuEndpoint,
      chainId: config.chainId
    };

    // NEW: Initialize with bootstrap data
    this.initializeBootstrapData();

    console.log(`🗃️  SSI State Manager initialized for worker ${workerIndex} (${primaryEntityType})`);
    console.log(`🏗️  Bootstrap data initialized with system health tracking`);
  }

  /**
   * Generate worker-specific prefix to avoid collisions.
   * @param {number} number Character to select.
   * @returns {string} Generated string based on the input number.
   * @private
   */
  _generateWorkerPrefix(number) {
    let result = 'w';
    let num = number + 1; // Start from 1 instead of 0
    
    while (num > 0) {
      result += Dictionary.charAt(num % Dictionary.length);
      num = Math.floor(num / Dictionary.length);
    }
    
    return result;
  }

  /**
   * Generate a unique identifier for an entity type.
   * @param {string} entityType - The entity type
   * @returns {string} Generated identifier
   * @private
   */
  _generateEntityId(entityType) {
    this.counters[entityType]++;
    const count = this.counters[entityType];
    return `${this.workerPrefix}-${entityType}-${count}`;
  }

  /**
   * Generate a random Ethereum address for testing.
   * @returns {string} Generated Ethereum address
   * @private
   */
  _generateRandomAddress() {
    const randomBytes = crypto.randomBytes(20);
    return '0x' + randomBytes.toString('hex');
  }

  /**
   * Generate a random bytes32 hash.
   * @param {string} prefix - Optional prefix for hash generation
   * @returns {string} Generated hash
   * @private
   */
  _generateRandomHash(prefix = '') {
    const randomString = `${prefix}-${Date.now()}-${Math.random()}`;
    return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(randomString));
  }

  /**
   * Generate a random IPFS CID for testing.
   * @returns {string} Generated CID
   * @private
   */
  _generateRandomCid() {
    const randomSuffix = crypto.randomBytes(23).toString('base64')
      .replace(/[+/]/g, '')
      .substring(0, 44);
    return `Qm${randomSuffix}`;
  }

  /**
   * Get a random entity from a collection.
   * @param {Map} collection - The collection to select from
   * @returns {*} Random entity or null if collection is empty
   * @private
   */
  _getRandomEntity(collection) {
    if (collection.size === 0) return null;
    const entries = Array.from(collection.entries());
    const randomIndex = Math.floor(Math.random() * entries.length);
    return entries[randomIndex];
  }

  // ============================================================================
  // BOOTSTRAP & SYSTEM STATE MANAGEMENT (Integrated from bootstrap-ssi-system.js)
  // ============================================================================

  /**
   * Initialize bootstrap data and predefined accounts.
   * @protected
   */
  initializeBootstrapData() {
    // Predefined accounts for SSI ecosystem (from network configuration)
    const predefinedAccounts = [
      { address: '0x06d06c366b213f716b51bca6dc1874afc05467d0', role: SSI_ROLES.TRUSTEE, name: 'Deployer' },
      { address: '0xfe3b557e8fb62b89f4916b721be55ceb828dbd73', role: SSI_ROLES.ISSUER, name: 'Primary Issuer' },
      { address: '0x627306090abaB3A6e1400e9345bC60c78a8BEf57', role: SSI_ROLES.HOLDER, name: 'Primary Holder' },
      { address: '0xf17f52151EbEF6C7334FAD080c5704D77216b732', role: SSI_ROLES.TRUSTEE, name: 'Secondary Trustee' },
      { address: '0xc9c913c8c3c1cd416d80a0abf475db2062f161f6', role: SSI_ROLES.HOLDER, name: 'Secondary Holder' },
      { address: '0x2d501ff683a6dcb43b4b12cf334ea7a9692a9f1c', role: SSI_ROLES.ISSUER, name: 'Secondary Issuer' },
      { address: '0x8dd478dee59d3b7c16a2e34cb5d321ed23d2677d', role: SSI_ROLES.HOLDER, name: 'Tertiary Holder' },
      { address: '0x9b790656b9ec0db1936ed84b3bea605873558198', role: SSI_ROLES.ISSUER, name: 'Tertiary Issuer' },
      { address: '0xe43f47c497e0eFC3fe96a85B2041aFF2F0d317A5', role: SSI_ROLES.HOLDER, name: 'MetaMask Account' }
    ];

    // Initialize known accounts in bootstrap state
    predefinedAccounts.forEach(account => {
      this.bootstrapState.knownAccounts.set(account.address, {
        role: account.role,
        name: account.name,
        initialized: false,
        lastChecked: null,
        source: 'predefined',
        priority: account.role === SSI_ROLES.TRUSTEE ? 'high' : 'normal'
      });
    });

    // Initialize role distribution tracking
    Object.values(SSI_ROLES).forEach(role => {
      if (role !== SSI_ROLES.NONE) {
        this.bootstrapState.roleDistribution.set(role, 0);
      }
    });

    console.log(`   🏗️  Bootstrap data initialized with ${predefinedAccounts.length} predefined accounts`);
  }

  /**
   * Update bootstrap state with system health information.
   * @param {Object} healthData - System health data
   */
  updateBootstrapState(healthData) {
    this.bootstrapState = {
      ...this.bootstrapState,
      ...healthData,
      lastHealthCheck: Date.now()
    };

    // Update role distribution if provided
    if (healthData.roleDistribution) {
      this.bootstrapState.roleDistribution = new Map(healthData.roleDistribution);
    }

    console.log(`📊 Bootstrap state updated: ${this.bootstrapState.systemHealth}`);
  }

  /**
   * Get a predefined account with specific role for bootstrap operations.
   * @param {number} role - The role type
   * @returns {Object|null} Account info or null if not found
   */
  getBootstrapAccountWithRole(role) {
    const availableAccounts = Array.from(this.bootstrapState.knownAccounts.entries())
      .filter(([_, accountInfo]) => accountInfo.role === role)
      .sort((a, b) => {
        // Prioritize uninitialized accounts, then by priority
        if (a[1].initialized !== b[1].initialized) {
          return a[1].initialized ? 1 : -1;
        }
        return a[1].priority === 'high' ? -1 : 1;
      });

    if (availableAccounts.length === 0) return null;

    const [address, accountInfo] = availableAccounts[0];
    return {
      address,
      ...accountInfo
    };
  }

  /**
   * Mark a bootstrap account as initialized.
   * @param {string} address - Account address
   * @param {Object} roleInfo - Role information
   */
  markBootstrapAccountInitialized(address, roleInfo) {
    if (this.bootstrapState.knownAccounts.has(address)) {
      const accountInfo = this.bootstrapState.knownAccounts.get(address);
      accountInfo.initialized = true;
      accountInfo.lastChecked = Date.now();
      accountInfo.actualRole = roleInfo.role;
    }

    // Also update main entities
    this.entities.roles.set(address, {
      address,
      role: roleInfo.role,
      assignedAt: roleInfo.assignedAt || Date.now(),
      assignedBy: roleInfo.assignedBy || 'bootstrap',
      source: 'bootstrap',
      verified: true
    });

    // Update role distribution
    const currentCount = this.bootstrapState.roleDistribution.get(roleInfo.role) || 0;
    this.bootstrapState.roleDistribution.set(roleInfo.role, currentCount + 1);

    console.log(`   ✅ Account ${address} marked as initialized with role ${roleInfo.role}`);
  }

  /**
   * Get bootstrap-aware role assignment arguments.
   * Prioritizes using predefined accounts for stable testing.
   * @param {number} role - Role type (optional, random if not provided)
   * @returns {Object} Role assignment arguments
   */
  getBootstrapAwareRoleAssignment(role = null) {
    const targetRole = role !== null ? role : this._getRandomRoleType();
    
    // Try to use a predefined account first
    const predefinedAccount = this.getBootstrapAccountWithRole(targetRole);
    if (predefinedAccount && !predefinedAccount.initialized) {
      console.log(`   🎯 Using predefined account for role ${targetRole}: ${predefinedAccount.name}`);
      
      return {
        role: targetRole,
        account: predefinedAccount.address,
        isPredefined: true,
        accountName: predefinedAccount.name,
        priority: predefinedAccount.priority
      };
    }

    // Fallback to random generation if no predefined accounts available
    console.log(`   🎲 Generating random account for role ${targetRole} (no predefined accounts available)`);
    return this.getRoleAssignmentArguments(targetRole);
  }

  /**
   * Get smart entity arguments that consider system prerequisites.
   * This replaces simple random generation with bootstrap-aware selection.
   * @param {string} entityType - Entity type to generate
   * @param {Object} options - Generation options
   * @returns {Object|null} Smart entity arguments or null if prerequisites not met
   */
  getSmartEntityArguments(entityType, options = {}) {
    switch (entityType) {
      case SSI_ENTITY_TYPES.ROLE:
        return this.getBootstrapAwareRoleAssignment(options.role);

      case SSI_ENTITY_TYPES.DID:
        // Check if we have enough roles for DID creation
        if (this.entities.roles.size === 0) {
          console.warn(`⚠️  Cannot create DID: No roles assigned yet`);
          return null;
        }
        return this.getDIDCreationArguments();

      case SSI_ENTITY_TYPES.CREDENTIAL:
        // Check if we have issuers and holders for credential issuance
        const issuer = this._getAddressWithRole(SSI_ROLES.ISSUER);
        const holder = this._getAddressWithRole(SSI_ROLES.HOLDER);
        
        if (!issuer || !holder) {
          console.warn(`⚠️  Cannot issue credential: Missing issuer (${!!issuer}) or holder (${!!holder})`);
          return null;
        }
        return this.getCredentialIssuanceArguments();

      default:
        console.warn(`⚠️  Unknown entity type: ${entityType}`);
        return null;
    }
  }

  /**
   * Validate system prerequisites for entity operations.
   * @param {string} entityType - Entity type to validate
   * @returns {Object} Validation results
   */
  validateEntityPrerequisites(entityType) {
    const results = {
      canProceed: false,
      missingPrerequisites: [],
      recommendations: [],
      systemHealth: this.bootstrapState.systemHealth,
      availableResources: {}
    };

    switch (entityType) {
      case SSI_ENTITY_TYPES.ROLE:
        // Role assignment requires TRUSTEE permissions
        const hasTrusteeRole = this.bootstrapState.deployerRole === SSI_ROLES.TRUSTEE;
        const trusteeCount = this.bootstrapState.roleDistribution.get(SSI_ROLES.TRUSTEE) || 0;
        
        results.canProceed = hasTrusteeRole;
        results.availableResources.trusteeAccounts = trusteeCount;
        
        if (!hasTrusteeRole) {
          results.missingPrerequisites.push('TRUSTEE role for deployer');
          results.recommendations.push('Run bootstrap initialization or check contract constructor');
        }
        break;

      case SSI_ENTITY_TYPES.DID:
        // DID creation requires assigned roles
        const hasRoles = this.entities.roles.size > 0;
        const issuerCount = this.bootstrapState.roleDistribution.get(SSI_ROLES.ISSUER) || 0;
        const holderCount = this.bootstrapState.roleDistribution.get(SSI_ROLES.HOLDER) || 0;
        
        results.canProceed = hasRoles;
        results.availableResources = { issuerCount, holderCount, totalRoles: this.entities.roles.size };
        
        if (!hasRoles) {
          results.missingPrerequisites.push('Assigned roles');
          results.recommendations.push('Assign roles first using role assignment workload');
        }
        break;

      case SSI_ENTITY_TYPES.CREDENTIAL:
        // Credential issuance requires issuers and holders
        const hasIssuer = this._getAddressWithRole(SSI_ROLES.ISSUER) !== null;
        const hasHolder = this._getAddressWithRole(SSI_ROLES.HOLDER) !== null;
        const issuerAccountCount = this.bootstrapState.roleDistribution.get(SSI_ROLES.ISSUER) || 0;
        const holderAccountCount = this.bootstrapState.roleDistribution.get(SSI_ROLES.HOLDER) || 0;
        
        results.canProceed = hasIssuer && hasHolder;
        results.availableResources = { 
          issuerAccountCount, 
          holderAccountCount,
          totalCredentials: this.entities.credentials.size
        };
        
        if (!hasIssuer) {
          results.missingPrerequisites.push('ISSUER role assignment');
          results.recommendations.push('Assign ISSUER role to accounts');
        }
        if (!hasHolder) {
          results.missingPrerequisites.push('HOLDER role assignment');
          results.recommendations.push('Assign HOLDER role to accounts');
        }
        break;

      default:
        results.missingPrerequisites.push(`Unknown entity type: ${entityType}`);
        results.recommendations.push('Use valid entity type (role, did, credential)');
    }

    // Store validation result for tracking
    this.bootstrapState.validationResults.set(entityType, {
      timestamp: Date.now(),
      results: { ...results }
    });

    return results;
  }

  /**
   * Get enhanced system statistics including bootstrap state.
   * @returns {Object} Enhanced system statistics
   */
  getEnhancedSystemStatistics() {
    const basicStats = this.getStateStatistics();
    
    return {
      ...basicStats,
      bootstrap: {
        initialized: this.bootstrapState.initialized,
        systemHealth: this.bootstrapState.systemHealth,
        deployerRole: this.bootstrapState.deployerRole,
        knownAccountsCount: this.bootstrapState.knownAccounts.size,
        initializedAccounts: Array.from(this.bootstrapState.knownAccounts.values())
          .filter(account => account.initialized).length,
        lastHealthCheck: this.bootstrapState.lastHealthCheck,
        hasErrors: this.bootstrapState.bootstrapErrors.length > 0,
        initializationDuration: Date.now() - this.bootstrapState.initializationTime
      },
      roleDistribution: Object.fromEntries(this.bootstrapState.roleDistribution),
      systemReadiness: this.calculateSystemReadiness(),
      validationHistory: Object.fromEntries(this.bootstrapState.validationResults),
      systemConfig: this.systemConfig
    };
  }

  /**
   * Calculate overall system readiness score.
   * @returns {number} Readiness score (0-1)
   */
  calculateSystemReadiness() {
    const checks = [
      this.bootstrapState.initialized,
      this.bootstrapState.systemHealth === 'healthy',
      this.bootstrapState.deployerRole === SSI_ROLES.TRUSTEE,
      this.entities.roles.size > 0,
      this.bootstrapState.bootstrapErrors.length === 0,
      this.bootstrapState.roleDistribution.get(SSI_ROLES.TRUSTEE) > 0,
      this.bootstrapState.knownAccounts.size > 0
    ];

    const passedChecks = checks.filter(check => check === true).length;
    return passedChecks / checks.length;
  }

  // ============================================================================
  // ORIGINAL SSI STATE MANAGEMENT (Enhanced with Bootstrap Awareness)
  // ============================================================================

  /**
   * Get a random role type.
   * @returns {number} Random role type (ISSUER, HOLDER, TRUSTEE)
   * @private
   */
  _getRandomRoleType() {
    const roles = [SSI_ROLES.ISSUER, SSI_ROLES.HOLDER, SSI_ROLES.TRUSTEE];
    return roles[Math.floor(Math.random() * roles.length)];
  }

  /**
   * Get an address with a specific role.
   * @param {number} role - The role type
   * @returns {string|null} Address with the role or null if not found
   * @private
   */
  _getAddressWithRole(role) {
    const roleEntries = Array.from(this.entities.roles.entries())
      .filter(([_, roleInfo]) => roleInfo.role === role);

    if (roleEntries.length === 0) return null;

    const randomIndex = Math.floor(Math.random() * roleEntries.length);
    return roleEntries[randomIndex][0];
  }

  // === ROLE MANAGEMENT ===

  /**
   * Get arguments for assigning a role.
   * @param {number} role - Role type (optional, random if not provided)
   * @returns {Object} Role assignment arguments
   */
  getRoleAssignmentArguments(role = null) {
    const targetRole = role !== null ? role : this._getRandomRoleType();
    const targetAddress = this._generateRandomAddress();
    
    const roleInfo = {
      address: targetAddress,
      role: targetRole,
      assignedAt: Date.now(),
      assignedBy: this.workerIndex,
      source: 'generated'
    };

    // Store role assignment
    this.entities.roles.set(targetAddress, roleInfo);
    
    return {
      role: targetRole,
      account: targetAddress
    };
  }

  /**
   * Get arguments for revoking a role.
   * @returns {Object} Role revocation arguments or null if no roles exist
   */
  getRoleRevocationArguments() {
    const roleEntry = this._getRandomEntity(this.entities.roles);
    if (!roleEntry) return null;

    const [address, roleInfo] = roleEntry;
    
    return {
      role: roleInfo.role,
      account: address
    };
  }

  // === DID MANAGEMENT ===

  /**
   * Get arguments for creating a DID.
   * @returns {Object} DID creation arguments
   */
  getDIDCreationArguments() {
    const identity = this._generateRandomAddress();
    const docHash = this._generateRandomHash('did-doc');
    const docCid = this._generateRandomCid();

    const didInfo = {
      identity,
      docHash,
      docCid,
      status: DID_STATUS.ACTIVE,
      createdAt: Date.now(),
      createdBy: this.workerIndex,
      source: 'generated'
    };

    // Store DID creation
    this.entities.dids.set(identity, didInfo);

    // Link to role if available
    const roleEntry = this._getRandomEntity(this.entities.roles);
    if (roleEntry) {
      const [roleAddress, roleInfo] = roleEntry;
      this.relationships.didToRole.set(identity, roleInfo.role);
    }

    return {
      identity,
      docHash,
      docCid
    };
  }

  /**
   * Get arguments for updating a DID.
   * @returns {Object} DID update arguments or null if no DIDs exist
   */
  getDIDUpdateArguments() {
    const didEntry = this._getRandomEntity(this.entities.dids);
    if (!didEntry) return null;

    const [identity, didInfo] = didEntry;
    
    // Only update active DIDs
    if (didInfo.status !== DID_STATUS.ACTIVE) return null;

    const newDocHash = this._generateRandomHash('did-update');
    const newDocCid = this._generateRandomCid();

    // Update stored DID info
    didInfo.docHash = newDocHash;
    didInfo.docCid = newDocCid;
    didInfo.updatedAt = Date.now();

    return {
      identity,
      docHash: newDocHash,
      docCid: newDocCid
    };
  }

  /**
   * Get arguments for deactivating a DID.
   * @returns {Object} DID deactivation arguments or null if no active DIDs exist
   */
  getDIDDeactivationArguments() {
    const activeDids = Array.from(this.entities.dids.entries())
      .filter(([_, didInfo]) => didInfo.status === DID_STATUS.ACTIVE);
    
    if (activeDids.length === 0) return null;

    const randomIndex = Math.floor(Math.random() * activeDids.length);
    const [identity, didInfo] = activeDids[randomIndex];

    // Update status
    didInfo.status = DID_STATUS.DEACTIVATED;
    didInfo.deactivatedAt = Date.now();

    return {
      identity
    };
  }

  /**
   * Get arguments for resolving a DID.
   * @returns {Object} DID resolution arguments or null if no DIDs exist
   */
  getDIDResolutionArguments() {
    const didEntry = this._getRandomEntity(this.entities.dids);
    if (!didEntry) return null;

    const [identity] = didEntry;
    
    return {
      identity
    };
  }

  // === CREDENTIAL MANAGEMENT ===

  /**
   * Get arguments for issuing a credential.
   * @returns {Object} Credential issuance arguments or null if prerequisites not met
   */
  getCredentialIssuanceArguments() {
    // Need at least one issuer and one holder
    const issuer = this._getAddressWithRole(SSI_ROLES.ISSUER);
    const holder = this._getAddressWithRole(SSI_ROLES.HOLDER);

    if (!issuer || !holder) return null;

    const credentialId = this._generateRandomHash('credential');
    const credentialCid = this._generateRandomCid();

    const credentialInfo = {
      credentialId,
      credentialCid,
      issuer,
      holder,
      status: CREDENTIAL_STATUS.ACTIVE,
      issuedAt: Date.now(),
      issuedBy: this.workerIndex,
      source: 'generated'
    };

    // Store credential
    this.entities.credentials.set(credentialId, credentialInfo);

    // Update relationships
    this.relationships.credentialToIssuer.set(credentialId, issuer);
    this.relationships.credentialToHolder.set(credentialId, holder);

    // Track issuer's credentials
    if (!this.relationships.issuerCredentials.has(issuer)) {
      this.relationships.issuerCredentials.set(issuer, []);
    }
    this.relationships.issuerCredentials.get(issuer).push(credentialId);

    // Track holder's credentials
    if (!this.relationships.holderCredentials.has(holder)) {
      this.relationships.holderCredentials.set(holder, []);
    }
    this.relationships.holderCredentials.get(holder).push(credentialId);

    return {
      identity: holder,
      credentialId,
      credentialCid
    };
  }

  /**
   * Get arguments for updating credential status.
   * @returns {Object} Credential status update arguments or null if no credentials exist
   */
  getCredentialStatusUpdateArguments() {
    const activeCredentials = Array.from(this.entities.credentials.entries())
      .filter(([_, credInfo]) => credInfo.status === CREDENTIAL_STATUS.ACTIVE);

    if (activeCredentials.length === 0) return null;

    const randomIndex = Math.floor(Math.random() * activeCredentials.length);
    const [credentialId, credInfo] = activeCredentials[randomIndex];

    // Random new status (REVOKED or SUSPENDED)
    const newStatus = Math.random() < 0.5 ? CREDENTIAL_STATUS.REVOKED : CREDENTIAL_STATUS.SUSPENDED;
    const previousStatus = credInfo.status;

    // Update stored credential info
    credInfo.status = newStatus;
    credInfo.statusUpdatedAt = Date.now();

    return {
      credentialId,
      previousStatus,
      newStatus
    };
  }

  /**
   * Get arguments for resolving a credential.
   * @returns {Object} Credential resolution arguments or null if no credentials exist
   */
  getCredentialResolutionArguments() {
    const credentialEntry = this._getRandomEntity(this.entities.credentials);
    if (!credentialEntry) return null;

    const [credentialId] = credentialEntry;

    return {
      credentialId
    };
  }

  // === UTILITY METHODS ===

  /**
   * Get the current state statistics.
   * @returns {Object} State statistics
   */
  getStateStatistics() {
    return {
      worker: this.workerIndex,
      entities: {
        roles: this.entities.roles.size,
        dids: this.entities.dids.size,
        credentials: this.entities.credentials.size
      },
      relationships: {
        didToRole: this.relationships.didToRole.size,
        issuerCredentials: this.relationships.issuerCredentials.size,
        holderCredentials: this.relationships.holderCredentials.size
      },
      counters: { ...this.counters }
    };
  }

  /**
   * Validate state consistency.
   * @returns {Object} Validation results
   */
  validateStateConsistency() {
    const issues = [];

    // Check for orphaned relationships
    this.relationships.credentialToIssuer.forEach((issuer, credentialId) => {
      if (!this.entities.credentials.has(credentialId)) {
        issues.push(`Orphaned issuer relationship for credential ${credentialId}`);
      }
    });

    this.relationships.credentialToHolder.forEach((holder, credentialId) => {
      if (!this.entities.credentials.has(credentialId)) {
        issues.push(`Orphaned holder relationship for credential ${credentialId}`);
      }
    });

    // Check bootstrap consistency
    const bootstrapIssues = [];
    this.bootstrapState.knownAccounts.forEach((accountInfo, address) => {
      if (accountInfo.initialized && !this.entities.roles.has(address)) {
        bootstrapIssues.push(`Bootstrap account ${address} marked as initialized but not in role entities`);
      }
    });

    return {
      isValid: issues.length === 0 && bootstrapIssues.length === 0,
      issues: [...issues, ...bootstrapIssues],
      bootstrapConsistency: bootstrapIssues.length === 0
    };
  }

  /**
   * Reset all state (useful for testing).
   */
  resetState() {
    this.counters = {
      [SSI_ENTITY_TYPES.ROLE]: 0,
      [SSI_ENTITY_TYPES.DID]: 0,
      [SSI_ENTITY_TYPES.CREDENTIAL]: 0
    };

    this.entities.roles.clear();
    this.entities.dids.clear();
    this.entities.credentials.clear();

    Object.values(this.relationships).forEach(map => map.clear());

    // Reset bootstrap state but keep known accounts
    this.bootstrapState.initialized = false;
    this.bootstrapState.systemHealth = 'unknown';
    this.bootstrapState.deployerRole = 0;
    this.bootstrapState.roleDistribution.clear();
    this.bootstrapState.bootstrapErrors = [];
    this.bootstrapState.validationResults.clear();

    // Re-initialize bootstrap data
    this.initializeBootstrapData();

    console.log(`🧹 SSI State reset for worker ${this.workerIndex}`);
  }

  /**
   * Get diagnostic information for troubleshooting.
   * @returns {Object} Comprehensive diagnostic data
   */
  getDiagnosticInfo() {
    return {
      workerInfo: {
        index: this.workerIndex,
        prefix: this.workerPrefix,
        primaryEntityType: this.primaryEntityType
      },
      systemHealth: {
        readinessScore: this.calculateSystemReadiness(),
        healthStatus: this.bootstrapState.systemHealth,
        lastCheck: this.bootstrapState.lastHealthCheck,
        errors: this.bootstrapState.bootstrapErrors
      },
      entityCounts: this.getStateStatistics(),
      bootstrapAccounts: Array.from(this.bootstrapState.knownAccounts.entries()).map(
        ([address, info]) => ({
          address,
          role: info.role,
          name: info.name,
          initialized: info.initialized,
          priority: info.priority
        })
      ),
      consistency: this.validateStateConsistency(),
      configuration: this.systemConfig
    };
  }
}

// Export constants for use in workload modules
SSIStateManager.ENTITY_TYPES = SSI_ENTITY_TYPES;
SSIStateManager.ROLES = SSI_ROLES;
SSIStateManager.CREDENTIAL_STATUS = CREDENTIAL_STATUS;
SSIStateManager.DID_STATUS = DID_STATUS;

module.exports = SSIStateManager;

/* ============================================================================
 * COMPLETE INTEGRATION BENEFITS & ADVANCED FEATURES
 * ============================================================================
 * 
 * This complete SSI State Manager integration provides:
 *
 * 1. **Intelligent Bootstrap Integration**
 *    - Automatic predefined account management from network configuration
 *    - Smart prerequisite validation before entity creation
 *    - System health monitoring and readiness scoring
 *    - Bootstrap state synchronization with SSIOperationBase
 *
 * 2. **Advanced Entity Relationship Management**
 *    - Cross-contract dependency tracking (roles → DIDs → credentials)
 *    - Prerequisite validation with detailed recommendations
 *    - Smart entity generation prioritizing predefined accounts
 *    - Comprehensive validation with consistency checking
 *
 * 3. **Production-Ready Monitoring**
 *    - Real-time system health scoring and validation
 *    - Detailed diagnostic information for troubleshooting
 *    - Validation history tracking for performance analysis
 *    - Bootstrap account priority management
 *
 * 4. **Enhanced State Operations**
 *    - Bootstrap-aware entity argument generation
 *    - Automatic fallback from predefined to generated accounts
 *    - Role distribution tracking for ecosystem balance
 *    - Comprehensive error handling and recovery guidance
 *
 * Usage Examples:
 * 
 * ```javascript
 * // Simple bootstrap-aware role assignment
 * const roleArgs = stateManager.getBootstrapAwareRoleAssignment();
 * // Uses predefined accounts first, falls back to generated
 *
 * // Smart entity creation with prerequisite checking
 * const didArgs = stateManager.getSmartEntityArguments('did');
 * if (!didArgs) {
 *   const validation = stateManager.validateEntityPrerequisites('did');
 *   console.log('Missing:', validation.missingPrerequisites);
 * }
 *
 * // System health monitoring
 * const stats = stateManager.getEnhancedSystemStatistics();
 * console.log(`System readiness: ${stats.systemReadiness * 100}%`);
 *
 * // Comprehensive diagnostics
 * const diagnostics = stateManager.getDiagnosticInfo();
 * console.log('Health:', diagnostics.systemHealth);
 * ```
 *
 * Key Integration Benefits:
 * - Zero-configuration bootstrap process
 * - Automatic error detection and recovery
 * - Intelligent entity creation with dependency awareness
 * - Production-ready monitoring and diagnostics
 * - Seamless integration with Caliper benchmarking framework
 * ============================================================================
 */
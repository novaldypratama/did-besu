'use strict';

const crypto = require('crypto');
const { ethers } = require('ethers');
const bip39 = require('bip39');

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
   * Initializes the simplified SSI state manager with HD wallet support
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
    
    // HD wallet counters for deterministic generation
    this.hdCounter = 0;
    this.hdRoleCounters = {};
    
    // Minimal state tracking
    this.entities = {
      roles: new Map(),
      dids: new Map(),
      credentials: new Map()
    };
    
    // Initialize HD wallet and accounts
    this.predefinedAccounts = this.initializePredefinedAccounts();
    
    // Export wallet data to class instance for access by workloads
    this.walletData = {
      mnemonic: this.mnemonic,
      accountCount: this.predefinedAccounts.size,
      hdNode: this.rootHDNode
    };
    
    console.log(`🗃️ Simplified SSI State Manager initialized for worker ${workerIndex} with HD wallet support`);
  }
  
  /**
   * Initialize HD wallet accounts
   * @returns {Map} Map of HD wallet accounts
   * @private
   */
  initializePredefinedAccounts() {
    const accounts = new Map();
    
    // Generate a BIP39 mnemonic or use a predefined one for reproducibility
    // Each worker gets a different mnemonic to ensure unique addresses
    const seed = `ssi-caliper-benchmark-${this.workerIndex}-${this.config.chainId || '1337'}`;
    const entropyHash = crypto.createHash('sha256').update(seed).digest();
    const entropy = entropyHash.slice(0, 16); // Use first 16 bytes for entropy (128 bits)
    const mnemonic = bip39.entropyToMnemonic(entropy);
    
    // Store the mnemonic for debugging/recovery
    this.mnemonic = mnemonic;
    console.log(`🔑 Generated mnemonic for worker ${this.workerIndex}: ${mnemonic.split(' ').slice(0, 3).join(' ')}... (first 3 words)`);
    
    // Create an HD wallet from the mnemonic
    const hdNode = ethers.HDNodeWallet.fromPhrase(mnemonic);
    
    // Store the root HD node for later use
    this.rootHDNode = hdNode;
    
    // Generate a set of accounts with different roles
    const roleDistribution = [
      { role: SSI_ROLES.ISSUER, count: 3, capabilities: ['issue', 'revoke'] },
      { role: SSI_ROLES.HOLDER, count: 4, capabilities: ['store', 'present'] },
      { role: SSI_ROLES.TRUSTEE, count: 2, capabilities: ['manage', 'approve'] }
    ];
    
    let accountIndex = 0;
    const priorities = ['high', 'medium', 'medium', 'low'];
    
    // Generate addresses for each role type
    roleDistribution.forEach(roleConfig => {
      for (let i = 0; i < roleConfig.count; i++) {
        // Calculate a unique index for each role and worker
        const index = accountIndex + (roleConfig.role * 100); // Offset by role for organization
        
        // Derive wallet with index path
        // For ethers.js v6, we need to derive wallets differently
        const wallet = hdNode.deriveChild(index);
        
        // Get the address and private key
        const address = wallet.address;
        const privateKey = wallet.privateKey;
        
        // Set priority based on index within role category
        const priority = priorities[i] || 'low';
        
        // Build account name based on role type and priority
        const roleName = Object.keys(SSI_ROLES).find(key => SSI_ROLES[key] === roleConfig.role);
        const name = `${priority.charAt(0).toUpperCase() + priority.slice(1)} ${roleName}`;
        
        // Add the account to the map
        accounts.set(address, {
          role: roleConfig.role,
          name: name,
          privateKey: privateKey, // Store private key for signing transactions
          used: false,
          priority: priority,
          capabilities: roleConfig.capabilities || [],
          workerAssigned: this.workerIndex,
          hdIndex: index,
          derivationPath: `m/44'/60'/0'/0/${index}`,
          derivationIndex: accountIndex
        });
        
        accountIndex++;
      }
    });
    
    console.log(`📋 Initialized ${accounts.size} HD wallet accounts for worker ${this.workerIndex}`);
    return accounts;
  }
  
  /**
   * Generate a deterministic Ethereum address from HD wallet
   * @returns {Object} Object containing address and private key
   * @private
   */
  _generateDeterministicAddress() {
    // Generate a deterministic but unique path for each new address
    // Use a counter to ensure uniqueness
    const hdCounter = this.hdCounter || 0;
    this.hdCounter = hdCounter + 1;
    
    // If we don't have a root HD node yet, create one
    if (!this.rootHDNode) {
      // If mnemonic wasn't created in initializePredefinedAccounts, create it now
      if (!this.mnemonic) {
        const seed = `ssi-caliper-dynamic-${this.workerIndex}-${Date.now()}`;
        const entropyHash = crypto.createHash('sha256').update(seed).digest();
        const entropy = entropyHash.slice(0, 16);
        this.mnemonic = bip39.entropyToMnemonic(entropy);
      }
      
      // Create root HD node from mnemonic
      this.rootHDNode = ethers.HDNodeWallet.fromPhrase(this.mnemonic);
    }
    
    // Derive a new address using a higher index range for dynamically generated addresses
    const index = 1000 + hdCounter;
    const wallet = this.rootHDNode.deriveChild(index);
    
    return {
      address: wallet.address,
      privateKey: wallet.privateKey,
      index: index,
      hdIndex: index,
      derivationPath: `m/44'/60'/0'/0/${index}`
    };
  }
  
  /**
   * Generate a random Ethereum address
   * @returns {string} Ethereum address
   * @private
   */
  _generateRandomAddress() {
    // Use deterministic HD wallet address instead of random bytes
    return this._generateDeterministicAddress().address;
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
   * Get an HD wallet account with specific role
   * @param {number} role - Role type
   * @param {Object} options - Options for account selection
   * @returns {Object|null} Account or null if not found
   * @private
   */
  _getPredefinedAccountWithRole(role, options = {}) {
    const priorityOrder = ['high', 'medium', 'low'];
    const unusedAccounts = [];
    
    // First collect all matching unused accounts
    for (const [address, account] of this.predefinedAccounts.entries()) {
      if (account.role === role && !account.used) {
        unusedAccounts.push({
          address,
          ...account,
          priorityValue: priorityOrder.indexOf(account.priority || 'medium')
        });
      }
    }
    
    if (unusedAccounts.length === 0) {
      // If no predefined accounts with the role are available,
      // generate a new HD wallet account with the specific role
      if (options.generateIfMissing !== false) {
        return this._generateAccountWithRole(role);
      }
      return null;
    }
    
    // Sort by priority (highest priority first)
    unusedAccounts.sort((a, b) => a.priorityValue - b.priorityValue);
    
    // Select the highest priority account
    const selectedAccount = unusedAccounts[0];
    
    // Mark as used in the original map
    this.predefinedAccounts.get(selectedAccount.address).used = true;
    this.predefinedAccounts.get(selectedAccount.address).usedAt = Date.now();
    this.predefinedAccounts.get(selectedAccount.address).usedByWorker = this.workerIndex;
    
    return { 
      address: selectedAccount.address,
      privateKey: selectedAccount.privateKey,
      ...selectedAccount 
    };
  }
  
  /**
   * Generate a new HD wallet account with specific role
   * @param {number} role - Role type
   * @returns {Object} Generated account
   * @private
   */
  _generateAccountWithRole(role) {
    // Generate a deterministic but unique path for the role
    const hdCounter = this.hdRoleCounters = this.hdRoleCounters || {};
    hdCounter[role] = (hdCounter[role] || 0) + 1;
    
    // If we don't have a root HD node yet, create one
    if (!this.rootHDNode) {
      // If mnemonic wasn't created in initializePredefinedAccounts, create it now
      if (!this.mnemonic) {
        const seed = `ssi-caliper-roles-${this.workerIndex}-${Date.now()}`;
        const entropyHash = crypto.createHash('sha256').update(seed).digest();
        const entropy = entropyHash.slice(0, 16);
        this.mnemonic = bip39.entropyToMnemonic(entropy);
      }
      
      // Create root HD node from mnemonic
      this.rootHDNode = ethers.HDNodeWallet.fromPhrase(this.mnemonic);
    }
    
    // Derive a new address using different index ranges based on role
    const index = 2000 + (role * 100) + hdCounter[role];
    const wallet = this.rootHDNode.deriveChild(index);
    
    // Get role name for logging
    const roleName = Object.keys(SSI_ROLES).find(key => SSI_ROLES[key] === role) || 'UNKNOWN';
    
    // Add to predefined accounts for future reference
    const address = wallet.address;
    const privateKey = wallet.privateKey;
    
    const accountData = {
      role: role,
      name: `Generated ${roleName} #${hdCounter[role]}`,
      privateKey: privateKey,
      used: true,  // Mark as used immediately
      priority: 'medium',
      capabilities: [],
      workerAssigned: this.workerIndex,
      hdIndex: index,
      derivationPath: `m/44'/60'/0'/0/${index}`,
      derivationIndex: hdCounter[role],
      usedAt: Date.now(),
      generated: true
    };
    
    // Store in predefined accounts
    this.predefinedAccounts.set(address, accountData);
    
    console.log(`🔑 Generated new HD wallet account for role ${roleName}: ${address.substring(0, 10)}...`);
    
    return {
      address,
      privateKey,
      ...accountData
    };
  }

  // === ROLE MANAGEMENT ===
  
  /**
   * Get arguments for role assignment
   * @param {number} role - Role type (optional)
   * @param {Object} options - Additional options for role assignment
   * @returns {Object} Role assignment arguments
   */
  getRoleAssignmentArguments(role = null, options = {}) {
    // Count current role distribution
    const roleCounts = this._countRoleDistribution();
    
    // If no specific role is requested, determine based on current distribution
    let targetRole = role;
    
    if (targetRole === null) {
      // Target role distribution ratios (can be adjusted)
      const targetRatios = {
        [SSI_ROLES.ISSUER]: 0.3,  // 30% issuers
        [SSI_ROLES.HOLDER]: 0.6,  // 60% holders
        [SSI_ROLES.TRUSTEE]: 0.1  // 10% trustees
      };
      
      // Calculate the total number of roles assigned
      const totalRoles = Object.values(roleCounts).reduce((sum, count) => sum + count, 0);
      
      if (totalRoles === 0) {
        // If no roles assigned yet, start with an issuer
        targetRole = SSI_ROLES.ISSUER;
      } else {
        // Calculate current distribution percentages
        const currentRatios = {};
        Object.entries(roleCounts).forEach(([role, count]) => {
          currentRatios[role] = count / totalRoles;
        });
        
        // Find the role that's most under its target ratio
        let maxDeficit = -1;
        let selectedRole = SSI_ROLES.HOLDER; // Default
        
        Object.entries(targetRatios).forEach(([roleStr, targetRatio]) => {
          const role = parseInt(roleStr);
          const currentRatio = currentRatios[role] || 0;
          const deficit = targetRatio - currentRatio;
          
          if (deficit > maxDeficit) {
            maxDeficit = deficit;
            selectedRole = role;
          }
        });
        
        targetRole = selectedRole;
      }
      
      console.log(`📊 Role distribution: Issuers=${roleCounts[SSI_ROLES.ISSUER] || 0}, ` +
                  `Holders=${roleCounts[SSI_ROLES.HOLDER] || 0}, ` +
                  `Trustees=${roleCounts[SSI_ROLES.TRUSTEE] || 0}`);
      console.log(`🎲 Selecting role type ${targetRole} based on distribution algorithm`);
    }
    
    // Try to use predefined account first (with specific role)
    const predefinedAccount = this._getPredefinedAccountWithRole(targetRole);
    
    if (predefinedAccount) {
      console.log(`🎯 Using predefined account for role ${targetRole}: ${predefinedAccount.name}`);
      
      // Store in roles map with timestamp and metadata
      this.entities.roles.set(predefinedAccount.address, {
        role: targetRole,
        isPredefined: true,
        assignedAt: Date.now(),
        name: predefinedAccount.name
      });
      
      return {
        role: targetRole,
        account: predefinedAccount.address
      };
    }
    
    // If no suitable predefined account, check if we should reuse an existing account
    const shouldReuse = options.reuseExisting === true || Math.random() < 0.3; // 30% chance to reuse
    
    if (shouldReuse && this.entities.roles.size > 0) {
      // Find accounts that don't already have this role
      const candidateAddresses = [];
      
      for (const [address, data] of this.entities.roles.entries()) {
        if (data.role !== targetRole) {
          candidateAddresses.push(address);
        }
      }
      
      // If we have candidates, pick one randomly
      if (candidateAddresses.length > 0) {
        const address = candidateAddresses[Math.floor(Math.random() * candidateAddresses.length)];
        const oldRole = this.entities.roles.get(address).role;
        
        console.log(`♻️ Reusing address ${address} (changing role from ${oldRole} to ${targetRole})`);
        
        // Update role in map
        this.entities.roles.set(address, {
          role: targetRole,
          previousRole: oldRole,
          updatedAt: Date.now(),
          isReassigned: true
        });
        
        return {
          role: targetRole,
          account: address
        };
      }
    }
    
    // Generate new address if needed
    const newAddress = this._generateRandomAddress();
    
    // Store in roles map with metadata
    this.entities.roles.set(newAddress, {
      role: targetRole,
      isNew: true,
      assignedAt: Date.now()
    });
    
    // Increment counter
    this.counters[SSI_ENTITY_TYPES.ROLE]++;
    
    console.log(`🆕 Generated new address for role ${targetRole}: ${newAddress.substring(0, 10)}...`);
    
    return {
      role: targetRole,
      account: newAddress
    };
  }
  
  /**
   * Count the current distribution of roles
   * @returns {Object} Map of role counts
   * @private
   */
  _countRoleDistribution() {
    const counts = {
      [SSI_ROLES.NONE]: 0,
      [SSI_ROLES.ISSUER]: 0,
      [SSI_ROLES.HOLDER]: 0,
      [SSI_ROLES.TRUSTEE]: 0
    };
    
    // Count roles from entities map
    for (const data of this.entities.roles.values()) {
      counts[data.role] = (counts[data.role] || 0) + 1;
    }
    
    return counts;
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
   * Get accounts by role
   * @param {number} role - Role to filter by
   * @returns {Array} Array of addresses with the specified role
   */
  getAccountsByRole(role) {
    const result = [];
    
    for (const [address, data] of this.entities.roles.entries()) {
      if (data.role === role) {
        result.push({
          address,
          ...data
        });
      }
    }
    
    return result;
  }
  
  /**
   * Get entity state statistics
   * @returns {Object} State statistics
   */
  getStateStatistics() {
    // Count roles by type for more detailed statistics
    const roleCounts = this._countRoleDistribution();
    
    return {
      worker: this.workerIndex,
      entityCounts: {
        roles: this.entities.roles.size,
        dids: this.entities.dids.size,
        credentials: this.entities.credentials.size
      },
      roleCounts: {
        issuer: roleCounts[SSI_ROLES.ISSUER] || 0,
        holder: roleCounts[SSI_ROLES.HOLDER] || 0,
        trustee: roleCounts[SSI_ROLES.TRUSTEE] || 0
      },
      counters: { ...this.counters },
      walletData: {
        accountCount: this.predefinedAccounts.size,
        mnemonicFirstWords: this.mnemonic ? this.mnemonic.split(' ').slice(0, 3).join(' ') + '...' : null
      }
    };
  }
  
  /**
   * Get a wallet for a specific address
   * @param {string} address - Ethereum address
   * @returns {Object|null} Wallet object with privateKey or null if not found
   */
  getWalletForAddress(address) {
    const account = this.predefinedAccounts.get(address);
    if (!account || !account.privateKey) {
      return null;
    }
    
    return {
      address: address,
      privateKey: account.privateKey,
      role: account.role,
      name: account.name,
      hdPath: account.hdPath
    };
  }
  
  /**
   * Get all available wallets
   * @returns {Array} Array of wallet objects
   */
  getAllWallets() {
    const wallets = [];
    
    for (const [address, account] of this.predefinedAccounts.entries()) {
      wallets.push({
        address: address,
        privateKey: account.privateKey,
        role: account.role,
        name: account.name,
        used: account.used,
        hdPath: account.hdPath
      });
    }
    
    return wallets;
  }
  
  /**
   * Generate a new wallet with optional role
   * @param {number} role - Optional role to assign
   * @returns {Object} Generated wallet
   */
  generateNewWallet(role = null) {
    const walletInfo = this._generateDeterministicAddress();
    const address = walletInfo.address;
    
    // If role specified, add to roles map
    if (role !== null) {
      this.entities.roles.set(address, {
        role: role,
        isNew: true,
        assignedAt: Date.now()
      });
      
      // Increment counter
      this.counters[SSI_ENTITY_TYPES.ROLE]++;
    }
    
    return walletInfo;
  }
}

// Export constants
SimplifiedSSIStateManager.ENTITY_TYPES = SSI_ENTITY_TYPES;
SimplifiedSSIStateManager.ROLES = SSI_ROLES;

module.exports = SimplifiedSSIStateManager;
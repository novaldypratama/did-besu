'use strict';

/**
 * Class for managing SSI entities state (DIDs and Credentials).
 * Improved with better error handling and robustness
 */
class DIDState {
  /**
   * Initializes the SSI state.
   * @param {number} workerIndex - Index of the worker.
   * @param {string} didPrefix - Prefix for DIDs (e.g., "did:besu:").
   * @param {number} issuerCount - Target number of issuers to create.
   * @param {number} holderCount - Target number of holders to create.
   * @param {number} verifierCount - Target number of verifiers to create.
   */
  constructor(workerIndex, didPrefix, issuerCount, holderCount, verifierCount) {
    // Validate and set worker index
    this.workerIndex = typeof workerIndex === 'number' ? workerIndex : 0;

    // Validate and set DID prefix with default fallback
    this.didPrefix = didPrefix || 'did:besu:';

    // Error checking to ensure didPrefix is properly formatted
    if (!this.didPrefix.endsWith(':')) {
      this.didPrefix = `${this.didPrefix}:`;
    }

    // Store created DIDs by type
    this.issuers = [];
    this.holders = [];
    this.verifiers = [];
    this.credentials = [];

    // Current counts
    this.issuerCount = 0;
    this.holderCount = 0;
    this.verifierCount = 0;
    this.credentialCount = 0;

    // Target counts (with validation)
    this.targetIssuerCount = this._validateCount(issuerCount, 2, 'issuerCount');
    this.targetHolderCount = this._validateCount(holderCount, 2, 'holderCount');
    this.targetVerifierCount = this._validateCount(verifierCount, 2, 'verifierCount');

    // Track creation timestamps for uniqueness
    this.lastTimestamp = Date.now();

    console.log(`Worker ${this.workerIndex}: DIDState initialized with targets - Issuers: ${this.targetIssuerCount}, Holders: ${this.targetHolderCount}, Verifiers: ${this.targetVerifierCount}`);
  }

  /**
   * Validates a count parameter and returns a safe value
   * @param {number|string} count - The count to validate
   * @param {number} defaultValue - Default value if invalid
   * @param {string} paramName - Parameter name for logging
   * @returns {number} - Validated count
   * @private
   */
  _validateCount(count, defaultValue, paramName) {
    const parsedCount = parseInt(count);
    if (isNaN(parsedCount) || parsedCount < 0) {
      console.warn(`Worker ${this.workerIndex}: Invalid ${paramName} (${count}), using default: ${defaultValue}`);
      return defaultValue;
    }
    return parsedCount;
  }

  /**
   * Generate a new DID with the configured prefix.
   * @param {string} type - The type of entity (issuer, holder, verifier).
   * @returns {string} - The generated DID.
   * @private
   */
  _generateDID(type) {
    // Ensure type is valid, defaulting to 'entity' if not
    const validTypes = ['issuer', 'holder', 'verifier'];
    if (!validTypes.includes(type)) {
      console.warn(`Worker ${this.workerIndex}: Invalid DID type "${type}", defaulting to "entity"`);
      type = 'entity';
    }

    // Ensure unique timestamps by incrementing if same as last
    let timestamp = Date.now();
    if (timestamp <= this.lastTimestamp) {
      timestamp = this.lastTimestamp + 1;
    }
    this.lastTimestamp = timestamp;

    // Generate a unique random component to prevent collisions
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');

    return `${this.didPrefix}${type}:${this.workerIndex}:${timestamp}:${this._getUniqueCount()}:${random}`;
  }

  /**
   * Get a unique incrementing counter for all DIDs.
   * @returns {number} - Unique count across all DID types.
   * @private
   */
  _getUniqueCount() {
    return this.issuerCount + this.holderCount + this.verifierCount;
  }

  /**
   * Generate random public key for testing.
   * @returns {string} - A random public key.
   * @private
   */
  _generatePublicKey() {
    // Generate a random 32-byte hex string for the public key
    // Starts with '0x' for compatibility with Ethereum
    return '0x' + Array.from({ length: 64 }, () =>
      Math.floor(Math.random() * 16).toString(16)).join('');
  }

  /**
   * Generate a service endpoint for testing.
   * @param {string} did - The DID for this entity.
   * @returns {string} - A service endpoint.
   * @private
   */
  _generateServiceEndpoint(did) {
    // Replace any potentially problematic characters in DID for URL use
    const safeDid = did.replace(/:/g, '_');

    // Create a mock service endpoint
    return `https://example.org/service/${safeDid}`;
  }

  /**
   * Find a DID by its identifier
   * @param {string} did - The DID to find
   * @returns {Object|null} - The DID object or null if not found
   */
  findDID(did) {
    // Check all collections
    for (const collection of [this.issuers, this.holders, this.verifiers]) {
      const found = collection.find(entry => entry.did === did);
      if (found) return found;
    }
    return null;
  }

  /**
   * Get arguments for registering a new issuer DID.
   * @returns {object} - The arguments for registerDID.
   */
  getRegisterIssuerDIDArguments() {
    const did = this._generateDID('issuer');
    const publicKey = this._generatePublicKey();
    const serviceEndpoint = this._generateServiceEndpoint(did);
    const role = 1; // ISSUER role from the contract enum

    this.issuers.push({
      did,
      publicKey,
      serviceEndpoint,
      active: true,
      created: Date.now()
    });

    this.issuerCount++;

    console.log(`Worker ${this.workerIndex}: Created issuer DID: ${did}`);

    return {
      did,
      publicKey,
      serviceEndpoint,
      role
    };
  }

  /**
   * Get arguments for registering a new holder DID.
   * @returns {object} - The arguments for registerDID.
   */
  getRegisterHolderDIDArguments() {
    const did = this._generateDID('holder');
    const publicKey = this._generatePublicKey();
    const serviceEndpoint = this._generateServiceEndpoint(did);
    const role = 2; // HOLDER role from the contract enum

    this.holders.push({
      did,
      publicKey,
      serviceEndpoint,
      active: true,
      created: Date.now()
    });

    this.holderCount++;

    console.log(`Worker ${this.workerIndex}: Created holder DID: ${did}`);

    return {
      did,
      publicKey,
      serviceEndpoint,
      role
    };
  }

  /**
   * Get arguments for registering a new verifier DID.
   * @returns {object} - The arguments for registerDID.
   */
  getRegisterVerifierDIDArguments() {
    const did = this._generateDID('verifier');
    const publicKey = this._generatePublicKey();
    const serviceEndpoint = this._generateServiceEndpoint(did);
    const role = 3; // VERIFIER role from the contract enum

    this.verifiers.push({
      did,
      publicKey,
      serviceEndpoint,
      active: true,
      created: Date.now()
    });

    this.verifierCount++;

    console.log(`Worker ${this.workerIndex}: Created verifier DID: ${did}`);

    return {
      did,
      publicKey,
      serviceEndpoint,
      role
    };
  }

  /**
   * Get arguments for updating a DID.
   * @returns {object} - The arguments for updateDID.
   */
  getUpdateDIDArguments() {
    // Combine all DIDs and select a random one
    const allDIDs = [...this.issuers, ...this.holders, ...this.verifiers];
    if (allDIDs.length === 0) {
      throw new Error('No DIDs available to update');
    }

    const randomIndex = Math.floor(Math.random() * allDIDs.length);
    const did = allDIDs[randomIndex].did;
    const newPublicKey = this._generatePublicKey();
    const newServiceEndpoint = this._generateServiceEndpoint(did) + '/updated';

    // Update the DID in our state
    allDIDs[randomIndex].publicKey = newPublicKey;
    allDIDs[randomIndex].serviceEndpoint = newServiceEndpoint;
    allDIDs[randomIndex].updated = Date.now();

    console.log(`Worker ${this.workerIndex}: Updating DID: ${did}`);

    return {
      did,
      publicKey: newPublicKey,
      serviceEndpoint: newServiceEndpoint
    };
  }

  /**
   * Get arguments for deactivating a DID.
   * @returns {object} - The arguments for deactivateDID.
   */
  getDeactivateDIDArguments() {
    // Combine all DIDs and select a random active one
    const allDIDs = [...this.issuers, ...this.holders, ...this.verifiers]
      .filter(did => did.active);

    if (allDIDs.length === 0) {
      throw new Error('No active DIDs available to deactivate');
    }

    const randomIndex = Math.floor(Math.random() * allDIDs.length);
    const did = allDIDs[randomIndex].did;

    // Mark as inactive in our state
    allDIDs[randomIndex].active = false;
    allDIDs[randomIndex].deactivated = Date.now();

    console.log(`Worker ${this.workerIndex}: Deactivating DID: ${did}`);

    return {
      did
    };
  }

  /**
   * Get arguments for resolving a DID.
   * @returns {object} - The arguments for resolveDID.
   */
  getResolveDIDArguments() {
    // Combine all DIDs and select a random one
    const allDIDs = [...this.issuers, ...this.holders, ...this.verifiers];
    if (allDIDs.length === 0) {
      throw new Error('No DIDs available to resolve');
    }

    const randomIndex = Math.floor(Math.random() * allDIDs.length);
    const did = allDIDs[randomIndex].did;

    console.log(`Worker ${this.workerIndex}: Resolving DID: ${did}`);

    return {
      did
    };
  }

  /**
   * Get a random active DID of a specific role
   * @param {string} role - The role type ('issuer', 'holder', 'verifier')
   * @returns {object|null} - A random DID object or null if none available
   */
  getRandomActiveDID(role) {
    let collection;

    // Select the appropriate collection based on role
    switch (role.toLowerCase()) {
      case 'issuer':
        collection = this.issuers;
        break;
      case 'holder':
        collection = this.holders;
        break;
      case 'verifier':
        collection = this.verifiers;
        break;
      default:
        console.warn(`Worker ${this.workerIndex}: Invalid role "${role}" for getRandomActiveDID`);
        return null;
    }

    // Filter for active DIDs
    const activeDIDs = collection.filter(did => did.active);

    if (activeDIDs.length === 0) {
      return null;
    }

    // Select a random active DID
    const randomIndex = Math.floor(Math.random() * activeDIDs.length);
    return activeDIDs[randomIndex];
  }

  /**
   * Get statistics about the current state
   * @returns {object} - Statistics about DIDs and status
   */
  getStats() {
    return {
      issuers: {
        total: this.issuers.length,
        active: this.issuers.filter(i => i.active).length,
        inactive: this.issuers.filter(i => !i.active).length
      },
      holders: {
        total: this.holders.length,
        active: this.holders.filter(h => h.active).length,
        inactive: this.holders.filter(h => !h.active).length
      },
      verifiers: {
        total: this.verifiers.length,
        active: this.verifiers.filter(v => v.active).length,
        inactive: this.verifiers.filter(v => !v.active).length
      },
      credentials: this.credentials.length,
      total: this.issuers.length + this.holders.length + this.verifiers.length
    };
  }
}

module.exports = DIDState;

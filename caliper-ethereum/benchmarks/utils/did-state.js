'use strict';

/**
 * Class for managing SSI entities state (DIDs and Credentials).
 * Similar to SimpleState but specialized for SSI operations.
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
    this.workerIndex = workerIndex;
    this.didPrefix = didPrefix || 'did:besu:';

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

    // Target counts
    this.targetIssuerCount = issuerCount || 5;
    this.targetHolderCount = holderCount || 10;
    this.targetVerifierCount = verifierCount || 2;
  }

  /**
   * Generate a new DID with the configured prefix.
   * @param {string} type - The type of entity (issuer, holder, verifier).
   * @returns {string} - The generated DID.
   * @private
   */
  _generateDID(type) {
    const timestamp = Date.now();
    return `${this.didPrefix}${type}:${this.workerIndex}:${timestamp}:${this._getUniqueCount()}`;
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
    // Create a mock service endpoint
    return `https://example.org/${did.replace(/:/g, '_')}/service`;
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
      active: true
    });

    this.issuerCount++;

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
      active: true
    });

    this.holderCount++;

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
      active: true
    });

    this.verifierCount++;

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
    return {
      did: allDIDs[randomIndex].did
    };
  }
}

module.exports = DIDState;

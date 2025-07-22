// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./DidRegistry.sol";

/**
 * @title CredentialRegistry
 * @dev Smart contract for managing Verifiable Credentials in an SSI system
 */
contract CredentialRegistry {
    // Reference to the DID Registry
    DIDRegistry private didRegistry;
    
    // Credential status enum
    enum CredentialStatus { ACTIVE, SUSPENDED, REVOKED }
    
    // Credential metadata structure
    struct CredentialMetadata {
        string credentialId;          // Unique identifier for the credential
        string issuerDid;             // DID of the issuer
        string holderDid;             // DID of the holder
        string credentialHash;        // Hash of the actual credential data (stored off-chain)
        string schemaId;              // Reference to the credential schema
        uint256 issuanceDate;         // When the credential was issued
        uint256 expirationDate;       // When the credential expires (0 for no expiration)
        CredentialStatus status;      // Current status of the credential
    }
    
    // Mapping from credential ID to metadata
    mapping(string => CredentialMetadata) private credentials;
    
    // Mapping from issuer DID to array of credential IDs they've issued
    mapping(string => string[]) private issuerCredentials;
    
    // Mapping from holder DID to array of credential IDs they hold
    mapping(string => string[]) private holderCredentials;
    
    // Events
    event CredentialIssued(string indexed credentialId, string indexed issuerDid, string indexed holderDid);
    event CredentialRevoked(string indexed credentialId, string indexed issuerDid);
    event CredentialSuspended(string indexed credentialId, string indexed issuerDid);
    event CredentialActivated(string indexed credentialId, string indexed issuerDid);
    
    /**
     * @dev Constructor to set the DID Registry address
     * @param _didRegistryAddress Address of the deployed DID Registry contract
     */
    constructor(address _didRegistryAddress) {
        didRegistry = DIDRegistry(_didRegistryAddress);
    }
    
    /**
     * @dev Issue a new verifiable credential
     * @param credentialId Unique identifier for the credential
     * @param issuerDid DID of the issuer
     * @param holderDid DID of the holder
     * @param credentialHash Hash of the credential data stored off-chain
     * @param schemaId Reference to the credential schema
     * @param expirationDate When the credential expires (0 for no expiration)
     */
    function issueCredential(
        string calldata credentialId,
        string calldata issuerDid,
        string calldata holderDid,
        string calldata credentialHash,
        string calldata schemaId,
        uint256 expirationDate
    ) external {
        // Verify that credential ID doesn't already exist
        require(bytes(credentials[credentialId].credentialId).length == 0, "Credential ID already exists");
        
        // Verify that issuer is registered and has ISSUER role
        require(didRegistry.isDIDOwnedBy(issuerDid, msg.sender), "Only issuer can issue credentials");
        
        // Verify that holder is registered
        require(didRegistry.isDIDActive(holderDid), "Holder DID is not active");
        
        // Create credential metadata
        CredentialMetadata memory newCredential = CredentialMetadata({
            credentialId: credentialId,
            issuerDid: issuerDid,
            holderDid: holderDid,
            credentialHash: credentialHash,
            schemaId: schemaId,
            issuanceDate: block.timestamp,
            expirationDate: expirationDate,
            status: CredentialStatus.ACTIVE
        });
        
        // Store credential metadata
        credentials[credentialId] = newCredential;
        
        // Update issuer and holder credential lists
        issuerCredentials[issuerDid].push(credentialId);
        holderCredentials[holderDid].push(credentialId);
        
        // Emit event
        emit CredentialIssued(credentialId, issuerDid, holderDid);
    }
    
    /**
     * @dev Revoke a credential (permanent)
     * @param credentialId The ID of the credential to revoke
     */
    function revokeCredential(string calldata credentialId) external {
        CredentialMetadata storage credential = credentials[credentialId];
        
        // Verify credential exists
        require(bytes(credential.credentialId).length > 0, "Credential does not exist");
        
        // Verify caller is the issuer
        require(didRegistry.isDIDOwnedBy(credential.issuerDid, msg.sender), "Only issuer can revoke credentials");
        
        // Verify credential is not already revoked
        require(credential.status != CredentialStatus.REVOKED, "Credential is already revoked");
        
        // Update status
        credential.status = CredentialStatus.REVOKED;
        
        // Emit event
        emit CredentialRevoked(credentialId, credential.issuerDid);
    }
    
    /**
     * @dev Suspend a credential (temporary)
     * @param credentialId The ID of the credential to suspend
     */
    function suspendCredential(string calldata credentialId) external {
        CredentialMetadata storage credential = credentials[credentialId];
        
        // Verify credential exists
        require(bytes(credential.credentialId).length > 0, "Credential does not exist");
        
        // Verify caller is the issuer
        require(didRegistry.isDIDOwnedBy(credential.issuerDid, msg.sender), "Only issuer can suspend credentials");
        
        // Verify credential is active
        require(credential.status == CredentialStatus.ACTIVE, "Credential is not active");
        
        // Update status
        credential.status = CredentialStatus.SUSPENDED;
        
        // Emit event
        emit CredentialSuspended(credentialId, credential.issuerDid);
    }
    
    /**
     * @dev Reactivate a suspended credential
     * @param credentialId The ID of the credential to reactivate
     */
    function activateCredential(string calldata credentialId) external {
        CredentialMetadata storage credential = credentials[credentialId];
        
        // Verify credential exists
        require(bytes(credential.credentialId).length > 0, "Credential does not exist");
        
        // Verify caller is the issuer
        require(didRegistry.isDIDOwnedBy(credential.issuerDid, msg.sender), "Only issuer can activate credentials");
        
        // Verify credential is suspended
        require(credential.status == CredentialStatus.SUSPENDED, "Credential is not suspended");
        
        // Update status
        credential.status = CredentialStatus.ACTIVE;
        
        // Emit event
        emit CredentialActivated(credentialId, credential.issuerDid);
    }
    
    /**
     * @dev Verify a credential's validity (used by Verifiers)
     * @param credentialId The ID of the credential to verify
     * @param issuerDid The expected issuer DID
     * @param holderDid The expected holder DID
     * @return valid Whether the credential is valid
     * @return reason If invalid, a reason code (0 = valid, 1 = not found, 2 = revoked, 3 = suspended, 4 = expired, 5 = issuer mismatch, 6 = holder mismatch)
     */
    function verifyCredential(
        string calldata credentialId,
        string calldata issuerDid,
        string calldata holderDid
    ) external view returns (bool valid, uint8 reason) {
        CredentialMetadata memory credential = credentials[credentialId];
        
        // Check if credential exists
        if (bytes(credential.credentialId).length == 0) {
            return (false, 1); // Not found
        }
        
        // Check if credential is revoked
        if (credential.status == CredentialStatus.REVOKED) {
            return (false, 2); // Revoked
        }
        
        // Check if credential is suspended
        if (credential.status == CredentialStatus.SUSPENDED) {
            return (false, 3); // Suspended
        }
        
        // Check if credential is expired
        if (credential.expirationDate != 0 && credential.expirationDate < block.timestamp) {
            return (false, 4); // Expired
        }
        
        // Check if issuer matches
        if (keccak256(bytes(credential.issuerDid)) != keccak256(bytes(issuerDid))) {
            return (false, 5); // Issuer mismatch
        }
        
        // Check if holder matches
        if (keccak256(bytes(credential.holderDid)) != keccak256(bytes(holderDid))) {
            return (false, 6); // Holder mismatch
        }
        
        // All checks passed
        return (true, 0);
    }
    
    /**
     * @dev Get credential metadata
     * @param credentialId The ID of the credential
     */
    function getCredential(string calldata credentialId) external view returns (
        string memory issuerDid,
        string memory holderDid,
        string memory credentialHash,
        string memory schemaId,
        uint256 issuanceDate,
        uint256 expirationDate,
        CredentialStatus status
    ) {
        CredentialMetadata memory credential = credentials[credentialId];
        require(bytes(credential.credentialId).length > 0, "Credential does not exist");
        
        return (
            credential.issuerDid,
            credential.holderDid,
            credential.credentialHash,
            credential.schemaId,
            credential.issuanceDate,
            credential.expirationDate,
            credential.status
        );
    }
    
    /**
     * @dev Get all credentials issued by a particular issuer
     * @param issuerDid The DID of the issuer
     */
    function getCredentialsByIssuer(string calldata issuerDid) external view returns (string[] memory) {
        return issuerCredentials[issuerDid];
    }
    
    /**
     * @dev Get all credentials held by a particular holder
     * @param holderDid The DID of the holder
     */
    function getCredentialsByHolder(string calldata holderDid) external view returns (string[] memory) {
        return holderCredentials[holderDid];
    }
}
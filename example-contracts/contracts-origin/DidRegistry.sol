// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

/**
 * @title DIDRegistry
 * @dev Smart contract for managing Decentralized Identifiers (DIDs) in an SSI system
 */
contract DIDRegistry {
    // Role definitions
    enum Role { NONE, ISSUER, HOLDER, VERIFIER }
    
    // DID Document structure
    struct DIDDocument {
        address owner;            // Ethereum address that controls this DID
        string publicKey;         // Public key for verification (could be extended to array)
        string serviceEndpoint;   // Endpoint where the entity can be reached
        uint256 created;          // Creation timestamp
        uint256 updated;          // Last update timestamp
        bool active;              // Whether DID is active
        Role role;                // Role of the DID owner in the SSI ecosystem
    }
    
    // Mapping from DID (string) to DID Document
    mapping(string => DIDDocument) private didDocuments;
    
    // Mapping from address to DIDs they control
    mapping(address => string[]) private addressToDIDs;

    // Events
    event DIDRegistered(string indexed did, address indexed owner, Role role);
    event DIDUpdated(string indexed did, address indexed owner);
    event DIDDeactivated(string indexed did, address indexed owner);
    
    /**
     * @dev Register a new DID with its document
     * @param did The DID string (usually in format "did:method:identifier")
     * @param publicKey Public key associated with the DID
     * @param serviceEndpoint Endpoint where the entity can be reached
     * @param role Role of the entity (ISSUER or HOLDER)
     */
    function registerDID(
        string calldata did,
        string calldata publicKey,
        string calldata serviceEndpoint,
        Role role
    ) external {
        // Ensure DID doesn't already exist
        require(didDocuments[did].owner == address(0), "DID already registered");
        // Ensure valid role
        require(role == Role.ISSUER || role == Role.HOLDER, "Invalid role");
        
        // Create DID Document
        DIDDocument memory newDID = DIDDocument({
            owner: msg.sender,
            publicKey: publicKey,
            serviceEndpoint: serviceEndpoint,
            created: block.timestamp,
            updated: block.timestamp,
            active: true,
            role: role
        });
        
        // Store DID Document
        didDocuments[did] = newDID;
        
        // Add DID to owner's list
        addressToDIDs[msg.sender].push(did);
        
        // Emit event
        emit DIDRegistered(did, msg.sender, role);
    }
    
    /**
     * @dev Update an existing DID document
     * @param did The DID to update
     * @param publicKey New public key
     * @param serviceEndpoint New service endpoint
     */
    function updateDID(
        string calldata did,
        string calldata publicKey,
        string calldata serviceEndpoint
    ) external {
        // Ensure DID exists and caller is owner
        require(didDocuments[did].owner == msg.sender, "Not authorized to update DID");
        require(didDocuments[did].active, "DID is not active");
        
        // Update DID Document
        didDocuments[did].publicKey = publicKey;
        didDocuments[did].serviceEndpoint = serviceEndpoint;
        didDocuments[did].updated = block.timestamp;
        
        // Emit event
        emit DIDUpdated(did, msg.sender);
    }
    
    /**
     * @dev Deactivate a DID
     * @param did The DID to deactivate
     */
    function deactivateDID(string calldata did) external {
        // Ensure DID exists and caller is owner
        require(didDocuments[did].owner == msg.sender, "Not authorized to deactivate DID");
        require(didDocuments[did].active, "DID is already inactive");
        
        // Deactivate DID
        didDocuments[did].active = false;
        didDocuments[did].updated = block.timestamp;
        
        // Emit event
        emit DIDDeactivated(did, msg.sender);
    }
    
    /**
     * @dev Resolve a DID to get its document (used by Verifiers)
     * @param did The DID to resolve
     * @return owner The DID owner address
     * @return publicKey The public key
     * @return serviceEndpoint The service endpoint
     * @return created Creation timestamp
     * @return updated Last update timestamp
     * @return active Whether DID is active
     * @return role Role of the DID owner
     */
    function resolveDID(string calldata did) external view returns (
        address owner,
        string memory publicKey,
        string memory serviceEndpoint,
        uint256 created,
        uint256 updated,
        bool active,
        Role role
    ) {
        DIDDocument memory doc = didDocuments[did];
        require(doc.owner != address(0), "DID not found");
        
        return (
            doc.owner,
            doc.publicKey,
            doc.serviceEndpoint,
            doc.created,
            doc.updated,
            doc.active,
            doc.role
        );
    }
    
    /**
     * @dev Check if a DID exists and is active
     * @param did The DID to check
     * @return Whether the DID exists and is active
     */
    function isDIDActive(string calldata did) external view returns (bool) {
        return didDocuments[did].active;
    }
    
    /**
     * @dev Get all DIDs owned by an address
     * @param owner The address to query
     * @return Array of DIDs owned by the address
     */
    function getDIDsByOwner(address owner) external view returns (string[] memory) {
        return addressToDIDs[owner];
    }
    
    /**
     * @dev Check if a DID is owned by a specific address
     * @param did The DID to check
     * @param owner The address to check against
     * @return Whether the DID is owned by the address
     */
    function isDIDOwnedBy(string calldata did, address owner) external view returns (bool) {
        return didDocuments[did].owner == owner;
    }
}
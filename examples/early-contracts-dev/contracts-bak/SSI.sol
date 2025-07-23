// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract SSI {
    
    // ====================
    // STRUCTS & ENUMS
    // ====================
    
    // Identity details
    struct Identity {
        bool registered;
        string metadataURI; // Link to off-chain metadata (e.g., IPFS, Arweave)
        Role role;
    }
    
    // Credential details
    struct Credential {
        address issuer;
        address holder;
        string credentialHash; // Hash of the verifiable credential
        bool valid;
    }

    // Role definitions
    enum Role { Holder, Issuer, Verifier }
    
    // ====================
    // STATE VARIABLES
    // ====================
    
    mapping(address => Identity) public identities;
    mapping(bytes32 => Credential) public credentials;
    
    // ====================
    // EVENTS
    // ====================
    
    event IdentityRegistered(address indexed user, Role role, string metadataURI);
    event CredentialIssued(address indexed issuer, address indexed holder, bytes32 credentialHash);
    event CredentialVerified(address indexed verifier, bytes32 credentialHash, bool isValid);
    event CredentialRevoked(address indexed issuer, bytes32 credentialHash);
    
    // ====================
    // MODIFIERS
    // ====================
    
    modifier onlyRegistered() {
        require(identities[msg.sender].registered, "Identity not registered");
        _;
    }
    
    modifier onlyIssuer() {
        require(identities[msg.sender].role == Role.Issuer, "Only issuers can perform this action");
        _;
    }

    modifier onlyHolder() {
        require(identities[msg.sender].role == Role.Holder, "Only holders can perform this action");
        _;
    }

    // ====================
    // FUNCTIONS
    // ====================

    /**
     * @dev Register an identity on the blockchain
     * @param _metadataURI Link to metadata stored off-chain (e.g., IPFS)
     * @param _role The role of the registering user (Holder, Issuer, Verifier)
     */
    function registerIdentity(string memory _metadataURI, Role _role) external {
        require(!identities[msg.sender].registered, "Identity already registered");
        
        identities[msg.sender] = Identity({
            registered: true,
            metadataURI: _metadataURI,
            role: _role
        });

        emit IdentityRegistered(msg.sender, _role, _metadataURI);
    }

    /**
     * @dev Issue a verifiable credential to a holder
     * @param _holder The address of the identity holder
     * @param _credentialHash The hash of the credential data
     */
    function issueCredential(address _holder, string memory _credentialHash) external onlyIssuer {
        require(identities[_holder].registered, "Holder not registered");
        
        bytes32 credentialID = keccak256(abi.encodePacked(_holder, _credentialHash));
        
        credentials[credentialID] = Credential({
            issuer: msg.sender,
            holder: _holder,
            credentialHash: _credentialHash,
            valid: true
        });

        emit CredentialIssued(msg.sender, _holder, credentialID);
    }

    /**
     * @dev Verify if a credential is valid
     * @param _holder The address of the credential holder
     * @param _credentialHash The hash of the credential
     * @return bool Credential validity
     */
    function verifyCredential(address _holder, string memory _credentialHash) external view returns (bool) {
        bytes32 credentialID = keccak256(abi.encodePacked(_holder, _credentialHash));
        return credentials[credentialID].valid;
    }

    /**
     * @dev Revoke a credential issued by an issuer
     * @param _credentialHash The hash of the credential to be revoked
     */
    function revokeCredential(string memory _credentialHash) external onlyIssuer {
        bytes32 credentialID = keccak256(abi.encodePacked(msg.sender, _credentialHash));
        require(credentials[credentialID].issuer == msg.sender, "Not the credential issuer");
        
        credentials[credentialID].valid = false;

        emit CredentialRevoked(msg.sender, credentialID);
    }
}
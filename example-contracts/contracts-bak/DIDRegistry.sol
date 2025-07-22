// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

contract DIDRegistry {
    // Structure to hold DID details
    struct DID {
        string did;         // The DID identifier
        address owner;      // Owner of the DID
        string publicKey;   // Associated public key
        uint256 created;    // Timestamp when the DID was created
    }

    // Mapping from a DID string to its record
    mapping(string => DID) private dids;

    // Event for logging DID creation
    event DIDCreated(string indexed did, address owner);

    /**
     * @notice Creates a new DID.
     * @param _did The decentralized identifier string.
     * @param _publicKey The public key associated with the DID.
     * @return success True if the DID is successfully created.
     */
    function createDID(string memory _did, string memory _publicKey) public returns (bool success) {
        require(dids[_did].owner == address(0), "DID already exists");
        dids[_did] = DID({
            did: _did,
            owner: msg.sender,
            publicKey: _publicKey,
            created: block.timestamp
        });
        emit DIDCreated(_did, msg.sender);
        return true;
    }

    /**
     * @notice Retrieves the details for a given DID.
     * @param _did The decentralized identifier string.
     * @return owner Address of the DID owner.
     * @return publicKey The public key associated with the DID.
     * @return created Timestamp when the DID was created.
     */
    function getDID(string memory _did) public view returns (address owner, string memory publicKey, uint256 created) {
        require(dids[_did].owner != address(0), "DID not found");
        DID memory record = dids[_did];
        return (record.owner, record.publicKey, record.created);
    }
}

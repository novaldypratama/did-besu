// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IDIDRegistry {
    function getDID(string memory _did) external view returns (address, string memory, uint256);
}

contract VCRegistry {
    // Instance of the DIDRegistry contract to validate DIDs.
    IDIDRegistry public didRegistry;

    struct VerifiableCredential {
        string vcId;         // Unique identifier for the VC
        string subjectDid;   // The DID of the credential subject
        address issuer;      // Address of the issuer who attested the VC
        string data;         // Credential data (could be JSON or a URI)
        uint256 issuedAt;    // Timestamp when the VC was issued
    }

    mapping(string => VerifiableCredential[]) private vcRecords;

    event VCIssued(string indexed subjectDid, string vcId, address issuer);

    /**
     * @notice Constructor that sets the address of the DIDRegistry.
     * @param _didRegistryAddress The address of the deployed DIDRegistry contract.
     */
    constructor(address _didRegistryAddress) {
        require(_didRegistryAddress != address(0), "DIDRegistry address cannot be zero");
        didRegistry = IDIDRegistry(_didRegistryAddress);
    }

    /**
     * @notice Attests (issues) a verifiable credential for a given subject DID.
     * @param _subjectDid The DID of the credential subject.
     * @param _vcId A unique identifier for the verifiable credential.
     * @param _data Credential data (e.g., a JSON string or URI).
     * @return success True if the credential is successfully attested.
     */
    function attestCredential(
        string memory _subjectDid, 
        string memory _vcId, 
        string memory _data
    ) public returns (bool success) {
        // Use try/catch to wrap the call to getDID so that
        // any revert from the DIDRegistry is translated to the expected error.
        address owner;
        try didRegistry.getDID(_subjectDid) returns (address _owner, string memory, uint256) {
            owner = _owner;
        } catch {
            revert("Subject DID not registered");
        }
        require(owner != address(0), "Subject DID not registered");

        // Ensure that no VC with the same identifier exists.
        VerifiableCredential[] storage vcs = vcRecords[_subjectDid];
        for (uint i = 0; i < vcs.length; i++) {
            require(
                keccak256(bytes(vcs[i].vcId)) != keccak256(bytes(_vcId)),
                "VC already exists"
            );
        }

        vcs.push(VerifiableCredential({
            vcId: _vcId,
            subjectDid: _subjectDid,
            issuer: msg.sender,
            data: _data,
            issuedAt: block.timestamp
        }));
        emit VCIssued(_subjectDid, _vcId, msg.sender);
        return true;
    }

    /**
     * @notice Verifies a verifiable credential for a given subject DID.
     * @param _subjectDid The DID of the credential subject.
     * @param _vcId The unique identifier for the verifiable credential.
     * @return valid True if the credential exists.
     * @return issuer Address of the credential issuer.
     * @return data Credential data associated with the VC.
     * @return issuedAt Timestamp when the credential was issued.
     */
    function verifyCredential(string memory _subjectDid, string memory _vcId) public view 
        returns (bool valid, address issuer, string memory data, uint256 issuedAt) 
    {
        VerifiableCredential[] storage vcs = vcRecords[_subjectDid];
        for (uint i = 0; i < vcs.length; i++) {
            if (keccak256(bytes(vcs[i].vcId)) == keccak256(bytes(_vcId))) {
                return (true, vcs[i].issuer, vcs[i].data, vcs[i].issuedAt);
            }
        }
        return (false, address(0), "", 0);
    }
}

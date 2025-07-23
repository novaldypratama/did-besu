// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { DidRecord } from './DidTypes.sol';
import { DidAlreadyExist, DidNotFound, NotIdentityOwner } from './DidErrors.sol';
import { DidRegistryInterface } from './DidRegistryInterface.sol';
import { RoleControlInterface } from './RoleControl.sol';

contract DidRegistry is DidRegistryInterface {
    // TODO: add nonce for endorsing transactions
    
    RoleControlInterface internal _roleControl;

    // Mapping from a DID to its corresponding DidRecord (Document/Metadata/ServiceEndpoint)
    mapping(address identity => DidRecord didRecord) private _dids;

    /**
     * Checks that DID already exists
     */
    modifier _didExist(address identity) {
        if (_dids[identity].metadata.created == 0) revert DidNotFound(identity);
        _;
    }

    /**
     * Checks that the DID has not yet been added
     */
    modifier _didNotExist(address identity) {
        if (_dids[identity].metadata.created != 0) revert DidAlreadyExist(identity);
        _;
    }

    /**
     * Checks that method was called either by Trustee or Endorser or Steward
     */
    modifier _senderIsTrusteeOrEndorserOrSteward() {
        _roleControl.isTrusteeOrEndorserOrSteward(msg.sender);
        _;
    }

    /**
     * Checks that method was called either by Identity owner or Trustee or Endorser or Steward
     */
    modifier _senderIsIdentityOwnerOrTrustee(address identity) {
        if (msg.sender == identity) {
            _;
        } else {
            _roleControl.isTrustee(msg.sender);
            _;
        }
    }

    /**
     * Checks that actor matches to the identity
     */
    modifier _identityOwner(address identity, address actor) {
        if (identity != actor) revert NotIdentityOwner(actor, identity);
        _;
    }
    
    /// @inheritdoc DidRegistryInterface
    function createDid(address identity, bytes calldata document) public {
        _createDid(identity, msg.sender, document);
    }

    /// @inheritdoc DidRegistryInterface
    function createDidSigned(address identity, uint8 sigV, bytes32 sigR, bytes32 sigS, bytes calldata document) public {
        bytes32 hash = keccak256(
            abi.encodePacked(bytes1(0x19), bytes1(0), address(this), identity, "createDid", document)
        );
        _createDid(identity, ecrecover(hash, sigV, sigR, sigS), document);
    }

    /// @inheritdoc DidRegistryInterface
    function updateDid(address identity, bytes calldata document) public {
        _updateDid(identity, msg.sender, document);
    }

    /// @inheritdoc DidRegistryInterface
    function updateDidSigned(address identity, uint8 sigV, bytes32 sigR, bytes32 sigS, bytes calldata document) public {
        bytes32 hash = keccak256(
            abi.encodePacked(bytes1(0x19), bytes1(0), address(this), identity, "updateDid", document)
        );
        _updateDid(identity, ecrecover(hash, sigV, sigR, sigS), document);
    }

    /// @inheritdoc DidRegistryInterface
    function resolveDid(address identity) public view virtual _didExist(identity) returns (DidRecord memory) {
        return _dids[identity];
    }

    function _createDid(
        address identity,
        address role, // role is either message sender in case of `createDid` or signer in case of `createDidSigner`
        bytes calldata document
    ) internal _didNotExist(identity) _identityOwner(identity, role) _senderIsTrusteeOrEndorserOrSteward {
        _dids[identity].document = document;
        _dids[identity].metadata.owner = identity;        
        _dids[identity].metadata.created = block.timestamp;
        _dids[identity].metadata.updated = block.timestamp;
        _dids[identity].metadata.documentCID = "";
        _dids[identity].metadata.isActivated = true;
        _dids[identity].metadata.isRevoked = false;

        emit DIDCreated(identity);
    }

    function _updateDid(
        address identity,
        address role, // role is either message sender in case of `updateDid` or signer in case of `updateDidSigner`
        bytes calldata document
    )
        internal
        _didExist(identity)
        _identityOwner(identity, role)
        _senderIsIdentityOwnerOrTrustee(identity)
    {
        _dids[identity].document = document;
        _dids[identity].metadata.updated = block.timestamp;

        emit DIDUpdated(identity);
    }
}
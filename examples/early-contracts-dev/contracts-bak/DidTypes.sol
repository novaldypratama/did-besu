// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

struct DidRecord {
    bytes document;
    DidMetadata metadata;
}

struct DidMetadata {
    uint256 created;
    uint256 updated;
    address owner;
    string documentCID;
    bool isActivated;
    bool isRevoked;
}
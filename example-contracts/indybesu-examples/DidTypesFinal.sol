// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

struct DidRecord {
    bytes record;
    DidDocument document;
    DidMetadata metadata;
}

struct DidDocument {
    address controller;
    string did;
    string documentCID;
    string publicKeyCID;
    string verificationMethodCID;
    bool isActive;
}

struct DidMetadata {
    uint256 created;
    uint256 updated;
    address owner;
    string description;
}
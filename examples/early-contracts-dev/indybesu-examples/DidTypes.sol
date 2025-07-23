// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

struct DidRecord {
  DidDocument document;
  DidMetadata metadata;
  DidServiceEndpoint[] serviceEndpoints;
}

struct DidDocument {
  DidMethod method;
  bytes32 publicKey;
  uint256 expirationTime;
  string did;
  string verificationMethod;
}

struct DidMethod { 
  address controller;
  uint256 expirationTime;
  bool isActive;
}

struct DidMetadata {
  address owner;
  uint256 created;
  uint256 lastUpdated;
  string description;
}

struct DidServiceEndpoint {
  string serviceType;
  string serviceEndpoint;
}

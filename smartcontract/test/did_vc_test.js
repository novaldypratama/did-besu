const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DIDRegistry Contract", function () {
  let didRegistry;
  let owner;

  beforeEach(async function () {
    [owner] = await ethers.getSigners();
    const DIDRegistry = await ethers.getContractFactory("DIDRegistry");
    didRegistry = await DIDRegistry.deploy();
    await didRegistry.deploymentTransaction().wait();
    // await didRegistry.deployed();
  });

  it("should create a new DID", async function () {
    await expect(didRegistry.createDID("did:example:1", "publicKey1"))
      .to.emit(didRegistry, "DIDCreated")
      .withArgs("did:example:1", owner.address);

    const [recordOwner, publicKey, created] = await didRegistry.getDID("did:example:1");
    expect(recordOwner).to.equal(owner.address);
    expect(publicKey).to.equal("publicKey1");
    expect(created).to.be.gt(0);
  });

  it("should not allow duplicate DID creation", async function () {
    await didRegistry.createDID("did:example:1", "publicKey1");
    await expect(didRegistry.createDID("did:example:1", "publicKey2")).to.be.revertedWith("DID already exists");
  });
});

describe("VCRegistry Contract", function () {
  let didRegistry, vcRegistry;
  let owner;

  beforeEach(async function () {
    [owner] = await ethers.getSigners();
    // Deploy DIDRegistry first
    const DIDRegistry = await ethers.getContractFactory("DIDRegistry");
    didRegistry = await DIDRegistry.deploy();
    await didRegistry.deploymentTransaction().wait();

    // Deploy VCRegistry with the address of the deployed DIDRegistry
    const VCRegistry = await ethers.getContractFactory("VCRegistry");
    vcRegistry = await VCRegistry.deploy(didRegistry.target);
    await vcRegistry.deploymentTransaction().wait();
  });

  it("should revert VC attestation if the subject DID is not registered", async function () {
    await expect(vcRegistry.attestCredential("did:example:1", "vc_1", "data"))
      .to.be.revertedWith("Subject DID not registered");
  });

  it("should attest and verify a VC for a registered DID", async function () {
    // First, create a DID
    await didRegistry.createDID("did:example:1", "publicKey1");

    // Attest a credential for the registered DID
    await expect(vcRegistry.attestCredential("did:example:1", "vc_1", "credentialData"))
      .to.emit(vcRegistry, "VCIssued"); // Check for the event emission

    // Verify the credential details
    const [valid, issuer, data, issuedAt] = await vcRegistry.verifyCredential("did:example:1", "vc_1");
    expect(valid).to.equal(true);
    expect(issuer).to.equal(owner.address);
    expect(data).to.equal("credentialData");
    expect(issuedAt).to.be.gt(0);
  });

  it("should prevent duplicate VC attestation", async function () {
    // Create the DID first
    await didRegistry.createDID("did:example:1", "publicKey1");

    // Attest the credential once
    await vcRegistry.attestCredential("did:example:1", "vc_1", "credentialData");

    // Attempt to attest a credential with the same identifier again should revert
    await expect(vcRegistry.attestCredential("did:example:1", "vc_1", "credentialData"))
      .to.be.revertedWith("VC already exists");
  });
});

// test/did_vc_test_with_nonce.js
const { expect } = require("chai");
const { ethers } = require("hardhat");

// Helper function to format gas usage
function formatGas(gas) {
  return `${gas.toLocaleString()} gas`;
}

describe("SSI System Workflow Tests with Nonce Management", function () {
  // Set timeout for long-running tests
  this.timeout(120000);

  let didRegistry;
  let credentialRegistry;
  let deployer;
  let issuer;
  let holder;
  let verifier;
  let otherUser;

  // Test data
  const issuerDid = "did:ssi:issuer:0x1234567890";
  const holderDid = "did:ssi:holder:0x0987654321";
  const credentialIds = Array(10).fill(0).map((_, i) => `credential:${i+1}`);
  let publicKey;
  let serviceEndpoint;
  let credentialHash;
  let schemaId;
  
  // Nonce tracking
  const nonces = {
    issuer: { address: 0, did: 0 },
    holder: { address: 0, did: 0 }
  };
  
  // Gas usage tracking
  const gasUsage = {
    deployment: { didRegistry: 0, credentialRegistry: 0 },
    didOperations: { 
      registerIssuer: 0, 
      registerHolder: 0, 
      updateDid: 0, 
      resolveDid: 0, 
      deactivateDid: 0,
      getNonce: 0 
    },
    credentialOperations: { issue: 0, verify: 0, suspend: 0, activate: 0, revoke: 0, batchIssue: [] },
    queries: { getByIssuer: 0, getByHolder: 0 }
  };

  before(async function () {
    console.log("=== SSI System Performance Test with Nonce Management ===");
    console.log("Preparing test environment...");
    
    // Get test accounts
    const accounts = await ethers.getSigners();
    [deployer, issuer, holder, verifier, otherUser] = accounts;
    
    console.log(`Deployer: ${deployer.address}`);
    console.log(`Issuer: ${issuer.address}`);
    console.log(`Holder: ${holder.address}`);
    console.log(`Verifier: ${verifier.address}`);
    
    // Prepare test data as strings
    publicKey = "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQD3FHQyx8jV5QuSs5eQCj7hCNtEGHatxGqK0iy9JhZWINfC";
    serviceEndpoint = "https://example.com/endpoint";
    credentialHash = ethers.keccak256(ethers.toUtf8Bytes("credential content data")); 
    schemaId = ethers.keccak256(ethers.toUtf8Bytes("https://schema.org/CredentialSchema"));
    
    try {
      // Deploy DIDRegistry
      console.log("Deploying DIDRegistry contract with nonce management...");
      const DIDRegistry = await ethers.getContractFactory("DIDRegistry");
      didRegistry = await DIDRegistry.deploy();
      await didRegistry.waitForDeployment();
      
      // Get deployment transaction receipt for gas measurement
      const deployTx = didRegistry.deploymentTransaction();
      if (deployTx) {
        const receipt = await deployTx.wait();
        gasUsage.deployment.didRegistry = Number(receipt.gasUsed);
      }
      
      console.log(`DIDRegistry deployed at: ${await didRegistry.getAddress()} (${formatGas(gasUsage.deployment.didRegistry)})`);
      
      // Deploy CredentialRegistry
      console.log("Deploying CredentialRegistry contract...");
      const CredentialRegistry = await ethers.getContractFactory("CredentialRegistry");
      credentialRegistry = await CredentialRegistry.deploy(await didRegistry.getAddress());
      await credentialRegistry.waitForDeployment();
      
      // Get deployment transaction receipt for gas measurement
      const crDeployTx = credentialRegistry.deploymentTransaction();
      if (crDeployTx) {
        const receipt = await crDeployTx.wait();
        gasUsage.deployment.credentialRegistry = Number(receipt.gasUsed);
      }
      
      console.log(`CredentialRegistry deployed at: ${await credentialRegistry.getAddress()} (${formatGas(gasUsage.deployment.credentialRegistry)})`);
    } catch (error) {
      console.error("Deployment error:", error);
      throw error;
    }
  });

  describe("1. DID Registration & Management with Nonce Tracking", function () {
    it("Should retrieve initial nonces for issuer and holder", async function () {
      console.log("\nChecking initial nonces...");
      
      // Get initial nonces for issuer and holder
      nonces.issuer.address = await didRegistry.getAddressNonce(issuer.address);
      nonces.holder.address = await didRegistry.getAddressNonce(holder.address);
      
      console.log(`Initial issuer address nonce: ${nonces.issuer.address}`);
      console.log(`Initial holder address nonce: ${nonces.holder.address}`);
      
      expect(nonces.issuer.address).to.equal(0);
      expect(nonces.holder.address).to.equal(0);
    });
    
    it("Should register Issuer DID with nonce and measure gas usage", async function () {
      console.log("\nRegistering Issuer DID with nonce...");
      const tx = await didRegistry.connect(issuer).registerDID(
        issuerDid,
        publicKey,
        serviceEndpoint,
        1, // Role.ISSUER
        nonces.issuer.address // Expected nonce
      );
      
      const receipt = await tx.wait();
      gasUsage.didOperations.registerIssuer = Number(receipt.gasUsed);
      console.log(`Issuer DID Registration: ${formatGas(gasUsage.didOperations.registerIssuer)}`);
      
      // Update the issuer's address nonce
      nonces.issuer.address++;
      
      expect(await didRegistry.isDIDOwnedBy(issuerDid, issuer.address)).to.be.true;
      
      // Check issuer's address nonce was incremented
      const currentIssuerNonce = await didRegistry.getAddressNonce(issuer.address);
      expect(currentIssuerNonce).to.equal(nonces.issuer.address);
      
      // Check issuer's DID nonce is 0 (initial value)
      nonces.issuer.did = await didRegistry.getDIDNonce(issuerDid);
      expect(nonces.issuer.did).to.equal(0);
    });

    it("Should register Holder DID with nonce and measure gas usage", async function () {
      console.log("\nRegistering Holder DID with nonce...");
      const tx = await didRegistry.connect(holder).registerDID(
        holderDid,
        publicKey,
        serviceEndpoint,
        2, // Role.HOLDER
        nonces.holder.address // Expected nonce
      );
      
      const receipt = await tx.wait();
      gasUsage.didOperations.registerHolder = Number(receipt.gasUsed);
      console.log(`Holder DID Registration: ${formatGas(gasUsage.didOperations.registerHolder)}`);
      
      // Update the holder's address nonce
      nonces.holder.address++;
      
      expect(await didRegistry.isDIDOwnedBy(holderDid, holder.address)).to.be.true;
      expect(await didRegistry.isDIDActive(holderDid)).to.be.true;
      
      // Check holder's address nonce was incremented
      const currentHolderNonce = await didRegistry.getAddressNonce(holder.address);
      expect(currentHolderNonce).to.equal(nonces.holder.address);
      
      // Check holder's DID nonce is 0 (initial value)
      nonces.holder.did = await didRegistry.getDIDNonce(holderDid);
      expect(nonces.holder.did).to.equal(0);
    });
    
    it("Should resolve DIDs with nonce and measure gas usage", async function() {
      console.log("\nResolving DIDs with nonce information...");
      
      // DID resolution is a view function, so we estimate gas
      const gasEstimate = await didRegistry.resolveDID.estimateGas(issuerDid);
      gasUsage.didOperations.resolveDid = Number(gasEstimate);
      console.log(`DID Resolution: ${formatGas(gasUsage.didOperations.resolveDid)}`);
      
      const result = await didRegistry.resolveDID(issuerDid);
      const [owner, resolvedPublicKey, resolvedEndpoint, created, updated, active, role, nonce] = result;
        
      expect(owner).to.equal(issuer.address);
      expect(active).to.be.true;
      expect(role).to.equal(1); // ISSUER
      expect(nonce).to.equal(0); // Initial nonce
    });
    
    it("Should update DID with nonce and measure gas usage", async function() {
      console.log("\nUpdating DID with nonce...");
      const newPublicKey = "ssh-rsa NEWKEYNEWKEYNEWKEYNEWKEYNEWKEYNEWKEY";
      const newEndpoint = "https://updated.example.com/endpoint";
      
      const tx = await didRegistry.connect(issuer).updateDID(
        issuerDid,
        newPublicKey,
        newEndpoint,
        nonces.issuer.did // Current DID nonce
      );
      
      const receipt = await tx.wait();
      gasUsage.didOperations.updateDid = Number(receipt.gasUsed);
      console.log(`DID Update: ${formatGas(gasUsage.didOperations.updateDid)}`);
      
      // Increment the DID nonce locally
      nonces.issuer.did++;
      
      // Check that the DID nonce was incremented
      const currentDIDNonce = await didRegistry.getDIDNonce(issuerDid);
      expect(currentDIDNonce).to.equal(nonces.issuer.did);
      
      const result = await didRegistry.resolveDID(issuerDid);
      const [owner, resolvedPublicKey, resolvedEndpoint, created, updated, active, role, nonce] = result;
      
      // Verify the update
      expect(resolvedPublicKey).to.equal(newPublicKey);
      expect(resolvedEndpoint).to.equal(newEndpoint);
      expect(nonce).to.equal(nonces.issuer.did);
    });
    
    it("Should measure gas usage for nonce retrieval", async function() {
      console.log("\nMeasuring nonce retrieval gas usage...");
      
      // Get gas estimate for address nonce retrieval
      const addressNonceGasEstimate = await didRegistry.getAddressNonce.estimateGas(issuer.address);
      
      // Get gas estimate for DID nonce retrieval
      const didNonceGasEstimate = await didRegistry.getDIDNonce.estimateGas(issuerDid);
      
      // Use the higher of the two for reporting
      gasUsage.didOperations.getNonce = Math.max(
        Number(addressNonceGasEstimate), 
        Number(didNonceGasEstimate)
      );
      
      console.log(`Nonce Retrieval: ${formatGas(gasUsage.didOperations.getNonce)}`);
    });
  });

  describe("2. Nonce-based Security Tests", function() {
    it("Should fail to register a DID with incorrect nonce", async function() {
      console.log("\nTesting nonce security for DID registration...");
      const incorrectNonce = nonces.issuer.address + 1; // Use an incorrect nonce
      
      await expect(
        didRegistry.connect(issuer).registerDID(
          "did:ssi:new:issuer",
          publicKey,
          serviceEndpoint,
          1, // ISSUER
          incorrectNonce // Wrong nonce
        )
      ).to.be.revertedWith("Invalid nonce");
      
      console.log("Registration with incorrect nonce properly reverted");
    });
    
    it("Should fail to update a DID with incorrect nonce", async function() {
      console.log("\nTesting nonce security for DID update...");
      const incorrectNonce = nonces.issuer.did + 1; // Use an incorrect nonce
      
      await expect(
        didRegistry.connect(issuer).updateDID(
          issuerDid,
          "ssh-rsa ANOTHERNEWKEYANOTHERNEWKEY",
          "https://another-update.example.com/endpoint",
          incorrectNonce // Wrong nonce
        )
      ).to.be.revertedWith("Invalid DID nonce");
      
      console.log("Update with incorrect nonce properly reverted");
    });
    
    it("Should handle sequential updates with correct nonces", async function() {
      console.log("\nTesting sequential updates with correct nonces...");
      
      // First update
      await didRegistry.connect(issuer).updateDID(
        issuerDid,
        "ssh-rsa UPDATE1UPDATE1UPDATE1",
        "https://update1.example.com/endpoint",
        nonces.issuer.did // Current nonce
      );
      nonces.issuer.did++; // Increment locally after update
      
      // Second update
      await didRegistry.connect(issuer).updateDID(
        issuerDid,
        "ssh-rsa UPDATE2UPDATE2UPDATE2",
        "https://update2.example.com/endpoint",
        nonces.issuer.did // Current nonce after first update
      );
      nonces.issuer.did++; // Increment locally after update
      
      // Verify final state and nonce
      const result = await didRegistry.resolveDID(issuerDid);
      const [owner, resolvedPublicKey, resolvedEndpoint, created, updated, active, role, nonce] = result;
      
      expect(resolvedPublicKey).to.equal("ssh-rsa UPDATE2UPDATE2UPDATE2");
      expect(resolvedEndpoint).to.equal("https://update2.example.com/endpoint");
      expect(nonce).to.equal(nonces.issuer.did);
      
      console.log(`Sequential updates successful, final DID nonce: ${nonce}`);
    });
  });

  describe("3. Credential Issuance & Verification", function () {
    it("Should issue a credential and measure gas usage", async function () {
      console.log("\nIssuing Credential...");
      // Set expiration to 1 year from now
      const expirationDate = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;
      
      const tx = await credentialRegistry.connect(issuer).issueCredential(
        credentialIds[0],
        issuerDid,
        holderDid,
        credentialHash,
        schemaId,
        expirationDate
      );
      
      const receipt = await tx.wait();
      gasUsage.credentialOperations.issue = Number(receipt.gasUsed);
      console.log(`Credential Issuance: ${formatGas(gasUsage.credentialOperations.issue)}`);
      
      // Get the credential to verify it exists
      const result = await credentialRegistry.getCredential(credentialIds[0]);
      const [retrievedIssuerDid, retrievedHolderDid, retrievedHash, retrievedSchemaId, 
        issuanceDate, retrievedExpiration, status] = result;
      
      expect(retrievedIssuerDid).to.equal(issuerDid);
      expect(retrievedHolderDid).to.equal(holderDid);
      expect(retrievedHash).to.equal(credentialHash);
    });
    
    it("Should verify a credential and measure gas usage", async function() {
      console.log("\nVerifying Credential...");
      // Verify is a view function, so we estimate gas
      const gasEstimate = await credentialRegistry.verifyCredential.estimateGas(
        credentialIds[0],
        issuerDid,
        holderDid
      );
      
      gasUsage.credentialOperations.verify = Number(gasEstimate);
      console.log(`Credential Verification: ${formatGas(gasUsage.credentialOperations.verify)}`);
      
      const result = await credentialRegistry.verifyCredential(
        credentialIds[0],
        issuerDid,
        holderDid
      );
      
      // Log detailed information for debugging
      console.log("Verification result:", result);
      console.log("Valid:", result[0]);
      console.log("Reason code:", result[1]);
      
      expect(result[0]).to.be.true;
      expect(Number(result[1])).to.equal(0); // VerificationResult.VALID
    });
  });

  describe("4. Deactivation with Nonce Management", function() {
    it("Should deactivate a DID with nonce", async function() {
      console.log("\nDeactivating DID with nonce...");
      
      // First check current nonce of the holder DID
      const holderDIDNonce = await didRegistry.getDIDNonce(holderDid);
      expect(holderDIDNonce).to.equal(nonces.holder.did);
      
      // Deactivate the holder DID
      const tx = await didRegistry.connect(holder).deactivateDID(
        holderDid,
        nonces.holder.did // Current DID nonce
      );
      
      const receipt = await tx.wait();
      gasUsage.didOperations.deactivateDid = Number(receipt.gasUsed);
      console.log(`DID Deactivation: ${formatGas(gasUsage.didOperations.deactivateDid)}`);
      
      // Increment the DID nonce locally
      nonces.holder.did++;
      
      // Verify the DID is deactivated
      expect(await didRegistry.isDIDActive(holderDid)).to.be.false;
      
      // Verify the nonce was incremented
      const newHolderDIDNonce = await didRegistry.getDIDNonce(holderDid);
      expect(newHolderDIDNonce).to.equal(nonces.holder.did);
      
      console.log(`DID deactivated, new nonce: ${newHolderDIDNonce}`);
    });
    
    it("Should fail to update a deactivated DID even with correct nonce", async function() {
      console.log("\nTesting update on deactivated DID...");
      
      await expect(
        didRegistry.connect(holder).updateDID(
          holderDid,
          "ssh-rsa DEACTIVATEDKEYUPDATE",
          "https://deactivated.example.com/endpoint",
          nonces.holder.did // Correct nonce
        )
      ).to.be.revertedWith("DID is not active");
      
      console.log("Update on deactivated DID properly reverted");
    });
  });
  
  describe("5. System Performance Summary", function() {
    it("Should compile and display full gas usage statistics", async function() {
      console.log("\n=== SSI System Performance Summary with Nonce Management ===");
      console.log("\nDeployment Costs:");
      console.log(`- DIDRegistry: ${formatGas(gasUsage.deployment.didRegistry)}`);
      console.log(`- CredentialRegistry: ${formatGas(gasUsage.deployment.credentialRegistry)}`);
      console.log(`- Total Deployment: ${formatGas(gasUsage.deployment.didRegistry + gasUsage.deployment.credentialRegistry)}`);
      
      console.log("\nDID Operations with Nonce Management:");
      console.log(`- Register Issuer DID: ${formatGas(gasUsage.didOperations.registerIssuer)}`);
      console.log(`- Register Holder DID: ${formatGas(gasUsage.didOperations.registerHolder)}`);
      console.log(`- Update DID: ${formatGas(gasUsage.didOperations.updateDid)}`);
      console.log(`- Deactivate DID: ${formatGas(gasUsage.didOperations.deactivateDid)}`);
      console.log(`- Resolve DID: ${formatGas(gasUsage.didOperations.resolveDid)}`);
      console.log(`- Get Nonce: ${formatGas(gasUsage.didOperations.getNonce)}`);
      
      console.log("\nCredential Operations:");
      console.log(`- Issue Credential: ${formatGas(gasUsage.credentialOperations.issue)}`);
      console.log(`- Verify Credential: ${formatGas(gasUsage.credentialOperations.verify)}`);
      
      console.log("\n=== Nonce Management Impact Analysis ===");
      console.log("The impact of adding nonce management to the DID Registry:");
      
      // Sort operations by gas cost to find most expensive
      const operations = [
        { name: "Register Issuer DID (with nonce)", gas: gasUsage.didOperations.registerIssuer },
        { name: "Register Holder DID (with nonce)", gas: gasUsage.didOperations.registerHolder },
        { name: "Update DID (with nonce)", gas: gasUsage.didOperations.updateDid },
        { name: "Deactivate DID (with nonce)", gas: gasUsage.didOperations.deactivateDid },
        { name: "Get Nonce", gas: gasUsage.didOperations.getNonce }
      ].sort((a, b) => b.gas - a.gas);
      
      operations.forEach((op, i) => {
        console.log(`${i+1}. ${op.name}: ${formatGas(op.gas)}`);
      });
      
      console.log("\nKey Benefits of Nonce Management:");
      console.log("1. Protection against replay attacks");
      console.log("2. Enforced transaction ordering for each DID");
      console.log("3. Enhanced security for critical identity operations");
      console.log("4. Support for off-chain message signing with nonce validation");
    });
  });
});
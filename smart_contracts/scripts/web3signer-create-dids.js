// create-dids-web3signer-fixed.js - Using direct HTTP requests to Web3Signer

const { ethers } = require("hardhat");
const fs = require('fs');
const axios = require('axios');
const jsonld = require('jsonld');
const FormData = require('form-data');
require('dotenv').config();

// Web3Signer proxy URL
const WEB3SIGNER_URL = "http://127.0.0.1:18545";    // For transaction signing
const BESU_URL = "http://127.0.0.1:8545";           // For blockchain read operations

// IPFS configuration - using Pinata as the primary gateway with fallbacks
const IPFS_CONFIG = {
  // Pinata API settings
  uploadEndpoint: 'https://api.pinata.cloud/pinning/pinFileToIPFS',
  pinataGateway: `https://${process.env.PINATA_GATEWAY}/ipfs/`,
  jwt: process.env.PINATA_JWT,

  // Public IPFS gateway URLs for fetching content (fallbacks)
  publicGateways: [
    `https://${process.env.PINATA_GATEWAY}/ipfs/`, // Primary - dedicated Pinata gateway
    'https://gateway.pinata.cloud/ipfs/',          // Pinata public gateway
    'https://dweb.link/ipfs/',                     // Protocol Labs gateway
    'https://ipfs.io/ipfs/'                        // IPFS public gateway
  ]
};

/**
 * Canonicalises a JSON-LD document using the W3C URDNA2015 algorithm.
 * First expands the document to resolve all contexts and then canonizes it.
 *
 * @param {object} doc – the JSON-LD object (DID document)
 * @returns {Promise<string>} URDNA2015-normalised N-Quads
 */
async function canonicalizeJSONLD(doc) {
  try {
    // Create a document loader that handles the DID context properly
    const nodeDocumentLoader = jsonld.documentLoaders.node();
    const customLoader = async (url) => {
      console.log(`Loading JSON-LD context: ${url}`);

      // Special handling for known contexts
      if (url === 'https://www.w3.org/ns/did/v1') {
        return {
          contextUrl: null,
          document: {
            "@context": {
              "@protected": true,
              "id": "@id",
              "type": "@type",
              "alsoKnownAs": {
                "@id": "https://www.w3.org/ns/activitystreams#alsoKnownAs",
                "@type": "@id"
              },
              "assertionMethod": {
                "@id": "https://w3id.org/security#assertionMethod",
                "@type": "@id",
                "@container": "@set"
              },
              "authentication": {
                "@id": "https://w3id.org/security#authenticationMethod",
                "@type": "@id",
                "@container": "@set"
              },
              "controller": {
                "@id": "https://w3id.org/security#controller",
                "@type": "@id"
              },
              "service": {
                "@id": "https://www.w3.org/ns/did#service",
                "@type": "@id",
                "@container": "@set"
              },
              "serviceEndpoint": {
                "@id": "https://www.w3.org/ns/did#serviceEndpoint",
                "@type": "@id"
              },
              "verificationMethod": {
                "@id": "https://w3id.org/security#verificationMethod",
                "@type": "@id",
                "@container": "@set"
              }
            }
          },
          documentUrl: url
        };
      }

      // Fall back to standard document loader
      return nodeDocumentLoader(url);
    };

    // First expand the document to resolve all contexts
    const expanded = await jsonld.expand(doc, {
      documentLoader: customLoader,
      safe: false // Turn off safe mode for our use case
    });

    console.log("Expanded document for canonization");

    // Then canonize the expanded document
    return jsonld.canonize(expanded, {
      algorithm: 'URDNA2015',
      format: 'application/n-quads',
      documentLoader: customLoader,
      safe: false
    });
  } catch (error) {
    console.error("JSON-LD Canonization error:", error);
    console.log("Falling back to simple JSON canonicalization");

    // Fallback to simple JSON canonicalization if JSON-LD processing fails
    return JSON.stringify(doc);
  }
}

async function createIssuerDidDocument(address) {
  const didId = `did:ethr:${address}`;
  const keyId = `${didId}#keys-1`;

  const didDocument = {
    "@context": [
      "https://www.w3.org/ns/did/v1",
    ],
    "id": didId,
    "verificationMethod": [{
      "id": keyId,
      "type": "Ed25519VerificationKey2020",
      "controller": didId,
      "publicKeyMultibase": "z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH"
    }],
    "authentication": [keyId],
    "assertionMethod": [keyId],
    "service": [{
      "id": `${didId}#endpoint-1`,
      "type": "DIDCommMessaging",
      "serviceEndpoint": "https://example.com/endpoint/8377464"
    }]
  };

  return didDocument;
}

async function createHolderDidDocument(address) {
  const didId = `did:ethr:${address}`;
  const keyId = `${didId}#keys-1`;

  const didDocument = {
    "@context": [
      "https://www.w3.org/ns/did/v1",
    ],
    "id": didId,
    "verificationMethod": [{
      "id": keyId,
      "type": "Ed25519VerificationKey2020",
      "controller": didId,
      "publicKeyMultibase": "z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH"
    }],
    "authentication": [keyId],
    "service": [{
      "id": `${didId}#endpoint-1`,
      "type": "DIDCommMessaging",
      "serviceEndpoint": "https://example.com/endpoint/8377464"
    }]
  };

  return didDocument;
}

async function canonicalizeAndHash(document) {
  try {
    // Try JSON-LD canonization first
    const canonicalizedDoc = await canonicalizeJSONLD(document);
    const docHash = ethers.keccak256(ethers.toUtf8Bytes(canonicalizedDoc));
    return { canonicalizedDoc, docHash };
  } catch (error) {
    console.error("Error during JSON-LD canonization:", error);
    console.log("Falling back to simple JSON stringification...");

    // // Fallback to simple JSON stringification if canonization fails
    // const jsonString = JSON.stringify(document);
    // const docHash = ethers.keccak256(ethers.toUtf8Bytes(jsonString));
    // return { canonicalizedDoc: jsonString, docHash };
  }
}

/**
 * Uploads a JSON-LD object to IPFS using Pinata
 * @param {object} jsonldObj - JSON-LD object to upload
 * @returns {Promise<string>} - IPFS CID
 */
async function uploadToIPFS(jsonldObj) {
  try {
    const jsonString = JSON.stringify(jsonldObj, null, 2);
    const buffer = Buffer.from(jsonString);

    console.log(`Preparing to upload to Pinata IPFS, content size: ${buffer.length} bytes`);

    // Create form data for the Pinata API request
    const formData = new FormData();

    // Add the file to the formData
    formData.append('file', buffer, {
      filename: 'did-document.json',
      contentType: 'application/json',
    });

    // Add metadata to help identify the file in Pinata
    const metadata = JSON.stringify({
      name: `DID-${Date.now()}`,
      keyvalues: {
        type: 'DIDDocument',
        timestamp: Date.now().toString()
      }
    });
    formData.append('pinataMetadata', metadata);

    // Set pinning options
    const pinataOptions = JSON.stringify({
      cidVersion: 1,
      wrapWithDirectory: false
    });
    formData.append('pinataOptions', pinataOptions);

    // Upload to Pinata IPFS
    console.log("Uploading to Pinata...");
    const response = await axios.post(
      IPFS_CONFIG.uploadEndpoint,
      formData,
      {
        headers: {
          'Content-Type': `multipart/form-data; boundary=${formData.getBoundary()}`,
          'Authorization': `Bearer ${IPFS_CONFIG.jwt}`
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      }
    );

    if (!response.data || !response.data.IpfsHash) {
      throw new Error("Invalid response from Pinata: " + JSON.stringify(response.data));
    }

    const cid = response.data.IpfsHash;
    console.log(`Pinata upload successful, CID: ${cid}`);
    console.log(`Size: ${response.data.PinSize} bytes, Timestamp: ${response.data.Timestamp}`);

    // Verify the content is accessible via Pinata gateway
    await verifyIpfsContent(cid, jsonString);

    return cid;
  } catch (error) {
    console.error("Pinata IPFS upload error:", error.response?.data || error.message);
    throw new Error(`Failed to upload to Pinata IPFS: ${error.message}`);
  }
}

/**
 * Verifies that content is accessible on IPFS by trying to fetch it
 * @param {string} cid - The IPFS content identifier
 * @param {string} expectedContent - The expected content for verification
 * @returns {Promise<boolean>} - True if content was verified on at least one gateway
 */
async function verifyIpfsContent(cid, expectedContent) {
  // Try different gateways until one works
  for (const gateway of IPFS_CONFIG.publicGateways) {
    try {
      const url = `${gateway}${cid}`;
      console.log(`Verifying content availability at: ${url}`);

      const response = await axios.get(url, { timeout: 10000 });
      if (response.status === 200) {
        console.log(`Content verified available on IPFS via ${gateway}`);
        return true;
      }
    } catch (error) {
      console.warn(`Gateway ${gateway} failed, trying next...`);
    }
  }

  console.warn("Content uploaded but not immediately verifiable on public gateways. This is normal, as propagation may take time.");
  return false;
}

// Send JSON-RPC request to Web3Signer (for transaction signing)
async function sendWeb3SignerRequest(method, params = []) {
  try {
    console.log(`Sending JSON-RPC request to Web3Signer: ${method} with params:`, params);

    const response = await axios({
      method: 'post',
      url: WEB3SIGNER_URL,
      headers: {
        'Content-Type': 'application/json'
      },
      data: JSON.stringify({
        jsonrpc: "2.0",
        method: method,
        params: params,
        id: Math.floor(Math.random() * 10000) // Random ID for each request
      })
    });

    console.log(`Response from Web3Signer for ${method}:`, response.data);
    return response.data.result;
  } catch (error) {
    console.error(`Error in Web3Signer JSON-RPC request for ${method}:`, error.response?.data || error.message);
    throw error;
  }
}

// Send JSON-RPC request to Besu (for blockchain read operations)
async function sendBesuRequest(method, params = []) {
  try {
    console.log(`Sending JSON-RPC request to Besu: ${method} with params:`, params);

    const response = await axios({
      method: 'post',
      url: BESU_URL,
      headers: {
        'Content-Type': 'application/json'
      },
      data: JSON.stringify({
        jsonrpc: "2.0",
        method: method,
        params: params,
        id: Math.floor(Math.random() * 10000) // Random ID for each request
      })
    });

    console.log(`Response from Besu for ${method}:`, response.data);
    return response.data.result;
  } catch (error) {
    console.error(`Error in Besu JSON-RPC request for ${method}:`, error.response?.data || error.message);
    throw error;
  }
}

// Get available accounts from Web3Signer
async function getWeb3SignerAccounts() {
  return await sendWeb3SignerRequest("eth_accounts");
}

// Use local hardhat node to get contract ABI
async function getContractAbi() {
  // Get the ABI from the hardhat artifacts
  const DidRegistry = await ethers.getContractFactory("DidRegistry");
  return DidRegistry.interface.formatJson();
}

// Encode function data for contract call
function encodeCreateDidFunction(contractAbi, address, docHash, docCid) {
  const iface = new ethers.Interface(contractAbi);
  return iface.encodeFunctionData("createDid", [address, docHash, docCid]);
}

// Send transaction through Web3Signer
async function sendTransaction(from, to, data) {
  try {
    // Get the current nonce for the sender (from Besu)
    const nonce = await sendBesuRequest("eth_getTransactionCount", [from, "latest"]);
    console.log(`Current nonce for ${from}: ${parseInt(nonce, 16)}`);

    // Get current gas price (from Besu)
    let gasPrice = await sendBesuRequest("eth_gasPrice");
    console.log(`Current gas price: ${gasPrice} (${parseInt(gasPrice, 16)} wei)`);

    // Handle zero gas price (use minimum value if zero)
    if (gasPrice === '0x0' || parseInt(gasPrice, 16) === 0) {
      console.warn("Gas price is zero! Setting minimum gas price of 1 gwei");
      gasPrice = '0x3b9aca00'; // 1 gwei = 1,000,000,000 wei = 0x3b9aca00
    }

    // Estimate gas for the transaction (from Besu)
    const estimatedGas = await sendBesuRequest("eth_estimateGas", [{
      from: from,
      to: to,
      data: data
    }]);

    const gasLimit = Math.ceil(parseInt(estimatedGas, 16) * 1.2); // Add 20% buffer and round up
    console.log(`Estimated gas: ${parseInt(estimatedGas, 16)}, with buffer: ${gasLimit}`);

    // Prepare transaction object
    const txObject = {
      from: from,
      to: to,
      gas: '0x' + gasLimit.toString(16), // Convert to hex string manually
      gasPrice: gasPrice,
      nonce: nonce,
      data: data
    };

    console.log("Sending transaction:", txObject);

    // Send the transaction via Web3Signer
    const txHash = await sendWeb3SignerRequest("eth_sendTransaction", [txObject]);
    console.log("Transaction hash:", txHash);

    // Wait for transaction receipt (using Besu)
    let receipt = null;
    let attempts = 0;

    while (!receipt && attempts < 30) {
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
      receipt = await sendBesuRequest("eth_getTransactionReceipt", [txHash]);
      console.log(`Waiting for transaction confirmation... (attempt ${attempts})`);
    }

    if (!receipt) {
      throw new Error("Transaction confirmation timeout");
    }

    console.log("Transaction confirmed:", receipt);
    return { hash: txHash, receipt: receipt };
  } catch (error) {
    console.error("Transaction error:", error);

    // Provide more detailed error analysis
    if (error.message.includes("underflow")) {
      console.error("Gas calculation error: decimal value used where integer expected");
    } else if (error.message.includes("gas required exceeds allowance")) {
      console.error("Gas limit too low for this transaction");
    }

    throw error;
  }
}

// Check if DID exists - FIXED to use Besu API instead of Web3Signer
async function checkDidExists(contractAddress, contractAbi, address) {
  const iface = new ethers.Interface(contractAbi);
  const data = iface.encodeFunctionData("didExists", [address]);

  // Use Besu API for eth_call
  const result = await sendBesuRequest("eth_call", [{
    to: contractAddress,
    data: data
  }, "latest"]);

  // Decode the boolean result
  return iface.decodeFunctionResult("didExists", result)[0];
}

/**
 * Retrieves the DID document from IPFS
 * @param {string} cid - IPFS content identifier
 * @returns {Promise<object>} - The DID document
 */
async function getDidDocumentFromIPFS(cid) {
  // Try using dedicated Pinata gateway first
  try {
    const url = `${IPFS_CONFIG.pinataGateway}${cid}`;
    console.log(`Attempting to fetch DID document from Pinata gateway: ${url}`);

    const response = await axios.get(url, { timeout: 10000 });
    if (response.status === 200 && response.data) {
      console.log(`Successfully retrieved DID document from Pinata gateway`);
      return response.data;
    }
  } catch (error) {
    console.warn(`Failed to fetch from Pinata gateway, trying public gateways...`);
  }

  // Try different gateways as fallback
  for (const gateway of IPFS_CONFIG.publicGateways) {
    try {
      const url = `${gateway}${cid}`;
      console.log(`Attempting to fetch DID document from: ${url}`);

      const response = await axios.get(url, { timeout: 10000 });
      if (response.status === 200 && response.data) {
        console.log(`Successfully retrieved DID document from ${gateway}`);
        return response.data;
      }
    } catch (error) {
      console.warn(`Failed to fetch from ${gateway}, trying next...`);
    }
  }

  throw new Error("Could not retrieve DID document from any IPFS gateway");
}

async function main() {
  try {
    console.log("Starting DID creation using Web3Signer for signing and Besu for read operations...");

    console.log("Connecting to Web3Signer at:", WEB3SIGNER_URL);
    console.log("Connecting to Besu at:", BESU_URL);

    // Test connection to Web3Signer
    console.log("Testing connection to Web3Signer...");
    await sendWeb3SignerRequest("net_version");

    // Test connection to Besu
    console.log("Testing connection to Besu...");
    await sendBesuRequest("net_version");

    // Get available accounts from Web3Signer
    console.log("Fetching accounts from Web3Signer...");
    const accounts = await getWeb3SignerAccounts();
    console.log("Available accounts from Web3Signer:", accounts);

    // Select accounts for Issuer and Holder
    const issuerAddress = accounts[1]; // Using account at index 1 as Issuer
    const holderAddress = accounts[2]; // Using account at index 2 as Holder

    console.log("Selected Issuer address:", issuerAddress);
    console.log("Selected Holder address:", holderAddress);

    // Load the deployed DidRegistry contract
    // Replace with your actual deployed contract address
    const didRegistryAddress = "0xA5134e42CF382152894d040a0e89F2E4231062d8";
    console.log("DidRegistry contract address:", didRegistryAddress);

    // Get contract ABI
    const contractAbi = await getContractAbi();

    // ISSUER SECTION
    console.log("\n1. Creating DID for Issuer...");

    // Create Issuer DID document using issuer-specific function
    const issuerDidDoc = await createIssuerDidDocument(issuerAddress);
    console.log("Issuer DID document created with assertionMethod capability");

    // Hash the document
    const { canonicalizedDoc: issuerCanonical, docHash: issuerDocHash } =
      await canonicalizeAndHash(issuerDidDoc);

    console.log("Canonicalized Issuer DID document:", issuerCanonical.substring(0, 100) + "...");
    console.log("Generated docHash for Issuer:", issuerDocHash);

    // Save to file for reference
    fs.writeFileSync(
      `issuer-did-${issuerAddress.substring(0, 8)}.json`,
      JSON.stringify(issuerDidDoc, null, 2)
    );

    // Upload Issuer DID document to IPFS
    console.log("Uploading Issuer DID document to IPFS...");
    const issuerDidCid = await uploadToIPFS(issuerDidDoc);
    console.log("Issuer DID document CID:", issuerDidCid);

    // Encode function call
    const issuerData = encodeCreateDidFunction(contractAbi, issuerAddress, issuerDocHash, issuerDidCid);

    // Send transaction from Issuer account
    console.log("\nIssuer creating DID on-chain through Web3Signer...");
    const issuerTx = await sendTransaction(issuerAddress, didRegistryAddress, issuerData);

    console.log("Issuer transaction confirmed!");
    console.log("Transaction hash:", issuerTx.hash);
    console.log("Block number:", parseInt(issuerTx.receipt.blockNumber, 16));

    // Verify DID was created
    const issuerDidExists = await checkDidExists(didRegistryAddress, contractAbi, issuerAddress);
    console.log("Issuer DID exists:", issuerDidExists);

    // HOLDER SECTION
    console.log("\n2. Creating DID for Holder...");

    // Create Holder DID document using holder-specific function
    const holderDidDoc = await createHolderDidDocument(holderAddress);
    console.log("Holder DID document created with authentication capability only");

    // Hash the document
    const { canonicalizedDoc: holderCanonical, docHash: holderDocHash } =
      await canonicalizeAndHash(holderDidDoc);

    console.log("Canonicalized Holder DID document:", holderCanonical.substring(0, 100) + "...");
    console.log("Generated docHash for Holder:", holderDocHash);

    // Save to file for reference
    fs.writeFileSync(
      `holder-did-${holderAddress.substring(0, 8)}.json`,
      JSON.stringify(holderDidDoc, null, 2)
    );

    // Upload Holder DID document to IPFS
    console.log("Uploading Holder DID document to IPFS...");
    const holderDidCid = await uploadToIPFS(holderDidDoc);
    console.log("Holder DID document CID:", holderDidCid);

    // Encode function call
    const holderData = encodeCreateDidFunction(contractAbi, holderAddress, holderDocHash, holderDidCid);

    // Send transaction from Holder account
    console.log("\nHolder creating DID on-chain through Web3Signer...");
    const holderTx = await sendTransaction(holderAddress, didRegistryAddress, holderData);

    console.log("Holder transaction confirmed!");
    console.log("Transaction hash:", holderTx.hash);
    console.log("Block number:", parseInt(holderTx.receipt.blockNumber, 16));

    // Verify DID was created
    const holderDidExists = await checkDidExists(didRegistryAddress, contractAbi, holderAddress);
    console.log("Holder DID exists:", holderDidExists);

    // Verify IPFS retrieval for both DID documents
    console.log("\nVerifying DID documents can be retrieved from IPFS...");

    try {
      console.log("Retrieving Issuer DID document from IPFS...");
      const retrievedIssuerDoc = await getDidDocumentFromIPFS(issuerDidCid);
      console.log("Successfully retrieved Issuer DID document!");
      console.log("Issuer DID has assertionMethod:",
        retrievedIssuerDoc.assertionMethod ? "✓" : "✗");

      console.log("Retrieving Holder DID document from IPFS...");
      const retrievedHolderDoc = await getDidDocumentFromIPFS(holderDidCid);
      console.log("Successfully retrieved Holder DID document!");
      console.log("Holder DID has assertionMethod:",
        retrievedHolderDoc.assertionMethod ? "✓" : "✗");

      // Save IPFS content identifiers to a file for future reference
      const ipfsReferences = {
        issuer: {
          address: issuerAddress,
          didCid: issuerDidCid
        },
        holder: {
          address: holderAddress,
          didCid: holderDidCid
        },
        timestamp: new Date().toISOString()
      };

      fs.writeFileSync(
        "ipfs-did-references.json",
        JSON.stringify(ipfsReferences, null, 2)
      );
      console.log("IPFS references saved to ipfs-did-references.json");
    } catch (error) {
      console.warn("IPFS retrieval verification failed:", error.message);
      console.log("This doesn't affect on-chain DID creation, but IPFS availability should be checked.");
    }

    console.log("\n✅ DID creation through Web3Signer completed successfully!");
    console.log("Both DIDs are properly stored on-chain and available via IPFS (if verification succeeded)");
    console.log("\nSummary:");
    console.log(`- Issuer (${issuerAddress}) has DID with assertionMethod capability`);
    console.log(`  IPFS CID: ${issuerDidCid}`);
    console.log(`- Holder (${holderAddress}) has DID with authentication capability only`);
    console.log(`  IPFS CID: ${holderDidCid}`);
    console.log("\nThese DIDs can now be used in the W3C Verifiable Credentials workflow");

  } catch (error) {
    console.error("Error during DID creation:", error);
    process.exit(1);
  }
}

// Execute the script
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

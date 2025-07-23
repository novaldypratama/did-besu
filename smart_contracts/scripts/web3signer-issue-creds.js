const axios = require('axios');
const { ethers } = require('ethers');
const FormData = require('form-data');
const { v4: uuidv4 } = require('uuid');
const jsonld = require('jsonld');
const fs = require('fs');
require('dotenv').config();

// Import ABIs
const CredentialRegistryABI = require('../artifacts/contracts/vc/CredentialRegistry.sol/CredentialRegistry.json').abi;

// Web3Signer and Besu RPC URLs
const WEB3SIGNER_URL = "http://127.0.0.1:18545";  // For transaction signing
const BESU_URL = "http://127.0.0.1:8545";         // For blockchain read operations

// Contract address (replace with your deployed contract address)
const CREDENTIAL_REGISTRY_ADDRESS = '0x65952c0Daf5936175851904A9889bd31E49EbFFc';

// IPFS configuration - using Infura as the primary gateway with fallbacks
const IPFS_CONFIG = {
  // Pinata API settings
  uploadEndpoint: 'https://api.pinata.cloud/pinning/pinFileToIPFS',
  pinataGateway: 'https://gateway.pinata.cloud/ipfs/',
  jwt: process.env.PINATA_JWT || '',

  // Public IPFS gateway URLs for fetching content (fallbacks)
  publicGateways: [
    'https://dweb.link/ipfs/',                       // Protocol Labs gateway
    'https://ipfs.io/ipfs/'                          // IPFS public gateway
  ]
};

// /**
//  * Simple canonicalization function for JSON objects
//  * @param {*} obj - The object to canonicalize
//  * @returns {string} - The canonicalized JSON string
//  */
// function simpleCanonicalizeJSON(obj) {
//   // For arrays, recursively canonicalize each element and join
//   if (Array.isArray(obj)) {
//     return '[' + obj.map(simpleCanonicalizeJSON).join(',') + ']';
//   }

//   // For objects, sort keys and recursively canonicalize values
//   if (obj && typeof obj === 'object') {
//     return '{' + Object.keys(obj).sort().map(key => {
//       return JSON.stringify(key) + ':' + simpleCanonicalizeJSON(obj[key]);
//     }).join(',') + '}';
//   }

//   // For primitives, use standard JSON serialization
//   return JSON.stringify(obj);
// }

/**
 * Canonicalises a JSON-LD document using the W3C URDNA2015 algorithm.
 * Returns a deterministic N-Quads string that can be safely hashed.
 *
 * @param {object} doc – the JSON-LD object (VC payload or DID doc)
 * @returns {Promise<string>} URDNA2015-normalised N-Quads
 */
async function canonicalizeJSONLD(doc) {
  return jsonld.canonize(doc, {
    algorithm: 'URDNA2015',
    format: 'application/n-quads'
  });
}


/**
 * Send JSON-RPC request to Web3Signer (for transaction signing)
 * @param {string} method - JSON-RPC method name
 * @param {Array} params - Parameters for the JSON-RPC method
 * @returns {Promise<any>} - The result from Web3Signer
 */
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

/**
 * Send JSON-RPC request to Besu (for blockchain read operations)
 * @param {string} method - JSON-RPC method name
 * @param {Array} params - Parameters for the JSON-RPC method
 * @returns {Promise<any>} - The result from Besu
 */
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

/**
 * Get available accounts from Web3Signer
 * @returns {Promise<string[]>} - Array of Ethereum addresses
 */
async function getWeb3SignerAccounts() {
  return await sendWeb3SignerRequest("eth_accounts");
}

/**
 * Creates a DID hash from an Ethereum address
 * @param {string} ethAddress - Ethereum address
 * @returns {string} - keccak256 hash of "did:ethr:{address}"
 */
function createDidHash(ethAddress) {
  return ethers.keccak256(
    ethers.solidityPacked(
      ['string', 'address'],
      ['did:ethr:', ethAddress]
    )
  );
}

/**
 * Generates a W3C VC Data Model v2.0 compliant JSON-LD object
 * @param {string} issuerAddress - Ethereum address of the issuer
 * @param {string} holderAddress - Ethereum address of the holder
 * @returns {object} - JSON-LD VC object
 */
function generateVCPayload(issuerAddress, holderAddress) {
  const issuanceDate = new Date().toISOString();

  return {
    "@context": [
      "https://www.w3.org/ns/credentials/v2",
      "https://www.w3.org/ns/credentials/examples/v2"
    ],
    "id": `urn:uuid:${uuidv4()}`,
    "type": ["VerifiableCredential", "IdentityCredential"],
    "issuer": {
      "id": `did:ethr:${issuerAddress}`,
      "name": "Example Issuer Organization"
    },
    "validFrom": issuanceDate,
    "credentialSubject": {
      "id": `did:ethr:${holderAddress}`,
      "type": "Person",
      "name": "Example Subject",
      "attributes": {
        "firstName": "John",
        "lastName": "Doe",
        "dateOfBirth": "1990-01-01",
        "nationality": "US"
      }
    },
    // Static data for consistent size
    "evidence": {
      "type": ["Evidence", "DocumentVerification"],
      "verificationMethod": "Automated",
      "verificationDate": issuanceDate,
      "staticData": "X".repeat(500) // Static block for consistent size
    }
  };
}

/**
 * Canonicalizes and hashes a JSON-LD credential using jsonld library (URDNA2015 algorithm)
 * @param {object} jsonldObj - JSON-LD object to hash
 * @returns {string} - keccak256 hash of the canonicalized JSON
 */
async function hashCredential(jsonldObj) {
  // Canonicalize the JSON-LD using URDNA2015 algorithm
  const canonicalizedJson = await canonicalizeJSONLD(jsonldObj);

  // Canonicalize the JSON-LD using our simple function
  // const canonicalizedJson = simpleCanonicalizeJSON(jsonldObj);

  if (!canonicalizedJson) {
    throw new Error("Failed to canonicalize JSON-LD object");
  }

  // Hash the canonicalized JSON with keccak256
  return ethers.keccak256(ethers.toUtf8Bytes(canonicalizedJson));
}

/**
 * Uploads a JSON-LD object to IPFS using public gateway
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
      filename: 'credential.json',
      contentType: 'application/json',
    });

    // Add metadata to help identify the file in Pinata
    const metadata = JSON.stringify({
      name: `VC-${Date.now()}`,
      keyvalues: {
        type: 'VerifiableCredential',
        timestamp: Date.now().toString()
      }
    });
    formData.append('pinataMetadata', metadata);

    // Set pinning options (optional)
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

/**
 * Encode function data for contract call
 * @param {string} functionName - Name of the function to call
 * @param {Array} params - Function parameters
 * @returns {string} - ABI-encoded function call data
 */
function encodeFunction(functionName, params) {
  const iface = new ethers.Interface(CredentialRegistryABI);
  return iface.encodeFunctionData(functionName, params);
}

/**
 * Send transaction through Web3Signer
 * @param {string} from - Sender address
 * @param {string} to - Target contract address
 * @param {string} data - Encoded function call data
 * @returns {Promise<object>} - Transaction receipt
 */
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

    const gasLimit = Math.ceil(parseInt(estimatedGas, 16) * 1.5); // Add 50% buffer and round up
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

/**
 * Call a read-only contract function
 * @param {string} functionName - Name of the function to call
 * @param {Array} params - Function parameters
 * @returns {Promise<any>} - Decoded function result
 */
async function callContractFunction(functionName, params) {
  const data = encodeFunction(functionName, params);

  const result = await sendBesuRequest("eth_call", [{
    to: CREDENTIAL_REGISTRY_ADDRESS,
    data: data
  }, "latest"]);

  const iface = new ethers.Interface(CredentialRegistryABI);
  return iface.decodeFunctionResult(functionName, result);
}

/**
 * Get logs from blockchain for a specific event
 * @param {string} eventName - Name of the event to filter
 * @param {string} fromBlock - Block number to start from (hex)
 * @param {string} toBlock - Block number to end at (hex)
 * @returns {Promise<Array>} - Array of decoded event logs
 */
async function getEventLogs(eventName, fromBlock, toBlock) {
  try {
    // Create interface from ABI
    const iface = new ethers.Interface(CredentialRegistryABI);

    // Correct approach for ethers v6: get event fragment then access topicHash property
    const eventFragment = iface.getEvent(eventName);
    const topicHash = eventFragment.topicHash;

    console.log(`Looking for events with topic hash: ${topicHash}`);

    // Query for logs
    const logs = await sendBesuRequest("eth_getLogs", [{
      address: CREDENTIAL_REGISTRY_ADDRESS,
      topics: [topicHash],
      fromBlock,
      toBlock
    }]);

    console.log(`Found ${logs ? logs.length : 0} logs`);

    // If no logs found, return empty array
    if (!logs || logs.length === 0) {
      return [];
    }

    // Enhanced debugging of log structure
    console.log("First log structure:", JSON.stringify(logs[0], null, 2));

    // Parse the logs with better error handling
    return logs.map(log => {
      try {
        // Parse the log data
        const parsedLog = iface.parseLog({
          topics: log.topics,
          data: log.data
        });

        if (!parsedLog) {
          console.warn(`Failed to parse log: ${JSON.stringify(log)}`);
          return null;
        }

        // Debug the parsed log and its arguments
        console.log("Parsed log name:", parsedLog.name);
        console.log("Parsed log args:", Object.keys(parsedLog.args));

        // Create a result object with careful extraction
        const result = {};

        // Extract all available arguments with type checking
        for (const key in parsedLog.args) {
          if (isNaN(parseInt(key))) { // Skip numeric keys
            const value = parsedLog.args[key];
            // Log each extracted value for debugging
            console.log(`Extracted ${key}:`, value);
            result[key] = value;
          }
        }

        // Add metadata
        result.blockNumber = parseInt(log.blockNumber, 16);
        result.transactionHash = log.transactionHash;

        return result;
      } catch (error) {
        console.warn(`Error parsing log: ${error.message}`);
        return null;
      }
    }).filter(log => log !== null); // Remove failed parses
  } catch (error) {
    console.error(`Error in getEventLogs: ${error.message}`);
    return [];
  }
}

/**
 * Extract credential information directly from transaction receipt
 * @param {object} receipt - Transaction receipt containing the logs
 * @returns {object|null} - Extracted credential info or null if not found
 */
function extractCredentialFromReceipt(receipt) {
  if (!receipt || !receipt.logs || receipt.logs.length === 0) {
    console.warn("No logs found in transaction receipt");
    return null;
  }

  console.log(`Examining ${receipt.logs.length} logs in transaction receipt`);

  // Create interface for parsing logs
  const iface = new ethers.Interface(CredentialRegistryABI);

  // Find CredentialIssued event in receipt logs
  for (const log of receipt.logs) {
    // Skip logs not from our contract
    if (log.address.toLowerCase() !== CREDENTIAL_REGISTRY_ADDRESS.toLowerCase()) {
      continue;
    }

    try {
      // Log the raw data for debugging
      console.log("Log topics:", log.topics);
      console.log("Log data:", log.data);

      // Parse the log
      const parsedLog = iface.parseLog({
        topics: log.topics,
        data: log.data
      });

      // Continue if we couldn't parse the log
      if (!parsedLog) {
        console.warn("Failed to parse log");
        continue;
      }

      // Check if this is the CredentialIssued event
      if (parsedLog.name === "CredentialIssued") {
        console.log("Found CredentialIssued event!");

        // Get the event definition
        const eventDef = iface.getEvent("CredentialIssued");
        console.log("Event definition:", eventDef.inputs);

        // Extract credential information
        const credentialInfo = {};

        // Carefully extract each argument with type checking
        for (const [index, input] of eventDef.inputs.entries()) {
          const name = input.name;
          let value;

          // Handle indexed parameters (found in topics)
          if (input.indexed && index < log.topics.length - 1) {
            // Topics[0] is the event signature, so indexed params start at topics[1]
            value = log.topics[index + 1];

            // Convert addresses to checksummed format
            if (input.type === 'address') {
              value = ethers.getAddress('0x' + value.slice(26));
            }
          }
          // Handle non-indexed parameters (found in data field)
          else if (parsedLog.args[name] !== undefined) {
            value = parsedLog.args[name];
          }

          if (value !== undefined) {
            credentialInfo[name] = value;
            console.log(`Extracted ${name}:`, value);
          }
        }

        // Return the extracted info if we found the event
        if (credentialInfo.credentialId || credentialInfo.credentialCid) {
          return credentialInfo;
        }
      }
    } catch (error) {
      console.warn(`Error parsing log: ${error.message}`);
    }
  }

  // If we get here, we couldn't find the credential info
  return null;
}

/**
 * Issues a credential to the CredentialRegistry contract using Web3Signer
 * @param {string} issuerAccount - Ethereum address of the issuer
 * @param {string} holderAddress - Ethereum address of the holder
 * @returns {Promise<object>} - Transaction receipt
 */
async function issueCredential(issuerAccount, holderAddress) {
  console.log(`Issuing credential from ${issuerAccount} to ${holderAddress}`);

  // Generate the VC payload
  const vcPayload = generateVCPayload(issuerAccount, holderAddress);
  console.log("Generated VC payload:", JSON.stringify(vcPayload, null, 2));

  // Sign VC payload with DID key (Ed25519Signature2020/EIP-712)
  // const jsigs = require('jsonld-signatures');
  // const { Ed25519VerificationKey2020 } = require('@digitalbazaar/ed25519-verification-key-2020');
  // const signedVcPayload = await jsigs
  // console.log("Signed VC Payload w/ DID key: ")

  // Hash the credential
  // change vcPayload to signedVcPayload
  const credentialId = await hashCredential(vcPayload);
  console.log("Credential Hash (credentialId):", credentialId);

  // Canonicalize the VC payload for consistent hashing
  const canonicalizedVcPayload = await canonicalizeJSONLD(vcPayload);
  console.log("Canonicalized VC Payload:", JSON.stringify(canonicalizedVcPayload, null, 2));

  // Upload to IPFS and get CID
  // optional: change vcPayload to signedVcPayload
  console.log("Uploading to IPFS...");
  const credentialCid = await uploadToIPFS(vcPayload);
  console.log("Credential CID:", credentialCid);

  // Create DID hashes
  const issuerDid = createDidHash(issuerAccount);
  const holderDid = createDidHash(holderAddress);

  console.log("Issuer DID Hash:", issuerDid);
  console.log("Holder DID Hash:", holderDid);

  // Check if the DIDs are valid
  if (issuerDid === holderDid) {
    throw new Error("Issuer and holder cannot be the same address");
  }

  // Encode function call
  const data = encodeFunction("issueCredential", [
    holderAddress,
    credentialId,
    issuerDid,
    holderDid,
    credentialCid
  ]);

  // Send transaction from Issuer account
  return await sendTransaction(issuerAccount, CREDENTIAL_REGISTRY_ADDRESS, data);
}

/**
 * Verifies if a credential exists and is valid
 * @param {string} credentialId - Credential hash to verify
 * @returns {Promise<object>} - Credential data if valid
 */
async function verifyCredential(credentialId) {
  try {
    // Check if credentialId exists
    if (!credentialId) {
      throw new Error("CredentialId is undefined - cannot verify");
    }

    console.log("Verifying credential with ID:", credentialId);

    const result = await callContractFunction("resolveCredential", [credentialId]);
    console.log("Credential verification result:", result);

    // Handle the nested array structure correctly
    // The result is a nested array where the first element contains the credential record
    const credentialRecord = result[0];

    return {
      credentialHash: credentialRecord[0],
      issuer: credentialRecord[1],
      metadata: {
        // Convert BigInt values to regular numbers
        issuanceDate: Number(credentialRecord[2][0]),
        expirationDate: Number(credentialRecord[2][1]),
        status: Number(credentialRecord[2][2])
      }
    };
  } catch (error) {
    console.error("Credential verification failed:", error.message);
    throw new Error(`Invalid or revoked credential: ${error.message}`);
  }
}

/**
 * Retrieves the full credential data from IPFS
 * @param {string} cid - IPFS content identifier
 * @returns {Promise<object>} - The full credential data
 */
async function getCredentialFromIPFS(cid) {
  // Try using dedicated Pinata gateway first
  try {
    const url = `${IPFS_CONFIG.pinataGateway}${cid}`;
    console.log(`Attempting to fetch credential from Pinata gateway: ${url}`);

    const response = await axios.get(url, { timeout: 10000 });
    if (response.status === 200 && response.data) {
      console.log(`Successfully retrieved credential from Pinata gateway`);
      return response.data;
    }
  } catch (error) {
    console.warn(`Failed to fetch from Pinata gateway, trying public gateways...`);
  }

  // Try different gateways as fallback
  for (const gateway of IPFS_CONFIG.publicGateways) {
    try {
      const url = `${gateway}${cid}`;
      console.log(`Attempting to fetch credential from: ${url}`);

      const response = await axios.get(url, { timeout: 10000 });
      if (response.status === 200 && response.data) {
        console.log(`Successfully retrieved credential from ${gateway}`);
        return response.data;
      }
    } catch (error) {
      console.warn(`Failed to fetch from ${gateway}, trying next...`);
    }
  }

  throw new Error("Could not retrieve credential from any IPFS gateway");
}

/**
 * Main function demonstrating credential issuance
 */
async function main() {
  try {
    console.log("Starting Verifiable Credential issuance process...");
    console.log("Connecting to Web3Signer at:", WEB3SIGNER_URL);
    console.log("Connecting to Besu at:", BESU_URL);
    console.log("Using Pinata Gateway:", IPFS_CONFIG.pinataGateway);

    // Test connection to Web3Signer
    console.log("Testing connection to Web3Signer...");
    await sendWeb3SignerRequest("net_version");

    // Test connections
    console.log("Testing connection to Besu...");
    await sendBesuRequest("net_version");

    // Get accounts from Web3Signer
    const accounts = await getWeb3SignerAccounts();
    console.log("Available accounts from Web3Signer:", accounts);

    const issuerAccount = accounts[1]; // Using account at index 1 as Issuer
    const holderAccount = accounts[2]; // Using account at index 2 as Holder

    console.log("Selected Issuer account:", issuerAccount);
    console.log("Selected Holder account:", holderAccount);

    // Issue the credential
    console.log("\nIssuing credential via Web3Signer...");
    const result = await issueCredential(issuerAccount, holderAccount);
    console.log("Transaction hash:", result.hash);
    console.log("Transaction confirmed in block:", parseInt(result.receipt.blockNumber, 16));
    console.log("Gas used:", parseInt(result.receipt.gasUsed, 16));
    console.log("Credential issued successfully!");

    // Try to extract credential info directly from the receipt
    console.log("\nTrying to extract credential info directly from receipt...");
    const extractedInfo = extractCredentialFromReceipt(result.receipt);

    // Get credential ID from logs
    const blockNumber = ethers.toQuantity(parseInt(result.receipt.blockNumber, 16));
    const events = await getEventLogs('CredentialIssued', blockNumber, blockNumber);

    // Use whichever approach worked
    let credentialId, credentialCid;

    if (extractedInfo && extractedInfo.credentialId) {
      console.log("Using credential info extracted directly from receipt");
      credentialId = extractedInfo.credentialId;
      credentialCid = extractedInfo.credentialCid;
    } else if (events.length > 0 && events[0].credentialId) {
      console.log("Using credential info from event logs");
      credentialId = events[0].credentialId;
      credentialCid = events[0].credentialCid;
    } else {
      console.warn("Could not extract credential info from either method");
      console.log("Transaction was successful, but credential info could not be retrieved");
      console.log("Check transaction manually at block:", blockNumber);
      process.exit(1);
    }

    console.log("Credential ID from event:", credentialId);
    console.log("Credential CID from event:", credentialCid);

    // Continue with verification only if we have a credentialId
    if (credentialId) {
      // Verify the credential on-chain
      console.log("\nVerifying credential on-chain...");
      const credentialData = await verifyCredential(credentialId);
      console.log("Credential is valid and active");
      console.log("Issuance date:", new Date(credentialData.metadata.issuanceDate * 1000).toISOString());

      // Save credential details to file
      const credentialDetails = {
        credentialId,
        credentialCid,
        issuer: issuerAccount,
        holder: holderAccount,
        issuanceDate: new Date(credentialData.metadata.issuanceDate * 1000).toISOString(),
        transactionHash: result.hash
      };

      fs.writeFileSync(
        `credential-${credentialId.substring(0, 8)}.json`,
        JSON.stringify(credentialDetails, null, 2)
      );
      console.log(`Credential details saved to file: credential-${credentialId.substring(0, 8)}.json`);

      // Retrieve the full credential from IPFS
      console.log("\nRetrieving full credential data from IPFS...");
      const fullCredential = await getCredentialFromIPFS(credentialCid);

      // After retrieving the credential from IPFS:
      let credentialObj;
      if (typeof fullCredential === 'string') {
        const trimmed = fullCredential.trim();
        credentialObj = trimmed.startsWith('{') || trimmed.startsWith('[')
          ? JSON.parse(trimmed)                                             // JSON-LD
          : await jsonld.fromRDF(trimmed, { format: 'application/n-quads' }); // N-Quads
      } else {
        credentialObj = fullCredential;  // already an object
      }

      // Format using jsonld.js compact method
      const VC_CONTEXT = 'https://www.w3.org/ns/credentials/v2';
      // const context = credentialObj["@context"];
      const compacted = await jsonld.compact(credentialObj, VC_CONTEXT);

      // Pretty-print the compacted form
      const formattedCredential = JSON.stringify(compacted, null, 2);
      console.log("Formatted Verifiable Credential:", formattedCredential);

      fs.writeFileSync(
        `verifiable-credential-${holder.substring(0, 8)}.json`,
        formattedCredential
      ),
        console.log(`Verifiable credentials saved to file: verifiable-credential-${holder.substring(0, 8)}.json`);

      console.log("Full credential:", formattedCredential);
    } else {
      console.warn("No CredentialIssued event found in logs");
    }

    console.log("\n✅ Verifiable Credential issuance completed successfully!");

  } catch (error) {
    console.error("Error during credential issuance:", error);
    process.exit(1);
  }
}

// Execute the main function
main().catch(console.error);

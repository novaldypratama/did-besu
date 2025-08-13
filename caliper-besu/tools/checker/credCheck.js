import { Web3 } from 'web3';
import crypto from 'crypto';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration constants
const CONFIG = {
  RPC_URL: "ws://172.16.239.15:8546",
  CONTRACT_ADDRESS: "0x65952c0Daf5936175851904A9889bd31E49EbFFc",
  DEFAULT_FROM: "0x06d06c366b213f716b51bca6dc1874afc05467d0",
  CONNECTION_TIMEOUT: 10000, // 10 seconds
};

/**
 * Load contract ABI from the JSON artifact
 * @returns {Array} Contract ABI
 */
function loadContractABI() {
  try {
    const contractPath = join(__dirname, '../../smart_contracts/artifacts/contracts/vc/CredentialRegistry.sol/CredentialRegistry.json');
    const contractJson = JSON.parse(readFileSync(contractPath, 'utf8'));
    
    if (!contractJson.abi || !Array.isArray(contractJson.abi)) {
      throw new Error('Invalid contract ABI structure');
    }
    
    return contractJson.abi;
  } catch (error) {
    throw new Error(`Failed to load contract ABI: ${error.message}`);
  }
}

/**
 * Generate test credential data
 * @returns {Object} Test data object containing identity, credentialId, and credentialCid
 */
function generateTestData() {
  const randomBytes = crypto.randomBytes(20);
  const credentialIdBytes = crypto.randomBytes(32); // Generate 32 random bytes for credential ID
  const randomSuffix = crypto.randomBytes(23).toString('base64')
        .replace(/[+/]/g, '')
        .substring(0, 44);

  return {
    identity: '0x' + randomBytes.toString('hex'),
    credentialId: '0x' + credentialIdBytes.toString('hex'), // 32 bytes of true randomness
    credentialCid: `Qm${randomSuffix}` // IPFS-like CID format
  };
}

/**
 * Validate Ethereum address format
 * @param {string} address - Address to validate
 * @returns {boolean} True if valid address format
 */
function isValidAddress(address) {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Validate hex string with specific byte length
 * @param {string} hexString - Hex string to validate
 * @param {number} expectedBytes - Expected byte length
 * @returns {boolean} True if valid hex string
 */
function isValidHexString(hexString, expectedBytes) {
  const expectedLength = 2 + (expectedBytes * 2); // '0x' + hex chars
  return hexString.length === expectedLength && /^0x[a-fA-F0-9]+$/.test(hexString);
}

/**
 * Main function to test credential issuing functionality
 */
async function main() {
  let web3;
  
  try {
    console.log("🚀 Starting Credential Registry Check");
    console.log("=" .repeat(50));
    
    // Initialize Web3 connection
    console.log("📡 Connecting to Besu network...");
    web3 = new Web3(CONFIG.RPC_URL);
    
    // Test connection
    const networkId = await web3.eth.net.getId();
    const blockNumber = await web3.eth.getBlockNumber();
    console.log(`✅ Connected to network ID: ${networkId}, latest block: ${blockNumber}`);
    
    // Load contract ABI and create contract instance
    console.log("📄 Loading contract ABI...");
    const abi = loadContractABI();
    const cr = new web3.eth.Contract(abi, CONFIG.CONTRACT_ADDRESS);
    console.log(`✅ Contract instance created at: ${CONFIG.CONTRACT_ADDRESS}`);
    
    // Validate contract address
    if (!isValidAddress(CONFIG.CONTRACT_ADDRESS)) {
      throw new Error(`Invalid contract address format: ${CONFIG.CONTRACT_ADDRESS}`);
    }
    
    // Check if contract exists
    const contractCode = await web3.eth.getCode(CONFIG.CONTRACT_ADDRESS);
    if (contractCode === '0x') {
      throw new Error(`No contract deployed at address: ${CONFIG.CONTRACT_ADDRESS}`);
    }
    console.log("✅ Contract code verified on blockchain");
    
    // Generate test data
    console.log("\n🔧 Generating test data...");
    const testData = generateTestData();
    
    // Validate generated data
    if (!isValidAddress(testData.identity)) {
      throw new Error("Invalid identity address generated");
    }
    if (!isValidHexString(testData.credentialId, 32)) {
      throw new Error("Invalid credential ID format");
    }
    
    console.log("Generated test data:");
    console.log(`- Identity: ${testData.identity}`);
    console.log(`- Credential ID: ${testData.credentialId}`);
    console.log(`- Credential CID: ${testData.credentialCid}`);
    
    // Encode function call
    console.log("\n🔧 Encoding function call...");
    const data = cr.methods
      .issueCredential(testData.identity, testData.credentialId, testData.credentialCid)
      .encodeABI();
    console.log(`📃 Encoded data: ${data}`);

    console.log(`✅ Calldata encoded successfully (${data.length} characters)`);
    console.log(`📊 Estimated gas cost: ~${Math.ceil(data.length / 2)} bytes`);
    
    // Simulate transaction
    console.log("\n🔍 Simulating transaction...");
    const callParams = {
      to: CONFIG.CONTRACT_ADDRESS,
      from: CONFIG.DEFAULT_FROM,
      data: data
    };
    
    const result = await web3.eth.call(callParams);
    console.log(`📋 Call result: ${result}`);
    
    // Analyze result
    if (result === "0x") {
      console.log("✅ Transaction simulation successful - no revert detected");
      console.log("🎉 issueCredential function call is valid and will execute successfully");
    } else {
      console.log(`⚠️  Transaction simulation returned data: ${result}`);
      console.log("ℹ️  This may indicate a successful call with return data");
    }
    
    // Additional validations
    console.log("\n🔍 Performing additional validations...");
    
    // Estimate gas
    try {
      const gasEstimate = await web3.eth.estimateGas(callParams);
      console.log(`⛽ Estimated gas required: ${gasEstimate.toString()}`);
    } catch (gasError) {
      console.warn(`⚠️  Gas estimation failed: ${gasError.message}`);
    }
    
    // Check sender balance (if needed for actual transaction)
    try {
      const balance = await web3.eth.getBalance(CONFIG.DEFAULT_FROM);
      console.log(`💰 Sender balance: ${web3.utils.fromWei(balance, 'ether')} ETH`);
    } catch (balanceError) {
      console.warn(`⚠️  Balance check failed: ${balanceError.message}`);
    }
    
    console.log("\n" + "=" .repeat(50));
    console.log("🎯 Credential check completed successfully!");
    
  } catch (error) {
    console.error("\n" + "=" .repeat(50));
    console.error("❌ Error during credential check:");
    console.error(`📋 Error type: ${error.constructor.name}`);
    console.error(`💬 Message: ${error.message}`);
    
    if (error.stack) {
      console.error(`📚 Stack trace: ${error.stack}`);
    }
    
    process.exit(1);
  } finally {
    // Clean up WebSocket connection
    if (web3 && web3.currentProvider && typeof web3.currentProvider.disconnect === 'function') {
      try {
        web3.currentProvider.disconnect();
        console.log("🔌 WebSocket connection closed");
      } catch (disconnectError) {
        console.warn(`⚠️  Failed to close WebSocket: ${disconnectError.message}`);
      }
    }
  }
}

// Execute the main function with proper error handling
main().catch((error) => {
  console.error("🚨 Unhandled error in main function:", error);
  process.exit(1);
});
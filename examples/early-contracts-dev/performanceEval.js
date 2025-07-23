const { ethers } = require("ethers");
const fs = require("fs");
const { performance } = require("perf_hooks");
require("dotenv").config();

// Validate required environment variables
if (!process.env.PRIVATE_KEY) {
  console.error("Error: PRIVATE_KEY is not defined in your .env file.");
  process.exit(1);
}

// Load ABI files (ensure these paths are correct)
let DIDRegistryABI, VCRegistryABI;
try {
  DIDRegistryABI = JSON.parse(fs.readFileSync("./artifacts/contracts/DIDRegistry.sol/DIDRegistry.json")).abi;
  VCRegistryABI = JSON.parse(fs.readFileSync("./artifacts/contracts/VCRegistry.sol/VCRegistry.json")).abi;
} catch (err) {
  console.error("Error reading ABI files:", err);
  process.exit(1);
}

// Connection settings and deployed contract addresses
const RPC_ENDPOINT = "http://localhost:21001"; // Besu node RPC endpoint
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const DIDRegistryAddress = "0xf69960E9a08484a7600A6499C90f939F41e22DeC"; // Update with your deployed DIDRegistry address
const VCRegistryAddress = "0x929A7574E74e94f3B901E6B60c97f496F011e0ba";   // Update with your deployed VCRegistry address

// Create provider and wallet
const provider = new ethers.JsonRpcProvider(RPC_ENDPOINT);
provider.getBlockNumber().then((blockNumber) => {
  console.log("Connected to Besu network. Latest block number:", blockNumber);
}).catch((err) => {
  console.error("Error connecting to RPC endpoint:", err);
  process.exit(1);
});
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

// Create contract instances (ethers v6 style)
const didRegistry = new ethers.Contract(DIDRegistryAddress, DIDRegistryABI, wallet);
const vcRegistry = new ethers.Contract(VCRegistryAddress, VCRegistryABI, wallet);

// Set test parameters
const ITERATIONS = 10;
const THRESHOLD_MS = 1000; // threshold in milliseconds for warning about delays

// Utility: compute average, min, and max from an array of numbers
function computeStats(times) {
  const total = times.reduce((acc, t) => acc + t, 0);
  const avg = total / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  return { avg, min, max };
}

// Custom replacer function to handle BigInt values when logging JSON
function bigintReplacer(key, value) {
  return typeof value === "bigint" ? value.toString() : value;
}

async function testPerformance() {
  console.log("=== Starting Performance Tests ===\n");

  // Arrays to store execution times for summary statistics
  const createTimes = [];
  const getTimes = [];
  const attestTimes = [];
  const verifyTimes = [];

  // 1. Write Operation: Create DIDs
  console.log(">> Testing DID Creation (write operation):");
  for (let i = 0; i < ITERATIONS; i++) {
    const did = `did:example:${i}`;
    const publicKey = `publicKey_${i}`;
    const start = performance.now();

    try {
      const tx = await didRegistry.createDID(did, publicKey);
      console.log(`Transaction sent for createDID(${did}). Tx hash: ${tx.hash}`);
      await tx.wait(); // Wait for transaction confirmation
      const duration = performance.now() - start;
      createTimes.push(duration);
      console.log(`createDID for ${did} took ${duration.toFixed(2)} ms`);
      if (duration > THRESHOLD_MS) {
        console.warn(`WARNING: createDID for ${did} exceeded threshold of ${THRESHOLD_MS} ms`);
      }
    } catch (error) {
      console.error(`Error during createDID for ${did}:`, error);
    }
  }
  console.log("");

  // 2. Read Operation: Retrieve DIDs
  console.log(">> Testing DID Resolution (read operation):");
  for (let i = 0; i < ITERATIONS; i++) {
    const did = `did:example:${i}`;
    const start = performance.now();

    try {
      const result = await didRegistry.getDID(did);
      const duration = performance.now() - start;
      getTimes.push(duration);
      console.log(
        `getDID for ${did} took ${duration.toFixed(2)} ms; result: ${JSON.stringify(result, bigintReplacer, 2)}`
      );
      if (duration > THRESHOLD_MS) {
        console.warn(`WARNING: getDID for ${did} exceeded threshold of ${THRESHOLD_MS} ms`);
      }
    } catch (error) {
      console.error(`Error during getDID for ${did}:`, error);
    }
  }
  console.log("");

  // 3. Write Operation: Attest Credentials
  console.log(">> Testing VC Attestation (write operation):");
  for (let i = 0; i < ITERATIONS; i++) {
    const did = `did:example:${i}`;
    const vcId = `vc_${i}`;
    const data = `sampleData_${i}`;
    const start = performance.now();

    try {
      const tx = await vcRegistry.attestCredential(did, vcId, data);
      console.log(`Transaction sent for attestCredential(${did}). Tx hash: ${tx.hash}`);
      await tx.wait();
      const duration = performance.now() - start;
      attestTimes.push(duration);
      console.log(`attestCredential for ${did} took ${duration.toFixed(2)} ms`);
      if (duration > THRESHOLD_MS) {
        console.warn(`WARNING: attestCredential for ${did} exceeded threshold of ${THRESHOLD_MS} ms`);
      }
    } catch (error) {
      console.error(`Error during attestCredential for ${did}:`, error);
    }
  }
  console.log("");

  // 4. Read Operation: Verify Credentials
  console.log(">> Testing VC Verification (read operation):");
  for (let i = 0; i < ITERATIONS; i++) {
    const did = `did:example:${i}`;
    const vcId = `vc_${i}`;
    const start = performance.now();

    try {
      const result = await vcRegistry.verifyCredential(did, vcId);
      const duration = performance.now() - start;
      verifyTimes.push(duration);
      console.log(
        `verifyCredential for ${did} took ${duration.toFixed(2)} ms; result: ${JSON.stringify(result, bigintReplacer, 2)}`
      );
      if (duration > THRESHOLD_MS) {
        console.warn(`WARNING: verifyCredential for ${did} exceeded threshold of ${THRESHOLD_MS} ms`);
      }
    } catch (error) {
      console.error(`Error during verifyCredential for ${did}:`, error);
    }
  }
  console.log("");

  // Compute and display summary statistics for each operation type
  const createStats = computeStats(createTimes);
  const getStats = computeStats(getTimes);
  const attestStats = computeStats(attestTimes);
  const verifyStats = computeStats(verifyTimes);

  console.log("=== Performance Summary ===");
  console.log(`DID Creation - Avg: ${createStats.avg.toFixed(2)} ms, Min: ${createStats.min.toFixed(2)} ms, Max: ${createStats.max.toFixed(2)} ms`);
  console.log(`DID Resolution - Avg: ${getStats.avg.toFixed(2)} ms, Min: ${getStats.min.toFixed(2)} ms, Max: ${getStats.max.toFixed(2)} ms`);
  console.log(`VC Attestation - Avg: ${attestStats.avg.toFixed(2)} ms, Min: ${attestStats.min.toFixed(2)} ms, Max: ${attestStats.max.toFixed(2)} ms`);
  console.log(`VC Verification - Avg: ${verifyStats.avg.toFixed(2)} ms, Min: ${verifyStats.min.toFixed(2)} ms, Max: ${verifyStats.max.toFixed(2)} ms`);

  console.log("\n=== Performance Tests Completed ===");
}

testPerformance().catch((error) => {
  console.error("Error during performance testing:", error);
});

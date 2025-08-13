/**
 * DID Registry Interaction Script
 * 
 * This script demonstrates how to interact with the DidRegistry smart contract
 * deployed on the Besu blockchain network. It provides functionality to:
 * - Check if a DID exists for a given Ethereum address
 * - Test multiple addresses at once
 * - Properly DidCheck function calls and decode responses
 * 
 * Usage:
 *   node DidCheck.js                                   # Check zero address
 *   node DidCheck.js <address>                         # Check specific address
 *   node DidCheck.js --test-all                        # Test known addresses
 * 
 * Requirements:
 * - Besu network running on http://127.0.0.1:8545
 * - DidRegistry contract deployed at the configured address
 * - Node.js with ES modules support (package.json has "type": "module")
 * 
 * @author Caliper Besu DID Demo
 */

import { JsonRpcProvider, Interface } from "ethers";

// Configuration
const rpc = "http://127.0.0.1:8545";
const contractAddr = "0xA5134e42CF382152894d040a0e89F2E4231062d8"; // DidRegistry contract address from config.yaml

// Utility function to check if the contract exists
async function checkContractExists() {
  try {
    const provider = new JsonRpcProvider(rpc);
    const code = await provider.getCode(contractAddr);
    
    if (code === "0x") {
      console.log("⚠️  Warning: No contract found at address", contractAddr);
      console.log("   Make sure the DidRegistry contract is deployed");
      return false;
    }
    
    console.log("✓ Contract found at address", contractAddr);
    return true;
  } catch (error) {
    console.error("Error checking contract:", error.message);
    return false;
  }
}

async function checkDidExists(address = "0x0000000000000000000000000000000000000000") {
  try {
    console.log("Connecting to RPC endpoint:", rpc);
    console.log("DidRegistry contract address:", contractAddr);
    console.log("Checking DID for address:", address);

    const provider = new JsonRpcProvider(rpc);

    // Test connection
    const network = await provider.getNetwork();
    console.log("✓ Successfully connected to network (Chain ID:", network.chainId.toString() + ")");

    // Check if contract exists
    const contractExists = await checkContractExists();
    if (!contractExists) {
      throw new Error("Contract not found at the specified address");
    }

    const abi = ["function didExists(address identity) view returns (bool exists)"];
    const iface = new Interface(abi);
    const data = iface.encodeFunctionData("didExists", [address]);

    console.log("Encoded function data:", data);

    const response = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to: contractAddr, data }, "latest"]
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const json = await response.json();
    
    if (json.error) {
      throw new Error(`RPC error: ${json.error.message}`);
    }

    console.log("Raw response:", json.result);

    // Handle empty response (contract doesn't exist or function reverted)
    if (!json.result || json.result === "0x") {
      console.log("⚠️  Contract returned empty response - contract may not be deployed or function may have reverted");
      return false;
    }

    const decoded = iface.decodeFunctionResult("didExists", json.result);
    const exists = decoded[0];
    
    console.log("DID exists:", exists);
    return exists;

  } catch (error) {
    console.error("Error checking DID existence:", error.message);
    throw error;
  }
}

// Test with known addresses from the system
async function testWithKnownAddresses() {
  console.log("\n=== Testing didExists with known addresses ===");
  
  const testAddresses = [
    "0x0000000000000000000000000000000000000000", // Zero address
    "0xfe3b557e8fb62b89f4916b721be55ceb828dbd73", // Primary Issuer
    "0x627306090abaB3A6e1400e9345bC60c78a8BEf57", // Primary Holder
    "0x2d501ff683a6dcb43b4b12cf334ea7a9692a9f1c", // Additional Holder
    "0x8dd478dee59d3b7c16a2e34cb5d321ed23d2677d"  // Additional Holder
  ];

  for (const addr of testAddresses) {
    try {
      console.log(`\n--- Testing address: ${addr} ---`);
      const exists = await checkDidExists(addr);
      console.log(`Result: DID ${exists ? 'EXISTS' : 'DOES NOT EXIST'} for ${addr}`);
    } catch (error) {
      console.error(`Failed to check ${addr}:`, error.message);
    }
  }
}

// Display help information
function showHelp() {
  console.log(`
DID Registry Interaction Script
==============================

Usage:
  node DidCheck.js                          # Check DID for zero address
  node DidCheck.js <address>                # Check DID for specific address
  node DidCheck.js --test-all               # Test multiple known addresses
  node DidCheck.js --help                   # Show this help

Examples:
  node DidCheck.js 0xfe3b557e8fb62b89f4916b721be55ceb828dbd73
  node DidCheck.js --test-all

Configuration:
  RPC Endpoint: ${rpc}
  Contract:     ${contractAddr}
`);
}

// Main execution
async function main() {
  try {
    const args = process.argv.slice(2);
    
    if (args.includes("--help") || args.includes("-h")) {
      showHelp();
      return;
    }
    
    if (args.includes("--test-all")) {
      await testWithKnownAddresses();
    } else {
      // You can pass a specific address to check, or it will use the default zero address
      const address = args[0] || "0x0000000000000000000000000000000000000000";
      
      // Validate address format
      if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        console.error("Error: Invalid Ethereum address format");
        console.log("Expected format: 0x followed by 40 hexadecimal characters");
        showHelp();
        process.exit(1);
      }
      
      await checkDidExists(address);
    }
  } catch (error) {
    console.error("Script failed:", error.message);
    process.exit(1);
  }
}

// Run the script if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

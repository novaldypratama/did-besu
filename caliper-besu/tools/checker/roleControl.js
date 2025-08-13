/**
 * Role Control Interaction Script
 * 
 * This script demonstrates how to interact with the RoleControl smart contract
 * deployed on the Besu blockchain network. It provides functionality to:
 * - Get the role of a specific Ethereum address
 * - Get the count of accounts with a specific role
 * - Test multiple addresses and roles at once
 * - Properly encode function calls and decode responses
 * 
 * Usage:
 *   node roleControl.js                                    # Show help
 *   node roleControl.js getRole <address>                  # Get role for specific address
 *   node roleControl.js getRoleCount <role>                # Get count for specific role
 *   node roleControl.js --test-all                         # Test known addresses and roles
 * 
 * Requirements:
 * - Besu network running on http://127.0.0.1:8545
 * - RoleControl contract deployed at the configured address
 * - Node.js with ES modules support (package.json has "type": "module")
 * 
 * @author Caliper Besu DID Demo
 */

import { JsonRpcProvider, Interface } from "ethers";

// Configuration
const rpc = "http://127.0.0.1:8545";
const contractAddr = "0x1F2077A4Caa6a373A6bf628e30826Fd957C1b256"; // RoleControl contract address from config.yaml

// Role definitions based on the smart contract enum
const ROLES = {
  NONE: 0,
  ISSUER: 1,
  HOLDER: 2,
  TRUSTEE: 3
};

const ROLE_NAMES = {
  0: "NONE",
  1: "ISSUER", 
  2: "HOLDER",
  3: "TRUSTEE"
};

// Utility function to check if the contract exists
async function checkContractExists() {
  try {
    const provider = new JsonRpcProvider(rpc);
    const code = await provider.getCode(contractAddr);
    
    if (code === "0x") {
      console.log("⚠️  Warning: No contract found at address", contractAddr);
      console.log("   Make sure the RoleControl contract is deployed");
      return false;
    }
    
    console.log("✓ Contract found at address", contractAddr);
    return true;
  } catch (error) {
    console.error("Error checking contract:", error.message);
    return false;
  }
}

// Get the role of a specific address
async function getRole(address) {
  try {
    console.log("Connecting to RPC endpoint:", rpc);
    console.log("RoleControl contract address:", contractAddr);
    console.log("Getting role for address:", address);

    const provider = new JsonRpcProvider(rpc);

    // Test connection
    const network = await provider.getNetwork();
    console.log("✓ Successfully connected to network (Chain ID:", network.chainId.toString() + ")");

    // Check if contract exists
    const contractExists = await checkContractExists();
    if (!contractExists) {
      throw new Error("Contract not found at the specified address");
    }

    const abi = ["function getRole(address account) view returns (uint8)"];
    const iface = new Interface(abi);
    const data = iface.encodeFunctionData("getRole", [address]);

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

    // Handle empty response
    if (!json.result || json.result === "0x") {
      console.log("⚠️  Contract returned empty response - contract may not be deployed or function may have reverted");
      return null;
    }

    const decoded = iface.decodeFunctionResult("getRole", json.result);
    const roleValue = Number(decoded[0]);
    const roleName = ROLE_NAMES[roleValue] || "UNKNOWN";
    
    console.log(`Role: ${roleValue} (${roleName})`);
    return { value: roleValue, name: roleName };

  } catch (error) {
    console.error("Error getting role:", error.message);
    throw error;
  }
}

// Get the count of accounts with a specific role
async function getRoleCount(role) {
  try {
    console.log("Connecting to RPC endpoint:", rpc);
    console.log("RoleControl contract address:", contractAddr);
    
    let roleValue;
    if (typeof role === 'string') {
      // Try to parse as number first
      const numericRole = parseInt(role);
      if (!isNaN(numericRole) && numericRole >= 0 && numericRole <= 3) {
        roleValue = numericRole;
      } else {
        // Try to match role name
        roleValue = ROLES[role.toUpperCase()];
      }
    } else {
      roleValue = role;
    }
    
    if (roleValue === undefined || roleValue < 0 || roleValue > 3) {
      throw new Error(`Invalid role: ${role}. Valid roles: NONE/0, ISSUER/1, HOLDER/2, TRUSTEE/3`);
    }
    
    console.log(`Getting count for role: ${roleValue} (${ROLE_NAMES[roleValue]})`);

    const provider = new JsonRpcProvider(rpc);

    // Test connection
    const network = await provider.getNetwork();
    console.log("✓ Successfully connected to network (Chain ID:", network.chainId.toString() + ")");

    // Check if contract exists
    const contractExists = await checkContractExists();
    if (!contractExists) {
      throw new Error("Contract not found at the specified address");
    }

    const abi = ["function getRoleCount(uint8 role) view returns (uint32)"];
    const iface = new Interface(abi);
    const data = iface.encodeFunctionData("getRoleCount", [roleValue]);

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

    // Handle empty response
    if (!json.result || json.result === "0x") {
      console.log("⚠️  Contract returned empty response - contract may not be deployed or function may have reverted");
      return null;
    }

    const decoded = iface.decodeFunctionResult("getRoleCount", json.result);
    const count = Number(decoded[0]);
    
    console.log(`Count: ${count} accounts with role ${ROLE_NAMES[roleValue]}`);
    return count;

  } catch (error) {
    console.error("Error getting role count:", error.message);
    throw error;
  }
}

// Test with known addresses and roles from the system
async function testWithKnownData() {
  console.log("\n=== Testing Role Control Functions ===");
  
  const testAddresses = [
    { address: "0x06d06c366b213f716b51bca6dc1874afc05467d0", name: "Deployer (should be TRUSTEE)" },
    { address: "0xfe3b557e8fb62b89f4916b721be55ceb828dbd73", name: "Primary Issuer" },
    { address: "0x627306090abaB3A6e1400e9345bC60c78a8BEf57", name: "Primary Holder" },
    { address: "0x2d501ff683a6dcb43b4b12cf334ea7a9692a9f1c", name: "Additional Holder" },
    { address: "0x8dd478dee59d3b7c16a2e34cb5d321ed23d2677d", name: "Additional Holder" },
    { address: "0x0000000000000000000000000000000000000000", name: "Zero address (should be NONE)" }
  ];

  // Test getRole for known addresses
  console.log("\n--- Testing getRole function ---");
  for (const { address, name } of testAddresses) {
    try {
      console.log(`\n--- Testing address: ${address} (${name}) ---`);
      const role = await getRole(address);
      if (role) {
        console.log(`✓ Result: Address ${address} has role ${role.name} (${role.value})`);
      }
    } catch (error) {
      console.error(`✗ Failed to get role for ${address}:`, error.message);
    }
  }

  // Test getRoleCount for all roles
  console.log("\n--- Testing getRoleCount function ---");
  for (const [roleName, roleValue] of Object.entries(ROLES)) {
    try {
      console.log(`\n--- Testing role count for: ${roleName} (${roleValue}) ---`);
      const count = await getRoleCount(roleValue);
      if (count !== null) {
        console.log(`✓ Result: ${count} accounts have role ${roleName}`);
      }
    } catch (error) {
      console.error(`✗ Failed to get count for role ${roleName}:`, error.message);
    }
  }
}

// Display help information
function showHelp() {
  console.log(`
Role Control Interaction Script
===============================

Usage:
  node roleControl.js                           # Show this help
  node roleControl.js getRole <address>         # Get role for specific address
  node roleControl.js getRoleCount <role>       # Get count for specific role
  node roleControl.js --test-all                # Test known addresses and roles
  node roleControl.js --help                    # Show this help

Role Types:
  NONE (0)     - No role assigned
  ISSUER (1)   - Can issue credentials
  HOLDER (2)   - Can hold credentials  
  TRUSTEE (3)  - Admin role with full permissions

Examples:
  node roleControl.js getRole 0xfe3b557e8fb62b89f4916b721be55ceb828dbd73
  node roleControl.js getRoleCount ISSUER
  node roleControl.js getRoleCount 1
  node roleControl.js --test-all

Configuration:
  RPC Endpoint: ${rpc}
  Contract:     ${contractAddr}
`);
}

// Main execution
async function main() {
  try {
    const args = process.argv.slice(2);
    
    if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
      showHelp();
      return;
    }
    
    if (args.includes("--test-all")) {
      await testWithKnownData();
      return;
    }

    const command = args[0].toLowerCase();
    
    if (command === "getrole") {
      if (!args[1]) {
        console.error("Error: Address required for getRole command");
        showHelp();
        process.exit(1);
      }
      
      const address = args[1];
      
      // Validate address format
      if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        console.error("Error: Invalid Ethereum address format");
        console.log("Expected format: 0x followed by 40 hexadecimal characters");
        process.exit(1);
      }
      
      await getRole(address);
      
    } else if (command === "getrolecount") {
      if (!args[1]) {
        console.error("Error: Role required for getRoleCount command");
        console.log("Valid roles: NONE, ISSUER, HOLDER, TRUSTEE (or 0, 1, 2, 3)");
        process.exit(1);
      }
      
      const role = args[1];
      await getRoleCount(role);
      
    } else {
      console.error(`Error: Unknown command '${command}'`);
      showHelp();
      process.exit(1);
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

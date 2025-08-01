// init-roles.js (place in benchmarks/ directory)
'use strict';

const { ethers } = require('ethers');

// Config (match your setup)
const besuRpc = 'ws://172.16.239.15:8546';
const adminPrivateKey = '0xb37a2494f2330ee4fdf516b38bad42b8e27e35e810abf1baf1fb51ad880872ed'; // Private key of deployer/admin (e.g., from Hardhat or genesis)
const roleControlAddress = '0x1F2077A4Caa6a373A6bf628e30826Fd957C1b256'; // From deployment artifacts or besu-network.json

// Role constants
const ROLES = {
  NONE: 0,
  ISSUER: 1,
  HOLDER: 2,
  TRUSTEE: 3,
};

const trusteeRole = ROLES.TRUSTEE; // SSI_ROLES.TRUSTEE
const issuerRole = ROLES.ISSUER; // SSI_ROLES.ISSUER

// Worker accounts from besu-network.json (add all potential ones)
const workerAccounts = [
  '0xfe3b557e8fb62b89f4916b721be55ceb828dbd73',
  '0x627306090abaB3A6e1400e9345bC60c78a8BEf57',
  '0xf17f52151EbEF6C7334FAD080c5704D77216b732'
  // Add more if multi-worker
];

async function main() {
  // Use WebSocketProvider for better performance and event handling
  console.log(`Connecting to Besu via WebSocket at ${besuRpc}...`);
  
  // Create a provider with safer WebSocket access
  const provider = new ethers.WebSocketProvider(besuRpc);
  
  // Add connection state tracking
  let isConnected = false;
  
  // Use provider events instead of direct WebSocket access
  provider.on('debug', (info) => {
    if (info.action === 'connect') {
      isConnected = true;
      console.log('WebSocket connection established successfully');
    }
    
    if (info.action === 'error') {
      console.error(`WebSocket error:`, info.error);
    }
    
    if (info.action === 'disconnect') {
      isConnected = false;
      console.log(`WebSocket connection closed: ${info.reason || 'unknown reason'}`);
    }
  });
  
  // Check if the Besu node is available and responding
  try {
    const networkInfo = await provider.getNetwork();
    const blockNumber = await provider.getBlockNumber();
    console.log(`Connected to network: ${networkInfo.name}, chainId: ${networkInfo.chainId}`);
    console.log(`Current block number: ${blockNumber}`);
  } catch (error) {
    console.error(`Failed to connect to Besu node at ${besuRpc}:`, error.message);
    console.error('Please ensure your Besu node is running and accessible with WebSocket support.');
    process.exit(1);
  }
  
  const adminWallet = new ethers.Wallet(adminPrivateKey, provider);
  console.log("Using admin account:", adminWallet.address);
  
  // Check admin account balance to ensure it has funds for transactions
  const balance = await provider.getBalance(adminWallet.address);
  console.log(`Admin account balance: ${ethers.formatEther(balance)} ETH`);

  // Check nonce to ensure admin can send transactions
  const nonce = await provider.getTransactionCount(adminWallet.address);
  console.log(`Admin account nonce: ${nonce}`);
  
  if (balance === 0n) {
    console.warn('⚠️ Warning: Admin account has zero balance, transactions may fail');
  }

  // Use a complete ABI for RoleControl contract
  const roleControlAbi = [
    {
      "inputs": [
        {
          "internalType": "uint8",
          "name": "role",
          "type": "uint8"
        },
        {
          "internalType": "address",
          "name": "account",
          "type": "address"
        }
      ],
      "name": "assignRole",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "account",
          "type": "address"
        }
      ],
      "name": "getRole",
      "outputs": [
        {
          "internalType": "uint8",
          "name": "",
          "type": "uint8"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint8",
          "name": "role",
          "type": "uint8"
        }
      ],
      "name": "getRoleCount",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint8",
          "name": "role",
          "type": "uint8"
        },
        {
          "internalType": "address",
          "name": "account",
          "type": "address"
        }
      ],
      "name": "hasRole",
      "outputs": [
        {
          "internalType": "bool",
          "name": "",
          "type": "bool"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "account",
          "type": "address"
        }
      ],
      "name": "isIssuer",
      "outputs": [],
      "stateMutability": "view",
      "type": "function"
    }
  ];
  
  // Create contract instance with the full ABI
  const roleControl = new ethers.Contract(roleControlAddress, roleControlAbi, adminWallet);
  
  // Log some diagnostics
  console.log("RoleControl contract successfully connected at:", roleControlAddress);
  
  // Check if admin has necessary permissions
  try {
    const adminRole = await roleControl.getRole(adminWallet.address);
    console.log("Admin account has role:", adminRole.toString());
    
    const canAssignRoles = await roleControl.hasRole(trusteeRole, adminWallet.address);
    if (!canAssignRoles) {
      console.warn("⚠️ Warning: Admin account does not have TRUSTEE role and may not be able to assign roles");
    } else {
      console.log("✅ Admin account has TRUSTEE role and can assign roles");
    }
  } catch (error) {
    console.error("Error checking admin permissions:", error.message);
  }

  for (const account of workerAccounts) {
    console.log(`\nProcessing account ${account}...`);
    
    try {
      // First check if the address already has any role
      const currentRole = await roleControl.getRole(account);
      console.log(`Current role for ${account}: ${currentRole.toString()}`);

      // Check if account already has the ISSUER role specifically
      const hasRole = await roleControl.hasRole(issuerRole, account);
      
      if (hasRole) {
        console.log(`✅ Account ${account} already has ISSUER role, skipping...`);
        continue;
      }

      // Set transaction options
      const txOptions = {
        gasLimit: 200000,
        gasPrice: ethers.parseUnits("10", "gwei")  // Use exactly 1 gwei like working script
      };

      // Perform the transaction
      console.log(`Assigning ISSUER role to ${account}...`);
      console.log("Transaction options:", {
        gasLimit: txOptions.gasLimit.toString(),
        gasPrice: ethers.formatUnits(txOptions.gasPrice, "gwei") + " gwei"
      });
      
      try {
        // Try to execute the transaction
        const tx = await roleControl.assignRole(issuerRole, account, txOptions);
        console.log(`Transaction hash: ${tx.hash}`);
        console.log(`Waiting for transaction confirmation...`);
        
        // Listen for pending transaction using WebSocket subscription
        console.log(`Monitoring transaction status via WebSocket...`);
        
        // Set up a promise that completes when the transaction is confirmed
        const receipt = await new Promise((resolve, reject) => {
          // Set a reasonable timeout for transaction confirmation
          const timeout = setTimeout(() => {
            reject(new Error('Transaction confirmation timeout after 60 seconds'));
          }, 60000);
          
          // Wait for the transaction receipt
          tx.wait().then(receipt => {
            clearTimeout(timeout);
            resolve(receipt);
          }).catch(error => {
            clearTimeout(timeout);
            reject(error);
          });
          
          // Track blocks differently to avoid WebSocket access issues
          console.log("Waiting for transaction to be mined...");
          
          // Set up an interval to check for new blocks instead of using events
          let lastBlockNumber = 0;
          const blockCheck = setInterval(async () => {
            try {
              const currentBlock = await provider.getBlockNumber();
              if (currentBlock > lastBlockNumber) {
                console.log(`New block detected: ${currentBlock} (waiting for tx confirmation...)`);
                lastBlockNumber = currentBlock;
              }
            } catch (err) {
              console.log(`Error checking block number: ${err.message}`);
            }
          }, 2000); // Check every 2 seconds
          
          // Clean up the interval when done
          tx.wait().finally(() => {
            clearInterval(blockCheck);
          });
        });
        
        console.log(`Transaction confirmed in block: ${receipt.blockNumber}`);
        console.log(`Gas used: ${receipt.gasUsed.toString()}`);
        
        // Verify the role was assigned correctly
        const assignedRole = await roleControl.getRole(account);
        const roleVerified = await roleControl.hasRole(issuerRole, account);
        
        console.log(`\n----- ROLE ASSIGNMENT RESULTS -----`);
        console.log(`Address: ${account}`);
        console.log(`Assigned Role (enum value): ${assignedRole.toString()}`);
        console.log(`Has ISSUER role: ${roleVerified}`);
        console.log(`----------------------------------`);
        
        if (roleVerified) {
          console.log(`✅ ISSUER role successfully assigned to ${account}!`);
        } else {
          console.log(`❌ Role assignment failed for ${account}`);
        }
      } catch (error) {
        console.error(`Error during transaction confirmation: ${error.message}`);
        console.error(`Transaction may still be pending. Check hash: ${tx ? tx.hash : 'unknown'}`);
        throw error;
      }
    } catch (error) {
      console.error(`❌ Failed to process ${account}: ${error.message}`);
      continue;
    }
  }
  
  // Close the WebSocket connection when we're done
  console.log("\nAll accounts processed, closing WebSocket connection...");
  try {
    // Use the safer provider.destroy() method instead of directly accessing WebSocket
    await provider.destroy();
    console.log("WebSocket connection closed.");
  } catch (error) {
    console.log("Error closing WebSocket connection:", error.message);
  }
}

// Execute the main function and handle any errors
main()
  .catch(console.error)
  .finally(() => {
    // Ensure the process exits even if WebSocket doesn't close properly
    setTimeout(() => {
      console.log("Forcing process exit after script completion");
      process.exit(0);
    }, 1000);
  });
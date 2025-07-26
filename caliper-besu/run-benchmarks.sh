#!/bin/bash

# Extract contract ABIs
echo "Extracting contract ABIs..."
# You may need to adjust these paths based on your setup
cp ../smart_contracts/artifacts/contracts/auth/RoleControl.sol/RoleControl.json benchmarks/contracts/
cp ../smart_contracts/artifacts/contracts/did/DidRegistry.sol/DidRegistry.json benchmarks/contracts/
cp ../smart_contracts/artifacts/contracts/vc/CredentialRegistry.sol/CredentialRegistry.json benchmarks/contracts/

# Create a script to check if Besu is ready
# cat >check-besu.js <<'EOL'
# const { Web3 } = require('web3');
# const axios = require('axios');
#
# async function main() {
#     try {
#         // Try to connect to the node
#         const web3 = new Web3('http://localhost:8545');
#
#         // Check if node is synced
#         const syncing = await web3.eth.isSyncing();
#         if (syncing !== false) {
#             console.error('Node is still syncing');
#             process.exit(1);
#         }
#
#         // Check block height
#         const blockNumber = await web3.eth.getBlockNumber();
#         console.log(`Current block number: ${blockNumber}`);
#
#         // Check if node is mining
#         const metrics = await axios.get('http://localhost:3000/d/XE4V0WGZz/besu-overview?orgId=1&refresh=10s&from=now-30m&to=now&var-system=All');
#
#         console.log('Besu node is ready for benchmarking!');
#         process.exit(0);
#     } catch (error) {
#         console.error('Error checking Besu node:', error.message);
#         process.exit(1);
#     }
# }
#
# main();
# EOL

# Check if Besu is ready
echo "Checking if Besu node is ready..."
node check-besu.js
if [ $? -ne 0 ]; then
  echo "Besu node is not ready. Please make sure it's running and synced."
  exit 1
fi

# Bind Caliper to Ethereum
echo "Binding Caliper to Besu..."
# Use the correct binding syntax with version
caliper bind --caliper-bind-sut besu:latest --caliper-bind-cwd ./ --caliper-bind-args="-g"

# Run the benchmarks with CLIQUE-specific settings
echo "Running benchmarks optimized for CLIQUE consensus..."
caliper launch manager \
  --caliper-workspace ./ \
  --caliper-benchconfig benchmarks/config.yaml \
  --caliper-networkconfig networks/ethereum/besu-network.json \
  --caliper-flow-skip-install \
  --caliper-report-name "ssi-clique-benchmark-$(date +%Y%m%d-%H%M%S)" \
  --caliper-worker-remote=false

echo "Benchmarking complete! Check the report HTML file for results."
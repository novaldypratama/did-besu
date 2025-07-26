// diagnose-abi-issues.js - ABI Diagnostic Script
'use strict';

const fs = require('fs');
const path = require('path');

console.log('🔍 SSI Caliper ABI Diagnostic Tool');
console.log('=====================================\n');

// Configuration
const CONTRACTS_DIR = 'benchmarks/contracts';
const NETWORK_CONFIG = 'networks/ethereum/besu-network.json';
const BENCHMARK_CONFIG = 'benchmarks/config.yaml';

const EXPECTED_CONTRACTS = [
  'RoleControl.json',
  'DidRegistry.json',
  'CredentialRegistry.json'
];

const EXPECTED_ABI_FUNCTIONS = {
  'RoleControl.json': ['assignRole', 'revokeRole', 'getRole', 'hasRole'],
  'DidRegistry.json': ['createDid', 'updateDid', 'deactivateDid', 'resolveDid'],
  'CredentialRegistry.json': ['issueCredential', 'updateCredentialStatus', 'resolveCredential']
};

// Diagnostic functions
function checkDirectory(dirPath) {
  console.log(`📁 Checking directory: ${dirPath}`);

  if (!fs.existsSync(dirPath)) {
    console.log(`❌ Directory does not exist: ${dirPath}`);
    return false;
  }

  const files = fs.readdirSync(dirPath);
  console.log(`✅ Directory exists with ${files.length} files`);
  console.log(`   Files: ${files.join(', ')}\n`);
  return true;
}

function checkContractFile(filePath) {
  console.log(`📋 Checking contract file: ${filePath}`);

  if (!fs.existsSync(filePath)) {
    console.log(`❌ File does not exist: ${filePath}\n`);
    return false;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const contractData = JSON.parse(content);

    // Check for required fields
    const requiredFields = ['abi', 'bytecode', 'contractName'];
    const missingFields = requiredFields.filter(field => !contractData[field]);

    if (missingFields.length > 0) {
      console.log(`❌ Missing required fields: ${missingFields.join(', ')}`);
      return false;
    }

    console.log(`✅ Valid JSON structure`);
    console.log(`   Contract Name: ${contractData.contractName}`);
    console.log(`   ABI Functions: ${contractData.abi.length}`);

    // Check specific functions
    const contractName = path.basename(filePath);
    if (EXPECTED_ABI_FUNCTIONS[contractName]) {
      const expectedFunctions = EXPECTED_ABI_FUNCTIONS[contractName];
      const abiFunctions = contractData.abi
        .filter(item => item.type === 'function')
        .map(item => item.name);

      console.log(`   Expected Functions: ${expectedFunctions.join(', ')}`);
      console.log(`   Found Functions: ${abiFunctions.join(', ')}`);

      const missingFunctions = expectedFunctions.filter(func => !abiFunctions.includes(func));
      if (missingFunctions.length > 0) {
        console.log(`⚠️  Missing functions: ${missingFunctions.join(', ')}`);
      } else {
        console.log(`✅ All expected functions present`);
      }
    }

    console.log('');
    return true;

  } catch (error) {
    console.log(`❌ Error parsing JSON: ${error.message}\n`);
    return false;
  }
}

function checkNetworkConfig() {
  console.log(`🌐 Checking network configuration: ${NETWORK_CONFIG}`);

  if (!fs.existsSync(NETWORK_CONFIG)) {
    console.log(`❌ Network config does not exist: ${NETWORK_CONFIG}\n`);
    return false;
  }

  try {
    const content = fs.readFileSync(NETWORK_CONFIG, 'utf8');
    const config = JSON.parse(content);

    if (!config.ethereum || !config.ethereum.contracts) {
      console.log(`❌ Invalid network config structure\n`);
      return false;
    }

    console.log(`✅ Network config loaded successfully`);

    const contracts = config.ethereum.contracts;
    console.log(`   Configured contracts: ${Object.keys(contracts).join(', ')}`);

    // Check contract paths
    let allPathsValid = true;
    for (const [contractName, contractConfig] of Object.entries(contracts)) {
      const contractPath = contractConfig.path;
      console.log(`   ${contractName}: ${contractPath}`);

      if (!fs.existsSync(contractPath)) {
        console.log(`     ❌ Path does not exist: ${contractPath}`);
        allPathsValid = false;
      } else {
        console.log(`     ✅ Path exists`);
      }
    }

    console.log('');
    return allPathsValid;

  } catch (error) {
    console.log(`❌ Error parsing network config: ${error.message}\n`);
    return false;
  }
}

function generateFixCommands() {
  console.log('🔧 Suggested Fix Commands:');
  console.log('========================\n');

  console.log('1. Create missing directory:');
  console.log('   mkdir -p benchmarks/contracts\n');

  console.log('2. Copy contract ABIs (adjust paths as needed):');
  console.log('   cp ../smart_contracts/artifacts/contracts/auth/RoleControl.sol/RoleControl.json benchmarks/contracts/');
  console.log('   cp ../smart_contracts/artifacts/contracts/did/DidRegistry.sol/DidRegistry.json benchmarks/contracts/');
  console.log('   cp ../smart_contracts/artifacts/contracts/vc/CredentialRegistry.sol/CredentialRegistry.json benchmarks/contracts/\n');

  console.log('3. Verify smart contracts are compiled:');
  console.log('   cd ../smart_contracts && npm run compile\n');

  console.log('4. Check if source files exist:');
  console.log('   ls -la ../smart_contracts/artifacts/contracts/\n');
}

// Main diagnostic routine
async function main() {
  let issuesFound = 0;

  // Check contracts directory
  if (!checkDirectory(CONTRACTS_DIR)) {
    issuesFound++;
  }

  // Check each expected contract file
  for (const contractFile of EXPECTED_CONTRACTS) {
    const filePath = path.join(CONTRACTS_DIR, contractFile);
    if (!checkContractFile(filePath)) {
      issuesFound++;
    }
  }

  // Check network configuration
  if (!checkNetworkConfig()) {
    issuesFound++;
  }

  // Final summary
  console.log('📊 Diagnostic Summary:');
  console.log('======================');

  if (issuesFound === 0) {
    console.log('✅ All checks passed! Your ABI setup looks correct.');
    console.log('   If you\'re still getting errors, the issue might be:');
    console.log('   - Network connectivity to Besu');
    console.log('   - Contract deployment addresses');
    console.log('   - Workload module implementation');
  } else {
    console.log(`❌ Found ${issuesFound} issues that need to be fixed.`);
    console.log('');
    generateFixCommands();
  }

  console.log('\n🔍 To run this diagnostic again: node diagnose-abi-issues.js');
}

// Handle errors gracefully
process.on('uncaughtException', (error) => {
  console.error('💥 Unexpected error during diagnosis:', error.message);
  process.exit(1);
});

// Run the diagnostic
main().catch(error => {
  console.error('💥 Diagnostic failed:', error.message);
  process.exit(1);
});

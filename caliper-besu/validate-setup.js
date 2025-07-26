#!/usr/bin/env node

/**
 * SSI Caliper Setup Validation Script
 * Validates that all required components are properly configured
 */

const fs = require('fs');
const path = require('path');
const { Web3 } = require('web3');

class SSISetupValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.success = [];
  }

  log(level, message) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`);

    switch (level) {
      case 'error': this.errors.push(message); break;
      case 'warning': this.warnings.push(message); break;
      case 'success': this.success.push(message); break;
    }
  }

  /**
   * Validate file existence
   */
  validateFileExists(filePath, description) {
    if (fs.existsSync(filePath)) {
      this.log('success', `✅ ${description} exists: ${filePath}`);
      return true;
    } else {
      this.log('error', `❌ ${description} missing: ${filePath}`);
      return false;
    }
  }

  /**
   * Validate JSON file and return parsed content
   */
  validateJSON(filePath, description) {
    if (!this.validateFileExists(filePath, description)) {
      return null;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(content);
      this.log('success', `✅ ${description} is valid JSON`);
      return parsed;
    } catch (error) {
      this.log('error', `❌ ${description} has invalid JSON: ${error.message}`);
      return null;
    }
  }

  /**
   * Validate network configuration
   */
  validateNetworkConfig() {
    console.log('\n🔍 Validating Network Configuration...');

    const networkPath = 'networks/ethereum/besu-network.json';
    const networkConfig = this.validateJSON(networkPath, 'Network configuration');

    if (!networkConfig) return false;

    // Check required fields
    const requiredFields = ['caliper', 'ethereum'];
    for (const field of requiredFields) {
      if (!networkConfig[field]) {
        this.log('error', `❌ Missing required field: ${field}`);
        return false;
      }
    }

    // Check ethereum configuration
    const eth = networkConfig.ethereum;
    const requiredEthFields = ['url', 'contracts'];
    for (const field of requiredEthFields) {
      if (!eth[field]) {
        this.log('error', `❌ Missing required ethereum field: ${field}`);
        return false;
      }
    }

    // Check SSI contracts
    const requiredContracts = ['RoleControl', 'DidRegistry', 'CredentialRegistry'];
    for (const contractName of requiredContracts) {
      if (!eth.contracts[contractName]) {
        this.log('error', `❌ Missing contract: ${contractName}`);
        return false;
      }

      const contract = eth.contracts[contractName];
      if (!contract.abi || !Array.isArray(contract.abi)) {
        this.log('error', `❌ Contract ${contractName} missing or invalid ABI`);
        return false;
      }

      if (!contract.address) {
        this.log('warning', `⚠️  Contract ${contractName} missing address - will need deployment`);
      }

      this.log('success', `✅ Contract ${contractName} properly configured`);
    }

    return true;
  }

  /**
   * Validate benchmark configuration
   */
  validateBenchmarkConfig() {
    console.log('\n🔍 Validating Benchmark Configuration...');

    const configPath = 'benchmarks/config.yaml';

    if (!this.validateFileExists(configPath, 'Benchmark configuration')) {
      return false;
    }

    // For YAML, we'll do a basic syntax check
    try {
      const content = fs.readFileSync(configPath, 'utf8');

      // Check for required sections
      const requiredSections = ['ssiArgs:', 'test:', 'rounds:'];
      for (const section of requiredSections) {
        if (!content.includes(section)) {
          this.log('error', `❌ Missing required section: ${section}`);
          return false;
        }
      }

      this.log('success', '✅ Benchmark configuration syntax appears valid');
      return true;
    } catch (error) {
      this.log('error', `❌ Error reading benchmark config: ${error.message}`);
      return false;
    }
  }

  /**
   * Validate workload modules
   */
  validateWorkloadModules() {
    console.log('\n🔍 Validating Workload Modules...');

    const workloadPaths = [
      'workloads/utils/ssi-operation-base.js',
      'workloads/utils/ssi-state-manager.js',
      'workloads/auth/assignRole.js',
      'workloads/did/createDid.js'
    ];

    let allValid = true;
    for (const workloadPath of workloadPaths) {
      if (!this.validateFileExists(workloadPath, `Workload module`)) {
        allValid = false;
      }
    }

    return allValid;
  }

  /**
   * Validate Besu connection
   */
  async validateBesuConnection() {
    console.log('\n🔍 Validating Besu Connection...');

    try {
      // Load network config to get URL
      const networkConfig = JSON.parse(fs.readFileSync('networks/ethereum/besu-network.json', 'utf8'));
      const besuUrl = networkConfig.ethereum.url;

      this.log('info', `Attempting to connect to Besu at: ${besuUrl}`);

      const web3 = new Web3(besuUrl);

      // Test basic connection
      const blockNumber = await web3.eth.getBlockNumber();
      this.log('success', `✅ Connected to Besu! Current block: ${blockNumber}`);

      // Test account access
      const accounts = await web3.eth.getAccounts();
      this.log('success', `✅ Found ${accounts.length} accounts`);

      // Validate configured accounts exist
      if (networkConfig.ethereum.accounts) {
        for (let i = 0; i < networkConfig.ethereum.accounts.length; i++) {
          const configuredAccount = networkConfig.ethereum.accounts[i].address.toLowerCase();
          const nodeAccounts = accounts.map(acc => acc.toLowerCase());

          if (nodeAccounts.includes(configuredAccount)) {
            this.log('success', `✅ Account ${i}: ${configuredAccount} available on node`);
          } else {
            this.log('warning', `⚠️  Account ${i}: ${configuredAccount} not found on node`);
          }
        }
      }

      // Test contract addresses if provided
      const contracts = networkConfig.ethereum.contracts;
      for (const [contractName, contractConfig] of Object.entries(contracts)) {
        if (contractConfig.address) {
          const code = await web3.eth.getCode(contractConfig.address);
          if (code && code !== '0x') {
            this.log('success', `✅ Contract ${contractName} deployed at ${contractConfig.address}`);
          } else {
            this.log('warning', `⚠️  Contract ${contractName} not found at ${contractConfig.address}`);
          }
        }
      }

      return true;
    } catch (error) {
      this.log('error', `❌ Besu connection failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Validate directory structure
   */
  validateDirectoryStructure() {
    console.log('\n🔍 Validating Directory Structure...');

    const requiredDirs = [
      'benchmarks',
      'workloads',
      'workloads/utils',
      'workloads/auth',
      'workloads/did',
      'networks',
      'networks/ethereum'
    ];

    let allValid = true;
    for (const dir of requiredDirs) {
      if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
        this.log('success', `✅ Directory exists: ${dir}`);
      } else {
        this.log('error', `❌ Directory missing: ${dir}`);
        allValid = false;
      }
    }

    return allValid;
  }

  /**
   * Run all validations
   */
  async runValidation() {
    console.log('🚀 Starting SSI Caliper Setup Validation...\n');

    const validations = [
      () => this.validateDirectoryStructure(),
      () => this.validateNetworkConfig(),
      () => this.validateBenchmarkConfig(),
      () => this.validateWorkloadModules(),
      () => this.validateBesuConnection()
    ];

    let allPassed = true;
    for (const validation of validations) {
      try {
        const result = await validation();
        if (!result) allPassed = false;
      } catch (error) {
        this.log('error', `Validation failed: ${error.message}`);
        allPassed = false;
      }
    }

    // Print summary
    console.log('\n📊 Validation Summary:');
    console.log(`✅ Successes: ${this.success.length}`);
    console.log(`⚠️  Warnings: ${this.warnings.length}`);
    console.log(`❌ Errors: ${this.errors.length}`);

    if (this.errors.length > 0) {
      console.log('\n🔥 Critical Issues to Fix:');
      this.errors.forEach(error => console.log(`  - ${error}`));
    }

    if (this.warnings.length > 0) {
      console.log('\n⚠️  Warnings to Consider:');
      this.warnings.forEach(warning => console.log(`  - ${warning}`));
    }

    console.log(`\n${allPassed ? '🎉' : '💥'} Validation ${allPassed ? 'PASSED' : 'FAILED'}`);

    if (allPassed) {
      console.log('\nYour SSI Caliper setup is ready for benchmarking! 🚀');
    } else {
      console.log('\nPlease fix the issues above before running benchmarks.');
    }

    return allPassed;
  }
}

// Run validation if called directly
if (require.main === module) {
  const validator = new SSISetupValidator();
  validator.runValidation()
    .then(success => process.exit(success ? 0 : 1))
    .catch(error => {
      console.error('Validation script failed:', error);
      process.exit(1);
    });
}

module.exports = SSISetupValidator;

'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');
const fs = require('fs');

/**
 * Diagnostic workload module for debugging Caliper network configuration
 */
class DiagnosticWorkload extends WorkloadModuleBase {
    constructor() {
        super();
    }

    /**
     * Initialize the workload module and dump configuration details
     */
    async initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext) {
        await super.initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext);
        
        console.log('======= CALIPER DIAGNOSTIC INFORMATION =======');
        console.log(`Worker ID: ${workerIndex}`);
        console.log(`Round Index: ${roundIndex}`);
        
        console.log('\n=== SUT Context Structure ===');
        this.dumpStructure('sutContext', sutContext);
        
        console.log('\n=== SUT Adapter Information ===');
        // Safely check adapter properties
        try {
            console.log(`Adapter Type: ${sutAdapter.constructor.name}`);
            console.log(`Adapter Methods: ${Object.getOwnPropertyNames(Object.getPrototypeOf(sutAdapter))}`);
            
            if (typeof sutAdapter.getContext === 'function') {
                console.log('\n=== Adapter Context ===');
                const adapterContext = sutAdapter.getContext();
                this.dumpStructure('adapterContext', adapterContext);
            }
        } catch (error) {
            console.log(`Error examining adapter: ${error.message}`);
        }
        
        console.log('\n=== Round Arguments ===');
        this.dumpStructure('roundArguments', roundArguments);
        
        // Check for network configuration file
        try {
            console.log('\n=== Direct Network Config File Check ===');
            // Attempt to locate and read the network config file
            const possibleLocations = [
                './networks/ethereum/besu-network.json',
                './besu-network.json',
                './networks/besu-network.json'
            ];
            
            for (const location of possibleLocations) {
                try {
                    if (fs.existsSync(location)) {
                        console.log(`Network config file found at: ${location}`);
                        const fileContent = fs.readFileSync(location, 'utf8');
                        const config = JSON.parse(fileContent);
                        console.log(`Config structure: ${JSON.stringify(Object.keys(config))}`);
                        
                        if (config.ethereum) {
                            console.log(`Ethereum config found with keys: ${JSON.stringify(Object.keys(config.ethereum))}`);
                            
                            if (config.ethereum.accounts) {
                                console.log(`Found ${config.ethereum.accounts.length} accounts in file configuration`);
                            }
                            
                            if (config.ethereum.fromAddress) {
                                console.log(`Found fromAddress in file: ${config.ethereum.fromAddress}`);
                            }
                            
                            if (config.ethereum.contractDeployerAddresses) {
                                console.log(`Found ${config.ethereum.contractDeployerAddresses.length} contractDeployerAddresses`);
                            }
                        }
                    }
                } catch (fileError) {
                    console.log(`Error reading ${location}: ${fileError.message}`);
                }
            }
        } catch (error) {
            console.log(`Error checking network config files: ${error.message}`);
        }
        
        console.log('======= END DIAGNOSTIC INFORMATION =======');
        
        // For this diagnostic module, we'll use a default account
        this.accounts = ['0x21307fd33e7daebeff0c4bead2a4976527dc5c71'];
    }
    
    /**
     * Helper to safely dump object structure
     */
    dumpStructure(name, obj, level = 0) {
        if (level > 3) {
            console.log(`${name}: [Object nested too deep]`);
            return;
        }
        
        if (obj === null || obj === undefined) {
            console.log(`${name}: ${obj}`);
            return;
        }
        
        if (typeof obj !== 'object') {
            console.log(`${name}: ${obj} (${typeof obj})`);
            return;
        }
        
        if (Array.isArray(obj)) {
            console.log(`${name}: Array with ${obj.length} items`);
            if (obj.length > 0 && typeof obj[0] !== 'object') {
                console.log(`${name} contents: ${JSON.stringify(obj)}`);
            } else if (obj.length > 0) {
                obj.slice(0, 2).forEach((item, i) => {
                    this.dumpStructure(`${name}[${i}]`, item, level + 1);
                });
                if (obj.length > 2) {
                    console.log(`${name}: ... (${obj.length - 2} more items)`);
                }
            }
            return;
        }
        
        const keys = Object.keys(obj);
        console.log(`${name}: Object with ${keys.length} properties: ${JSON.stringify(keys)}`);
        
        keys.forEach(key => {
            try {
                this.dumpStructure(`${name}.${key}`, obj[key], level + 1);
            } catch (error) {
                console.log(`Error dumping ${name}.${key}: ${error.message}`);
            }
        });
    }

    /**
     * Simple dummy transaction
     */
    async submitTransaction() {
        return 'diagnostic-transaction';
    }
}

/**
 * Create a new instance of the workload module
 * @return {DiagnosticWorkload}
 */
function createWorkloadModule() {
    return new DiagnosticWorkload();
}

module.exports.createWorkloadModule = createWorkloadModule;
'use strict';

const OperationBase = require('./utils/operation-base');
const SimpleState = require('./utils/simple-state');

/**
 * Workload module for querying various accounts.
 */
class Query extends OperationBase {
    /**
     * Initializes the parameters of the workload.
     */
    constructor() {
        super();
    }

    /**
     * Create a pre-configured state representation.
     * @return {SimpleState} The state instance.
     */
    createSimpleState() {
        const accountsPerWorker = this.numberOfAccounts / this.totalWorkers;
        return new SimpleState(this.workerIndex, this.initialMoney, this.moneyToTransfer, accountsPerWorker);
    }

    /**
     * Assemble TXs for querying accounts.
     * @async
     */
    async submitTransaction() {
        const queryArgs = this.simpleState.getQueryArguments();
        await this.sutAdapter.sendRequests(this.createConnectorRequest('query', queryArgs));
        console.log(`Query Account: ${JSON.stringify(queryArgs)}`);
    }
}

/**
 * Create a new instance of the workload module.
 * @return {WorkloadModuleInterface}
 */
function createWorkloadModule() {
    return new Query();
}

module.exports.createWorkloadModule = createWorkloadModule;
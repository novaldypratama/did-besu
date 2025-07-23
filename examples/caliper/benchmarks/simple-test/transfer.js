'use strict';

const OperationBase = require('./utils/operation-base');
const SimpleState = require('./utils/simple-state');

/**
 * Workload module for transferring money between accounts.
 */
class Transfer extends OperationBase {
    /**
     * Initializes the instance.
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
     * Assemble TXs for transferring money.
     * @async
     */
    async submitTransaction() {
        const transferArgs = this.simpleState.getTransferArguments();
        await this.sutAdapter.sendRequests(this.createConnectorRequest('transfer', transferArgs));
        console.log(`Transfer done: ${JSON.stringify(transferArgs)}`);
    }
}

/**
 * Create a new instance of the workload module.
 * @return {WorkloadModuleInterface}
 */
function createWorkloadModule() {
    return new Transfer();
}

module.exports.createWorkloadModule = createWorkloadModule;
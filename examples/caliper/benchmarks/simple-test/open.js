'use strict';

const OperationBase = require('./utils/operation-base');
const SimpleState = require('./utils/simple-state');

/**
 * Workload module for initializing the SUT with various accounts.
 */
class Open extends OperationBase {
    /**
     * Initializes the parameters of the workload.
     */
    constructor() {
        super();
    }

    /**
     * Create an empty state representation.
     * @return {SimpleState} The state instance.
     */
    createSimpleState() {
        return new SimpleState(this.workerIndex, this.initialMoney, this.moneyToTransfer);
    }

    /**
     * Assemble TXs for opening new accounts.
     * @async
     */
    async submitTransaction() {
        let createArgs = this.simpleState.getOpenAccountArguments();
        await this.sutAdapter.sendRequests(this.createConnectorRequest('open', createArgs));
        console.log(`Account created with arguments: ${JSON.stringify(createArgs)}`);
    }
}

/**
 * Create a new instance of the workload module.
 * @return {WorkloadModuleInterface}
 */
function createWorkloadModule() {
    return new Open();
}

module.exports.createWorkloadModule = createWorkloadModule;
'use strict';

const Dictionary = 'abcdefghijklmnopqrstuvwxyz';

/**
 * Class for managing simple account states.
 */
class SimpleState {
    /**
     * Initializes the instance.
     * @param {number} workerIndex 
     * @param {number} initialMoney 
     * @param {number} moneyToTransfer 
     * @param {number} accounts 
     */
    constructor(workerIndex, initialMoney, moneyToTransfer, accounts = 0) {
        this.accountsGenerated = accounts;
        this.initialMoney = initialMoney;
        this.moneyToTransfer = moneyToTransfer;
        this.accountPrefix = this._get26Num(workerIndex);
    }

    /**
     * Generate string by picking characters from the dictionary variable.
     * @param {number} number Character to select.
     * @returns {string} Generated string based on the input number.
     * @private
     */
    _get26Num(number) {
        let result = '';
        while (number > 0) {
            result += Dictionary.charAt(number % Dictionary.length);
            number = parseInt(number / Dictionary.length);
        }
        return result;
    }

    /**
     * Construct an account key from its index.
     * @param {number} index The account index.
     * @return {string} The account key.
     * @private
     */
    _getAccountKey(index) {
        return this.accountPrefix + this._get26Num(index);
    }

    /**
     * Returns a random account key.
     * @return {string} Account key.
     * @private
     */
    _getRandomAccount() {
        const index = Math.ceil(Math.random() * this.accountsGenerated);
        return this._getAccountKey(index);
    }

    /**
     * Get the arguments for creating a new account.
     * @returns {object} The account arguments.
     */
    getOpenAccountArguments() {
        this.accountsGenerated++;
        return {
            account: this._getAccountKey(this.accountsGenerated),
            money: this.initialMoney
        };
    }

    /**
     * Get the arguments for querying an account.
     * @returns {object} The account arguments.
     */
    getQueryArguments() {
        return {
            account: this._getRandomAccount()
        };
    }

    /**
     * Get the arguments for transferring money between accounts.
     * @returns {object} The account arguments.
     */
    getTransferArguments() {
        return {
            source: this._getRandomAccount(),
            target: this._getRandomAccount(),
            amount: this.moneyToTransfer
        };
    }
}

module.exports = SimpleState;
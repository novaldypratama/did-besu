require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.28",
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545",
      chainID: 1337,
      // gas: 6500000,
      gasPrice: 1000000000,
      // Replace 'YOUR_PRIVATE_KEY' with a valid private key string (without 0x) for local testing,
      // or use an environment variable, e.g. process.env.PRIVATE_KEY
      // accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : ["b37a2494f2330ee4fdf516b38bad42b8e27e35e810abf1baf1fb51ad880872ed"]
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : ["60bbe10a196a4e71451c0f6e9ec9beab454c2a5ac0542aa5b8b733ff5719fec3"]
    }
  }
};

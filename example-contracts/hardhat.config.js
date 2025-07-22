require("@nomicfoundation/hardhat-toolbox");
//require("@nomicfoundation/hardhat-ethers");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.28",
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545",
      chainID: 1337,
      gasPrice: 20000000,
      // Replace 'YOUR_PRIVATE_KEY' with a valid private key string (without 0x) for local testing,
      // or use an environment variable, e.g. process.env.PRIVATE_KEY
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : ["b37a2494f2330ee4fdf516b38bad42b8e27e35e810abf1baf1fb51ad880872ed"]
    }
  }
};

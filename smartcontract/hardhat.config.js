require("@nomicfoundation/hardhat-toolbox");
//require("@nomicfoundation/hardhat-ethers");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.28",
  networks: {
    localhost: {
      url: "http://127.0.0.1:21001",
      chainID: 1337,
      gasPrice: 0,
      // Replace 'YOUR_PRIVATE_KEY' with a valid private key string (without 0x) for local testing,
      // or use an environment variable, e.g. process.env.PRIVATE_KEY
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : ["797bbe0373132e8c5483515b68ecbb6d3581b56f0205b653ad2b30a559e83891"]
    }
  }
};

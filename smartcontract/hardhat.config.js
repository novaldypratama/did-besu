require("@nomicfoundation/hardhat-toolbox");
//require("@nomicfoundation/hardhat-ethers");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.28",
  networks: {
    localhost: {
      url: "http://127.0.0.1:21001",
      //chainID: 1337,
      // Replace 'YOUR_PRIVATE_KEY' with a valid private key string (without 0x) for local testing,
      // or use an environment variable, e.g. process.env.PRIVATE_KEY
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : ["d2d2a47b83a3059379ea3de28245e1c864b07e41b2777307f42206a3d4af3a51"]
    }
  }
};

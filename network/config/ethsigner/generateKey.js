// Don't forget to use .env file for the private key!

const { ethers } = require('ethers');
const url = "http://localhost:8545"; //http://103.56.191.252:8544
const provider = new ethers.providers.JsonRpcProvider(url);
const privateKey = '69df614162f5c1ed4f00a924ece67035a86a2011a2f72a381273599e8c49a1c0';

// Function to encrypt the private key
async function encryptPrivateKey() {
  try {
    const wallet = new ethers.Wallet(privateKey, provider);
    const password = 'Password1';

    // Encrypt the wallet with the password
    const V3Keystore = await wallet.encrypt(password);
    console.log(JSON.stringify(V3Keystore, null, 2));
  } catch (error) {
    console.error('An error occured:', error.message);
  } finally {
    process.exit();
  }
}

encryptPrivateKey();

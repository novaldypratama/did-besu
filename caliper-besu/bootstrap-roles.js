
// Bootstrap script to assign TRUSTEE role
const { Web3 } = require('web3');
const roleControlABI = [
  {
    "inputs": [],
    "stateMutability": "nonpayable",
    "type": "constructor",
    "signature": ""
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "enum IRoleControl.ROLES",
        "name": "role",
        "type": "uint8"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "account",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "sender",
        "type": "address"
      }
    ],
    "name": "RoleAssigned",
    "type": "event",
    "signature": "0x47307e88f3e82b4e8cdffde5a264aa53a2ee17636fd8df7effe0a098da495656"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "enum IRoleControl.ROLES",
        "name": "role",
        "type": "uint8"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "account",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "sender",
        "type": "address"
      }
    ],
    "name": "RoleRevoked",
    "type": "event",
    "signature": "0x5a8379f4a3380f87fd5924475f76a3471ac8d775668601653e3f9ef69a3dd271"
  },
  {
    "inputs": [
      {
        "internalType": "enum IRoleControl.ROLES",
        "name": "role",
        "type": "uint8"
      },
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "assignRole",
    "outputs": [
      {
        "internalType": "enum IRoleControl.ROLES",
        "name": "",
        "type": "uint8"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function",
    "signature": "0x88a5bf6e",
    "methodNameWithInputs": "assignRole(uint8,address)"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "getRole",
    "outputs": [
      {
        "internalType": "enum IRoleControl.ROLES",
        "name": "",
        "type": "uint8"
      }
    ],
    "stateMutability": "view",
    "type": "function",
    "signature": "0x44276733",
    "methodNameWithInputs": "getRole(address)",
    "constant": true
  },
  {
    "inputs": [
      {
        "internalType": "enum IRoleControl.ROLES",
        "name": "role",
        "type": "uint8"
      }
    ],
    "name": "getRoleCount",
    "outputs": [
      {
        "internalType": "uint32",
        "name": "",
        "type": "uint32"
      }
    ],
    "stateMutability": "view",
    "type": "function",
    "signature": "0xd02971ca",
    "methodNameWithInputs": "getRoleCount(uint8)",
    "constant": true
  },
  {
    "inputs": [
      {
        "internalType": "enum IRoleControl.ROLES",
        "name": "role",
        "type": "uint8"
      },
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "hasRole",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function",
    "signature": "0x9e97b8f6",
    "methodNameWithInputs": "hasRole(uint8,address)",
    "constant": true
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "identity",
        "type": "address"
      }
    ],
    "name": "isHolder",
    "outputs": [],
    "stateMutability": "view",
    "type": "function",
    "signature": "0xd4d7b19a",
    "methodNameWithInputs": "isHolder(address)",
    "constant": true
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "identity",
        "type": "address"
      }
    ],
    "name": "isIssuer",
    "outputs": [],
    "stateMutability": "view",
    "type": "function",
    "signature": "0x877b9a67",
    "methodNameWithInputs": "isIssuer(address)",
    "constant": true
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "identity",
        "type": "address"
      }
    ],
    "name": "isTrustee",
    "outputs": [],
    "stateMutability": "view",
    "type": "function",
    "signature": "0xc784cd17",
    "methodNameWithInputs": "isTrustee(address)",
    "constant": true
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "identity",
        "type": "address"
      }
    ],
    "name": "isTrusteeOrIssuer",
    "outputs": [],
    "stateMutability": "view",
    "type": "function",
    "signature": "0x07c22ce9",
    "methodNameWithInputs": "isTrusteeOrIssuer(address)",
    "constant": true
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "identity",
        "type": "address"
      }
    ],
    "name": "isTrusteeOrIssuerOrHolder",
    "outputs": [],
    "stateMutability": "view",
    "type": "function",
    "signature": "0xaaeece67",
    "methodNameWithInputs": "isTrusteeOrIssuerOrHolder(address)",
    "constant": true
  },
  {
    "inputs": [
      {
        "internalType": "enum IRoleControl.ROLES",
        "name": "role",
        "type": "uint8"
      },
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "revokeRole",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function",
    "signature": "0x4cbb87d3",
    "methodNameWithInputs": "revokeRole(uint8,address)"
  }
];

async function bootstrap() {
  const web3 = new Web3('ws://172.16.239.15:8546');
  const contract = new web3.eth.Contract(roleControlABI, '0x1F2077A4Caa6a373A6bf628e30826Fd957C1b256');
  
  const deployerAddress = '0x06d06c366b213f716b51bca6dc1874afc05467d0';
  const deployerKey = '0xb37a2494f2330ee4fdf516b38bad42b8e27e35e810abf1baf1fb51ad880872ed';
  
  try {
    // Create transaction
    const tx = contract.methods.assignRole(3, deployerAddress); // TRUSTEE = 3
    const gas = await tx.estimateGas({ from: deployerAddress });
    
    // Sign and send
    const signedTx = await web3.eth.accounts.signTransaction({
      to: '0x1F2077A4Caa6a373A6bf628e30826Fd957C1b256',
      data: tx.encodeABI(),
      gas: gas + 10000,
      gasPrice: await web3.eth.getGasPrice()
    }, deployerKey);
    
    const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
    console.log('✅ TRUSTEE role assigned! Transaction:', receipt.transactionHash);
    
  } catch (error) {
    console.error('❌ Bootstrap failed:', error.message);
  }
}

bootstrap();

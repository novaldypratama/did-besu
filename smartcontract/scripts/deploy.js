async function main() {
  // Get the deployer's signer
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with:", deployer.address);

  // Deploy DIDRegistry contract using ethers v6 methods
  const DIDRegistry = await ethers.getContractFactory("DIDRegistry");
  const didRegistry = await DIDRegistry.deploy();
  await didRegistry.waitForDeployment();
  console.log("DIDRegistry deployed at:", didRegistry.target);

  // Deploy VCRegistry contract, passing the DIDRegistry address to its constructor
  const VCRegistry = await ethers.getContractFactory("VCRegistry");
  const vcRegistry = await VCRegistry.deploy(didRegistry.target);
  await vcRegistry.waitForDeployment();
  console.log("VCRegistry deployed at:", vcRegistry.target);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

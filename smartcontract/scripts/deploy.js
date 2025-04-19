async function main() {
  console.log("Starting deployment...");
  
  // Get the deployer's signer
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with:", deployer.address);
  
  try {
    // In ethers v6, getBalance is on the provider, not the signer
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("Deployer balance:", ethers.formatEther(balance));
  } catch (error) {
    console.error("Error checking balance:", error);
  }
  
  // Deploy with explicit gas settings
  try {
    console.log("Deploying DIDRegistry...");
    const DIDRegistry = await ethers.getContractFactory("DIDRegistry");
    
    // In ethers v6, deploy options format has changed
    const didRegistry = await DIDRegistry.deploy();
    
    console.log("Waiting for deployment transaction...");
    try {
      const deploymentTimeout = 180000; // 3 minutes
      const deployedContract = await Promise.race([
        didRegistry.waitForDeployment(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Deployment timeout after 3 minutes")), deploymentTimeout)
        )
      ]);
      console.log("DIDRegistry deployed at:", await deployedContract.getAddress());
    } catch (error) {
      console.error("Deployment failed:", error);
      process.exit(1);
    }
    
    // In ethers v6, contract address is accessed differently
    const didRegistryAddress = await didRegistry.getAddress();
    console.log("DIDRegistry deployed at:", didRegistryAddress);
    
    // Deploy CredentialRegistry
    console.log("Deploying CredentialRegistry...");
    const VCRegistry = await ethers.getContractFactory("CredentialRegistry");
    const vcRegistry = await VCRegistry.deploy(didRegistryAddress);
    
    console.log("Waiting for deployment transaction...");
    await vcRegistry.waitForDeployment();
    
    const vcRegistryAddress = await vcRegistry.getAddress();
    console.log("CredentialRegistry deployed at:", vcRegistryAddress);
  } catch (error) {
    console.error("Deployment error:", error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
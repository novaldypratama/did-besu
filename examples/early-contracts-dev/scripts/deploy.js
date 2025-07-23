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
    console.log("Deploying SimpleContract...");
    const SimpleContract = await ethers.getContractFactory("SimpleContract");

    // In ethers v6, deploy options format has changed
    const simpleContract = await SimpleContract.deploy();

    console.log("Waiting for deployment transaction...");
    try {
      const deploymentTimeout = 180000; // 3 minutes
      const deployedContract = await Promise.race([
        simpleContract.waitForDeployment(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Deployment timeout after 3 minutes")), deploymentTimeout)
        )
      ]);
      console.log("SimpleContract deployed at:", await deployedContract.getAddress());
    } catch (error) {
      console.error("Deployment failed:", error);
      process.exit(1);
    }
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

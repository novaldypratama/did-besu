// deploy.js - Optimized deployment script for SSI/DID contracts

async function main() {
  console.log("Starting SSI/DID Trust Triangle deployment...");

  // Get the deployer's signer
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // Log deployer balance
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", ethers.formatEther(balance), "ETH");

  // Define deployment parameters to optimize gas usage
  const deploymentOptions = {
    gasLimit: 5000000,  // Explicit gas limit
    gasPrice: ethers.parseUnits("50", "gwei")  // Higher gas price for faster mining
  };

  // Set a reasonable timeout for deployments
  const DEPLOYMENT_TIMEOUT = 60000; // 60 seconds

  try {
    // 1. Deploy RoleControl contract first (no dependencies)
    console.log("\n1. Deploying RoleControl...");
    const RoleControl = await ethers.getContractFactory("RoleControl");

    console.log("   Sending deployment transaction...");
    const roleControl = await RoleControl.deploy(deploymentOptions);

    console.log("   Waiting for deployment confirmation...");
    try {
      await Promise.race([
        roleControl.waitForDeployment(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("RoleControl deployment timeout")), DEPLOYMENT_TIMEOUT)
        )
      ]);

      const roleControlAddress = await roleControl.getAddress();
      console.log("✅ RoleControl deployed at:", roleControlAddress);
      console.log("   Deployer assigned TRUSTEE role by default");
    } catch (error) {
      console.error("❌ RoleControl deployment failed:", error.message);
      process.exit(1);
    }

    // 2. Deploy DidRegistry (depends on RoleControl)
    console.log("\n2. Deploying DidRegistry...");
    const DidRegistry = await ethers.getContractFactory("DidRegistry");

    const roleControlAddress = await roleControl.getAddress();
    console.log("   Using RoleControl at:", roleControlAddress);
    console.log("   Sending deployment transaction...");

    const didRegistry = await DidRegistry.deploy(
      roleControlAddress,
      deploymentOptions
    );

    console.log("   Waiting for deployment confirmation...");
    try {
      await Promise.race([
        didRegistry.waitForDeployment(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("DidRegistry deployment timeout")), DEPLOYMENT_TIMEOUT)
        )
      ]);

      const didRegistryAddress = await didRegistry.getAddress();
      console.log("✅ DidRegistry deployed at:", didRegistryAddress);
    } catch (error) {
      console.error("❌ DidRegistry deployment failed:", error.message);
      process.exit(1);
    }

    // 3. Deploy CredentialRegistry (depends on both RoleControl and DidRegistry)
    console.log("\n3. Deploying CredentialRegistry...");
    const CredentialRegistry = await ethers.getContractFactory("CredentialRegistry");

    const didRegistryAddress = await didRegistry.getAddress();
    console.log("   Using RoleControl at:", roleControlAddress);
    console.log("   Using DidRegistry at:", didRegistryAddress);
    console.log("   Sending deployment transaction...");

    const credentialRegistry = await CredentialRegistry.deploy(
      roleControlAddress,
      didRegistryAddress,
      deploymentOptions
    );

    console.log("   Waiting for deployment confirmation...");
    try {
      await Promise.race([
        credentialRegistry.waitForDeployment(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("CredentialRegistry deployment timeout")), DEPLOYMENT_TIMEOUT)
        )
      ]);

      const credentialRegistryAddress = await credentialRegistry.getAddress();
      console.log("✅ CredentialRegistry deployed at:", credentialRegistryAddress);
    } catch (error) {
      console.error("❌ CredentialRegistry deployment failed:", error.message);
      process.exit(1);
    }

    // Log deployment summary
    console.log("\n----- DEPLOYMENT SUMMARY -----");
    console.log("RoleControl:        ", await roleControl.getAddress());
    console.log("DidRegistry:        ", await didRegistry.getAddress());
    console.log("CredentialRegistry: ", await credentialRegistry.getAddress());
    console.log("-----------------------------");

    // Save deployment addresses to file for future reference
    const fs = require("fs");
    const deploymentInfo = {
      roleControl: await roleControl.getAddress(),
      didRegistry: await didRegistry.getAddress(),
      credentialRegistry: await credentialRegistry.getAddress(),
      network: network.name,
      timestamp: new Date().toISOString()
    };

    fs.writeFileSync(
      "deployment-info.json",
      JSON.stringify(deploymentInfo, null, 2)
    );
    console.log("Deployment information saved to deployment-info.json");

    return deploymentInfo;

  } catch (error) {
    console.error("Deployment failed:", error);
    process.exit(1);
  }
}

// Execute the deployment
main()
  .then((deployedContracts) => {
    console.log("Deployment completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Deployment error:", error);
    process.exit(1);
  });

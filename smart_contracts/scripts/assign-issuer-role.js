// assign-issuer-role.js - Script to assign Issuer role to an address

async function main() {
  try {
    console.log("Starting ISSUER role assignment process...");

    // Get signers (deployer has the TRUSTEE role by default)
    const [deployer] = await ethers.getSigners();
    console.log("Using admin account:", deployer.address);

    // The address to which we want to assign the ISSUER role
    // Replace this with the actual address you want to assign the role to
    const newIssuerAddress = "0x2d501ff683a6dcb43b4b12cf334ea7a9692a9f1c";
    console.log("Assigning ISSUER role to:", newIssuerAddress);

    // Load the deployed RoleControl contract
    // Replace this with your actual deployed contract address
    const roleControlAddress = "0x1F2077A4Caa6a373A6bf628e30826Fd957C1b256";
    console.log("RoleControl contract address:", roleControlAddress);

    // Get the contract instance
    const RoleControl = await ethers.getContractFactory("RoleControl");
    const roleControl = RoleControl.attach(roleControlAddress);

    // Assign ISSUER role (role = 1 as per the enum ROLES in the contract)
    console.log("\nAssigning ISSUER role...");
    const roleEnum = 1; // ISSUER role has index 1 in ROLES enum
    const tx = await roleControl.assignRole(roleEnum, newIssuerAddress);

    // Wait for the transaction to be mined
    console.log("Transaction hash:", tx.hash);
    console.log("Waiting for transaction confirmation...");
    const receipt = await tx.wait();
    console.log("Transaction confirmed in block:", receipt.blockNumber);

    // Verify the role was assigned correctly
    const assignedRole = await roleControl.getRole(newIssuerAddress);
    const hasRole = await roleControl.hasRole(roleEnum, newIssuerAddress);

    console.log("\n----- ROLE ASSIGNMENT RESULTS -----");
    console.log("Address:", newIssuerAddress);
    console.log("Assigned Role (enum value):", assignedRole);
    console.log("Has ISSUER role:", hasRole);
    console.log("----------------------------------");

    if (hasRole) {
      console.log("✅ ISSUER role successfully assigned!");
    } else {
      console.log("❌ Role assignment failed!");
    }

  } catch (error) {
    console.error("Error during role assignment:", error);
    process.exit(1);
  }
}

// Execute the script
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

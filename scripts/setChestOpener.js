const { ethers } = require("hardhat");

async function main() {
  // Get the deployer's account (must be the owner of ChestMinter)
  const [deployer] = await ethers.getSigners();
  console.log("Setting ChestOpener using deployer:", deployer.address);

  // Replace these with your deployed contract addresses
  const chestMinterAddress = "0x754722E020f992495fD45b9107c13d1E06b6646A"; 
  const chestOpenerAddress = "0x2012b62F2811add98A9C1cB496C5a2cda2fdd53D"; 

  // Connect to your deployed ChestMinter contract
  const chestMinter = await ethers.getContractAt("ChestMinter", chestMinterAddress, deployer);

  // Call the setChestOpener function on ChestMinter
  const tx = await chestMinter.setChestOpener(chestOpenerAddress);
  console.log("Transaction sent. Waiting for confirmation...");
  await tx.wait();

  console.log("ChestOpener has been set on ChestMinter:", chestOpenerAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error setting ChestOpener:", error);
    process.exit(1);
  });

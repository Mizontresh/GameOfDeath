const { ethers } = require("hardhat");

async function main() {
  // Get the deployer's account (must be the owner of ChestMinter)
  const [deployer] = await ethers.getSigners();
  console.log("Setting ChestOpener using deployer:", deployer.address);

  // Replace these with your deployed contract addresses
  const chestMinterAddress = "0x8D75F9F7f4F4C4eFAB9402261bC864f21DF0c649"; 
  const chestOpenerAddress = "0x0dEe24C99e8dF7f0E058F4F48f228CC07DB704Fc"; 

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

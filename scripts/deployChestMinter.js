// scripts/deployChestMinter.js
const { ethers } = require("hardhat");

async function main() {
  // Mizon token contract address (ERC20) as provided.
  const mizonTokenAddress = "0xEb2cF97CB2616f4c4a5C66ce4406B34955e57397";
  // Base URI for metadata stored on IPFS (include trailing slash).
  
  const baseURI = "ipfs://bafybeibt3pnsfi47jarhjyd7f2q67o35wjaibpjhaaganbhdapcmbn47qm/";

  // Get the contract factory for ChestMinter.
  const ChestMinter = await ethers.getContractFactory("ChestMinter");
  // Deploy the contract.
  const chestMinter = await ChestMinter.deploy(mizonTokenAddress, baseURI);
  // Wait for deployment to be complete (ethers v6).
  await chestMinter.waitForDeployment();

  console.log("ChestMinter deployed to:", chestMinter.target);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

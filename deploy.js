// scripts/deploySkinLock.js
// Hardhat deploy script for SkinLockRegistry
// This script deploys the contract and initializes the allowedNFTs mapping

const { ethers } = require("hardhat");

// List your supported NFT contract addresses here
const INITIAL_ALLOWED_NFTS = [
  "0x14f20d6f96C71479742bC3c4aeC63c2F797073D8",  // Example NFT #1
  "0x1888A5a581D63dda3Cf69Dfe5a4dea424De99DfE",
  "0xB97e4D25766a58E587F11B5667fC5E8691f1AD9e",
  // add as many as needed
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const Registry = await ethers.getContractFactory("SkinLockRegistry");
  // Pass the initial list into the constructor
  const registry = await Registry.deploy(INITIAL_ALLOWED_NFTS);
  await registry.deployed();

  console.log(`SkinLockRegistry deployed at ${registry.address}`);

  // Verify initialization
  for (const nft of INITIAL_ALLOWED_NFTS) {
    const allowed = await registry.allowedNFTs(nft);
    console.log(`  - ${nft} allowed:`, allowed);
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

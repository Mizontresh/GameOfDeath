// scripts/deploySkinLock.js
const { ethers } = require("hardhat");

// your on-chain whitelist:
const INITIAL_ALLOWED_NFTS = [
  "0x14f20d6f96C71479742bC3c4aeC63c2F797073D8",
  "0x1888A5a581D63dda3Cf69Dfe5a4dea424De99DfE",
  "0xB97e4D25766a58E587F11B5667fC5E8691f1AD9e",
  // etc…
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying SkinLockRegistry with:", deployer.address);

  const Registry = await ethers.getContractFactory("SkinLockRegistry");
  // ← note we now pass BOTH the owner _and_ the array
  const registry = await Registry.deploy(deployer.address, INITIAL_ALLOWED_NFTS);
  await registry.deployed();

  console.log("✅ SkinLockRegistry:", registry.address);

  // quick check
  for (const nft of INITIAL_ALLOWED_NFTS) {
    console.log(` • ${nft} allowed?`, await registry.allowedNFTs(nft));
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });

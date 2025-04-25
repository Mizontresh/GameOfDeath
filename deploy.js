// scripts/deploySkinLock.js
const { ethers } = require("hardhat");

// your on-chain whitelist:
const INITIAL_ALLOWED_NFTS = [
  "0x14f20d6f96C71479742bC3c4aeC63c2F797073D8",
  "0x1888A5a581D63dda3Cf69Dfe5a4dea424De99DfE",
  "0xB97e4D25766a58E587F11B5667fC5E8691f1AD9e",
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying SkinLockRegistry with owner:", deployer.address);

  const Registry = await ethers.getContractFactory("SkinLockRegistry");
  const registry = await Registry.deploy(deployer.address, INITIAL_ALLOWED_NFTS);

  // ← ethers v6
  await registry.waitForDeployment();

  console.log("✅ SkinLockRegistry deployed at:", registry.target);

  // sanity-check your whitelist
  for (const nft of INITIAL_ALLOWED_NFTS) {
    console.log(` • ${nft} allowed? →`, await registry.allowedNFTs(nft));
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });

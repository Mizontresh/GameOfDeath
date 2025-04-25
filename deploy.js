// scripts/deploySkinLock.js
const { ethers } = require("hardhat");

// your on‐chain whitelist:
const INITIAL_ALLOWED_NFTS = [
  "0x14f20d6f96C71479742bC3c4aeC63c2F797073D8",
  "0x1888A5a581D63dda3Cf69Dfe5a4dea424De99DfE",
  "0xB97e4D25766a58E587F11B5667fC5E8691f1AD9e",
  // add more as you need…
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying SkinLockRegistry with owner:", deployer.address);

  const Registry = await ethers.getContractFactory("SkinLockRegistry");
  const registry = await Registry.deploy(deployer.address, INITIAL_ALLOWED_NFTS);
  await registry.deployed();

  console.log("✅ SkinLockRegistry deployed at:", registry.address);

  // Quick sanity‐check:
  for (const nft of INITIAL_ALLOWED_NFTS) {
    const ok = await registry.allowedNFTs(nft);
    console.log(` • ${nft} allowed? →`, ok);
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });

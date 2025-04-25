// scripts/unlockSkins.js
const { ethers } = require("hardhat");

async function main() {
  // 1) signer
  const [you] = await ethers.getSigners();

  // 2) attach to your SkinLockRegistry
  const registry = await ethers.getContractAt(
    "SkinLockRegistry",
    "0xcE1684BbE01d3801e54C2725Dfd6f28A1E94f66f",  // your deployed registry
    you
  );

  // 3) Mizontresh NFT contract address
  const mizontresh = "0xB97e4D25766a58E587F11B5667fC5E8691f1AD9e";

  // 4) unlock both
  for (const tokenId of [0, 2]) {
    console.log(`🔓 Unlocking token #${tokenId}…`);
    const tx = await registry.unlockNFT(mizontresh, tokenId);
    await tx.wait();
    console.log(`✅ Unlocked token #${tokenId}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });

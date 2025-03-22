const { ethers } = require("hardhat");

async function main() {
  const GameOfDeath = await ethers.getContractFactory("GameOfDeath");
  const game = await GameOfDeath.deploy();
  await game.waitForDeployment();

  const address = await game.getAddress();
  console.log("GameOfDeath deployed to:", address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

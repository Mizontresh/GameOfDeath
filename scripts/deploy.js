// scripts/deploy.js
const { ethers } = require("hardhat");

async function main() {
  // 1) Compile if needed (optional here, but sometimes you do):
  // await hre.run("compile");

  // 2) Get the contract factory
  const GameOfDeath = await ethers.getContractFactory("GameOfDeath");

  // 3) Deploy the contract
  const gameOfDeath = await GameOfDeath.deploy();

  // 4) Wait for deployment to finish
  await gameOfDeath.waitForDeployment();

  // 5) Get the deployed address
  const address = await gameOfDeath.getAddress();
  console.log("GameOfDeath deployed to:", address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

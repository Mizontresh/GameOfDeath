/*
scripts/deploy.js
Plain JavaScript version for deploying your contracts to Hardhat (or any network).
*/
require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
const [deployer] = await ethers.getSigners();
console.log("Deploying contracts with:", deployer.address);

// Deploy GameOfDeath
const GameOfDeath = await ethers.getContractFactory("GameOfDeath");
const gameOfDeath = await GameOfDeath.deploy();
await gameOfDeath.waitForDeployment();
console.log("GameOfDeath deployed at:", await gameOfDeath.getAddress());

// Deploy Mizons
const Mizons = await ethers.getContractFactory("Mizons");
const mizons = await Mizons.deploy();
await mizons.waitForDeployment();
console.log("Mizons deployed at:", await mizons.getAddress());

// Deploy GameOfDeathBetting
const GameOfDeathBetting = await ethers.getContractFactory("GameOfDeathBetting");
const gameOfDeathBetting = await GameOfDeathBetting.deploy(deployer.address);
await gameOfDeathBetting.waitForDeployment();
console.log("GameOfDeathBetting deployed at:", await gameOfDeathBetting.getAddress());
}

main().catch((error) => {
console.error(error);
process.exitCode = 1;
});
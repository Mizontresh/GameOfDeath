// deployAll.js
require("dotenv").config();
const fs     = require("fs");
const path   = require("path");
const dotenv = require("dotenv");
const { ethers } = require("hardhat");

// Generic deploy helper using Ethers v6
async function deploy(name, ...args) {
  console.log(`🔨 Deploying ${name}…`);
  const Factory  = await ethers.getContractFactory(name);
  const contract = await Factory.deploy(...args);
  await contract.waitForDeployment();
  console.log(`✅  ${name} deployed to:`, contract.target);
  return contract;
}

async function main() {
  // 0. Deployer
  const [deployer] = await ethers.getSigners();
  console.log(`\n👤 Deploying with account: ${deployer.address}`);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`💰 Balance: ${ethers.formatEther(balance)} ETH\n`);

  // 1. Core contracts
  const game    = await deploy("GameOfDeath");
  const mizons  = await deploy("Mizons", deployer.address);
  const betting = await deploy("GameOfDeathBetting", deployer.address);

  // 2. Chest contracts
  const chestMinter = await deploy(
    "ChestMinter",
    mizons.target,
    "ipfs://bafybeibt3pnsfi47jarhjyd7f2q67o35wjaibpjhaaganbhdapcmbn47qm/"
  );
  const chestOpener = await deploy(
    "ChestOpener",
    chestMinter.target,
    "ipfs://bafybeih3u3jnucrmt4lwlbpe2uecnaybwm7g5mtnnarek7252wcpyydxga/"
  );

  // 3. SkinLockRegistry
  const skinLock = await deploy(
    "SkinLockRegistry",
    chestOpener.target,
    deployer.address
  );

  // Link ChestOpener → ChestMinter
  console.log("🔗 Linking ChestOpener on ChestMinter…");
  await (await chestMinter.setChestOpener(chestOpener.target)).wait();
  console.log("✅ ChestOpener linked\n");

  // 4. Mizontresh & whitelist
  const mizontresh = await deploy(
    "Mizontresh",
    "ipfs://bafybeih3u3jnucrmt4lwlbpe2uecnaybwm7g5mtnnarek7252wcpyydxga/",
    deployer.address
  );
  console.log("🔗 Whitelisting Mizontresh in SkinLockRegistry…");
  await (await skinLock.addAllowedNFT(mizontresh.target)).wait();
  console.log("✅ Mizontresh whitelisted\n");

  // 5. Update .env files
  console.log("📦 Updating .env files…");

  // Root .env
  const rootEnvPath = path.join(__dirname, ".env");
  const existingEnv = dotenv.config({ path: rootEnvPath }).parsed || {};
  const updatedRoot = {
    ...existingEnv,
    GAMEOFDEATH_ADDRESS:         game.target,
    GAMEOFDEATH_BETTING_ADDRESS: betting.target,
    MIZONS_ADDRESS:              mizons.target,
    CHEST_MINTER_ADDRESS:        chestMinter.target,
    CHEST_OPENER_ADDRESS:        chestOpener.target,
    SKIN_LOCK_ADDRESS:           skinLock.target,
    MIZONTRESH_ADDRESS:          mizontresh.target,
  };
  fs.writeFileSync(
    rootEnvPath,
    Object.entries(updatedRoot).map(([k,v])=>`${k}=${v}`).join("\n"),
    "utf8"
  );
  console.log(`✅ Root .env updated at ${rootEnvPath}`);

  // Frontend .env
  const frontEnvPath = path.join(__dirname, "frontend/.env");
  const frontendEnv  = {
    REACT_APP_BACKEND_URL:          process.env.REACT_APP_BACKEND_URL || "http://localhost:3001",
    REACT_APP_GAMEOFDEATH_ADDRESS:  game.target,
    REACT_APP_BETTING_ADDRESS:      betting.target,
    REACT_APP_MIZONS_ADDRESS:       mizons.target,
    REACT_APP_CHEST_MINTER_ADDRESS: chestMinter.target,
    REACT_APP_CHEST_OPENER_ADDRESS: chestOpener.target,
    REACT_APP_SKIN_LOCK_ADDRESS:    skinLock.target,
    REACT_APP_MIZONTRESH_ADDRESS:   mizontresh.target,
  };
  fs.writeFileSync(
    frontEnvPath,
    Object.entries(frontendEnv).map(([k,v])=>`${k}=${v}`).join("\n"),
    "utf8"
  );
  console.log(`✅ Frontend .env updated at ${frontEnvPath}\n`);

  console.log("🏁 Deployment complete!");
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error("Deployment error:", err);
    process.exit(1);
  });

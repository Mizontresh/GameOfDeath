// deployAll.js
require("dotenv").config();
const fs     = require("fs");
const path   = require("path");
const dotenv = require("dotenv");
const { ethers } = require("hardhat");

// Generic deploy helper using Ethers v6 + Hardhat
async function deploy(name, ...args) {
  console.log(`🔨 Deploying ${name}…`);
  const Factory  = await ethers.getContractFactory(name);
  const contract = await Factory.deploy(...args);
  await contract.waitForDeployment();
  console.log(`✅  ${name} deployed to:`, contract.address);
  return contract;
}

async function main() {
  // Deployer
  const [deployer] = await ethers.getSigners();
  console.log(`\n👤 Deploying with account: ${deployer.address}`);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`💰 Balance: ${ethers.formatEther(balance)} ETH\n`);

  // 1. Core
  const game    = await deploy("GameOfDeath");
  const mizons  = await deploy("Mizons", deployer.address);
  const betting = await deploy("GameOfDeathBetting", deployer.address);

  // 2. Chest
  const chestMinter = await deploy(
    "ChestMinter",
    mizons.address,
    "ipfs://bafybeibt3pnsfi47jarhjyd7f2q67o35wjaibpjhaaganbhdapcmbn47qm/"
  );
  const chestOpener = await deploy(
    "ChestOpener",
    chestMinter.address,
    "ipfs://bafybeih3u3jnucrmt4lwlbpe2uecnaybwm7g5mtnnarek7252wcpyydxga/"
  );

  // 3. SkinLockRegistry
  const skinLock = await deploy(
    "SkinLockRegistry",
    chestOpener.address,
    deployer.address
  );

  // link
  console.log("🔗 Linking ChestOpener → ChestMinter…");
  await (await chestMinter.setChestOpener(chestOpener.address)).wait();
  console.log("✅ Linked\n");

  // 4. Mizontresh + whitelist
  const mizontresh = await deploy(
    "Mizontresh",
    "ipfs://bafybeih3u3jnucrmt4lwlbpe2uecnaybwm7g5mtnnarek7252wcpyydxga/",
    deployer.address
  );
  console.log("🔗 Whitelisting Mizontresh…");
  await (await skinLock.addAllowedNFT(mizontresh.address)).wait();
  console.log("✅ Whitelisted\n");

  // 5. Write .env
  console.log("📦 Updating .env files…");
  const rootEnvPath = path.join(__dirname, ".env");
  const existingEnv = dotenv.config({ path: rootEnvPath }).parsed || {};
  const updatedRoot = {
    ...existingEnv,
    GAMEOFDEATH_ADDRESS:         game.address,
    GAMEOFDEATH_BETTING_ADDRESS: betting.address,
    MIZONS_ADDRESS:              mizons.address,
    CHEST_MINTER_ADDRESS:        chestMinter.address,
    CHEST_OPENER_ADDRESS:        chestOpener.address,
    SKIN_LOCK_ADDRESS:           skinLock.address,
    MIZONTRESH_ADDRESS:          mizontresh.address,
  };
  fs.writeFileSync(
    rootEnvPath,
    Object.entries(updatedRoot).map(([k,v])=>`${k}=${v}`).join("\n"),
    "utf8"
  );
  console.log(`✅ Root .env updated`);

  const frontEnvPath = path.join(__dirname, "frontend/.env");
  const frontendEnv  = {
    REACT_APP_BACKEND_URL:          process.env.REACT_APP_BACKEND_URL || "http://localhost:3001",
    REACT_APP_GAMEOFDEATH_ADDRESS:  game.address,
    REACT_APP_BETTING_ADDRESS:      betting.address,
    REACT_APP_MIZONS_ADDRESS:       mizons.address,
    REACT_APP_CHEST_MINTER_ADDRESS: chestMinter.address,
    REACT_APP_CHEST_OPENER_ADDRESS: chestOpener.address,
    REACT_APP_SKIN_LOCK_ADDRESS:    skinLock.address,
    REACT_APP_MIZONTRESH_ADDRESS:   mizontresh.address,
  };
  fs.writeFileSync(
    frontEnvPath,
    Object.entries(frontendEnv).map(([k,v])=>`${k}=${v}`).join("\n"),
    "utf8"
  );
  console.log(`✅ Frontend .env updated\n`);

  console.log("🏁 Deployment complete!");
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error("Deployment error:", err);
    process.exit(1);
  });

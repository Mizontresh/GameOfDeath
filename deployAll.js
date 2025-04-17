// deployAll.js
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { ethers } = require("hardhat");

async function main() {
  // Retrieve the deployer's account.
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with:", deployer.address);

  // Deployer balance
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deploy balance:", balance.toString());

  // 1. Deploy GameOfDeath
  const GameOfDeath = await ethers.getContractFactory("GameOfDeath");
  const gameOfDeath = await GameOfDeath.deploy();
  await gameOfDeath.waitForDeployment();
  console.log("GameOfDeath deployed at:", gameOfDeath.target);

  // 2. Deploy Mizons
  const Mizons = await ethers.getContractFactory("Mizons");
  const mizons = await Mizons.deploy(deployer.address);
  await mizons.waitForDeployment();
  console.log("Mizons deployed at:", mizons.target);

  // 3. Deploy GameOfDeathBetting
  const Betting = await ethers.getContractFactory("GameOfDeathBetting");
  const betting = await Betting.deploy(deployer.address);
  await betting.waitForDeployment();
  console.log("GameOfDeathBetting deployed at:", betting.target);

  // 4. Deploy ChestMinter
  const ChestMinter = await ethers.getContractFactory("ChestMinter");
  const chestMinter = await ChestMinter.deploy(
    mizons.target,
    "ipfs://bafybeibt3pnsfi47jarhjyd7f2q67o35wjaibpjhaaganbhdapcmbn47qm/"
  );
  await chestMinter.waitForDeployment();
  console.log("ChestMinter deployed at:", chestMinter.target);

  // 5. Deploy ChestOpener
  const ChestOpener = await ethers.getContractFactory("ChestOpener");
  const chestOpener = await ChestOpener.deploy(
    chestMinter.target,
    "ipfs://bafybeih3u3jnucrmt4lwlbpe2uecnaybwm7g5mtnnarek7252wcpyydxga/"
  );
  await chestOpener.waitForDeployment();
  console.log("ChestOpener deployed at:", chestOpener.target);

  // 6. Deploy SkinLockRegistry
  const SkinLockRegistry = await ethers.getContractFactory("SkinLockRegistry");
  const skinLockRegistry = await SkinLockRegistry.deploy(
    chestOpener.target,
    deployer.address
  );
  await skinLockRegistry.waitForDeployment();
  console.log("SkinLockRegistry deployed at:", skinLockRegistry.target);

  // 7. Link ChestOpener ➔ ChestMinter
  const tx = await chestMinter.setChestOpener(chestOpener.target);
  await tx.wait();
  console.log("Linked ChestOpener on ChestMinter");

  // 8. Deploy Mizontresh
  const Mizontresh = await ethers.getContractFactory("Mizontresh");
  const mizontresh = await Mizontresh.deploy(
    "ipfs://bafybeih3u3jnucrmt4lwlbpe2uecnaybwm7g5mtnnarek7252wcpyydxga/",
    "0x1219819360136A93AC14E4df0A90125cf9927616"
  );
  await mizontresh.waitForDeployment();
  console.log("Mizontresh deployed at:", mizontresh.target);

  // 8a. Whitelist Mizontresh in SkinLockRegistry
  const addTx = await skinLockRegistry.addAllowedNFT(mizontresh.target);
  await addTx.wait();
  console.log("Mizontresh whitelisted in SkinLockRegistry");

  // 9. Write .env files
  const env = {
    PRIVATE_KEY: process.env.PRIVATE_KEY,
    GAMEOFDEATH_ADDRESS: gameOfDeath.target,
    GAMEOFDEATH_BETTING_ADDRESS: betting.target,
    MIZONS_ADDRESS: mizons.target,
    CHEST_MINTER_ADDRESS: chestMinter.target,
    CHEST_OPENER_ADDRESS: chestOpener.target,
    SKIN_LOCK_ADDRESS: skinLockRegistry.target,
    MIZONTRESH_ADDRESS: mizontresh.target,
    REACT_APP_GAMEOFDEATH_ADDRESS: gameOfDeath.target,
    REACT_APP_BETTING_ADDRESS: betting.target,
    REACT_APP_MIZONS_ADDRESS: mizons.target,
    REACT_APP_CHEST_MINTER_ADDRESS: chestMinter.target,
    REACT_APP_CHEST_OPENER_ADDRESS: chestOpener.target,
    REACT_APP_SKIN_LOCK_ADDRESS: skinLockRegistry.target,
    REACT_APP_MIZONTRESH_ADDRESS: mizontresh.target,
    REACT_APP_BACKEND_URL: process.env.REACT_APP_BACKEND_URL || "http://localhost:3000",
  };
  const lines = Object.entries(env).map(([k, v]) => `${k}=${v}`);
  fs.writeFileSync(path.join(__dirname, ".env"), lines.join("\n"));
  fs.writeFileSync(
    path.join(__dirname, "frontend/.env"),
    lines.concat("PORT=3001").join("\n")
  );
  console.log(".env files created/updated.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Deployment error:", e);
    process.exit(1);
  });

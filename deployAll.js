// deployAll.js
require("dotenv").config();
const fs = require("fs");
const { ethers } = require("hardhat");

async function main() {
  // Retrieve the deployer's account.
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  console.log("Deploying contracts with:", deployerAddress);

  // Get the deployer's balance.
  const balance = await ethers.provider.getBalance(deployerAddress);
  console.log("Deployer balance:", balance.toString());

  // 1. Deploy GameOfDeath (no constructor arguments)
  const GameOfDeath = await ethers.getContractFactory("GameOfDeath");
  const gameOfDeath = await GameOfDeath.deploy();
  await gameOfDeath.waitForDeployment();
  console.log("GameOfDeath deployed at:", gameOfDeath.target);

  // 2. Deploy Mizons (constructor requires initialOwner)
  const Mizons = await ethers.getContractFactory("Mizons");
  const mizons = await Mizons.deploy(deployerAddress);
  await mizons.waitForDeployment();
  console.log("Mizons deployed at:", mizons.target);

  // 3. Deploy GameOfDeathBetting (constructor requires initialOwner)
  const Betting = await ethers.getContractFactory("GameOfDeathBetting");
  const betting = await Betting.deploy(deployerAddress);
  await betting.waitForDeployment();
  console.log("GameOfDeathBetting deployed at:", betting.target);

  // 4. Deploy ChestMinter
  // Use the deployed Mizons address for the Mizon token.
  const mizonTokenAddress = mizons.target;
  // Base URI for ChestMinter metadata stored on IPFS (must end with a slash)
  const chestMinterBaseURI = "ipfs://bafybeibt3pnsfi47jarhjyd7f2q67o35wjaibpjhaaganbhdapcmbn47qm/";
  const ChestMinter = await ethers.getContractFactory("ChestMinter");
  const chestMinter = await ChestMinter.deploy(mizonTokenAddress, chestMinterBaseURI);
  await chestMinter.waitForDeployment();
  console.log("ChestMinter deployed at:", chestMinter.target);

  // 5. Deploy ChestOpener
  // Use the deployed ChestMinter address and set the base URI for item metadata.
  const chestMinterAddress = chestMinter.target;
  const itemBaseURI = "ipfs://bafybeih4hewzsynt25ornpwgjlhr2dp4y4l2tyq4qirb4fptxggw47jfv4/";
  const ChestOpener = await ethers.getContractFactory("ChestOpener");
  const chestOpener = await ChestOpener.deploy(chestMinterAddress, itemBaseURI);
  await chestOpener.waitForDeployment();
  console.log("ChestOpener deployed at:", chestOpener.target);

  // 6. Deploy SkinLockRegistry
  // Allowed NFT is the ChestOpener contract (the new address after deployment).
  const allowedNFT = chestOpener.target;
  const SkinLockRegistry = await ethers.getContractFactory("SkinLockRegistry");
  const skinLockRegistry = await SkinLockRegistry.deploy(allowedNFT);
  await skinLockRegistry.waitForDeployment();
  const skinLockAddressDeployed = await skinLockRegistry.getAddress();
  console.log("SkinLockRegistry deployed at:", skinLockAddressDeployed);

  // 7. Set ChestOpener in ChestMinter.
  // (Assuming ChestMinter has a function setChestOpener(address) to update its ChestOpener)
  const setTx = await chestMinter.setChestOpener(chestOpener.target);
  console.log("Setting ChestOpener on ChestMinter. Waiting for confirmation...");
  await setTx.wait();
  console.log("ChestOpener set on ChestMinter:", chestOpener.target);

  // 8. Create/update the backend .env file with deployed addresses.
  // This file will be used by your backend server.
  const envData = `
PRIVATE_KEY=${process.env.PRIVATE_KEY}
GAMEOFDEATH_ADDRESS=${gameOfDeath.target}
GAMEOFDEATH_BETTING_ADDRESS=${betting.target}
MIZONS_ADDRESS=${mizons.target}
CHEST_MINTER_ADDRESS=${chestMinter.target}
CHEST_OPENER_ADDRESS=${chestOpener.target}
SKIN_LOCK_ADDRESS=${skinLockAddressDeployed}
REACT_APP_GAMEOFDEATH_ADDRESS=${gameOfDeath.target}
REACT_APP_BETTING_ADDRESS=${betting.target}
REACT_APP_MIZONS_ADDRESS=${mizons.target}
REACT_APP_CHEST_MINTER_ADDRESS=${chestMinter.target}
REACT_APP_CHEST_OPENER_ADDRESS=${chestOpener.target}
REACT_APP_SKIN_LOCK_ADDRESS=${skinLockAddressDeployed}
REACT_APP_BACKEND_URL=${process.env.REACT_APP_BACKEND_URL || "http://localhost:3000"}
  `.trim();

  fs.writeFileSync(".env", envData);
  console.log("Backend .env file created/updated.");

  // 9. Create/update the frontend .env file.
  // For the frontend, we add a PORT setting (PORT=3001) in addition to all the other variables.
  const frontendEnvData = envData + "\nPORT=3001\n";
  // Adjust the path below if your frontend directory is named differently.
  fs.writeFileSync("frontend/.env", frontendEnvData);
  console.log("Frontend .env file created/updated with PORT=3001.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment error:", error);
    process.exit(1);
  });

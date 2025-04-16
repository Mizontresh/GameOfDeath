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
  const mizonTokenAddress = mizons.target;
  const chestMinterBaseURI = "ipfs://bafybeibt3pnsfi47jarhjyd7f2q67o35wjaibpjhaaganbhdapcmbn47qm/";
  const ChestMinter = await ethers.getContractFactory("ChestMinter");
  const chestMinter = await ChestMinter.deploy(mizonTokenAddress, chestMinterBaseURI);
  await chestMinter.waitForDeployment();
  console.log("ChestMinter deployed at:", chestMinter.target);

  // 5. Deploy ChestOpener
  const chestMinterAddress = chestMinter.target;
  const itemBaseURI = "ipfs://bafybeih3u3jnucrmt4lwlbpe2uecnaybwm7g5mtnnarek7252wcpyydxga/";
  const ChestOpener = await ethers.getContractFactory("ChestOpener");
  const chestOpener = await ChestOpener.deploy(chestMinterAddress, itemBaseURI);
  await chestOpener.waitForDeployment();
  console.log("ChestOpener deployed at:", chestOpener.target);

  // 6. Deploy SkinLockRegistry
  // Provide TWO arguments: the initial allowed NFT, plus the "owner" address for Ownable.
  const allowedNFT = chestOpener.target; // or ethers.ZeroAddress if you want none
  const SkinLockRegistry = await ethers.getContractFactory("SkinLockRegistry");
  const skinLockRegistry = await SkinLockRegistry.deploy(allowedNFT, deployerAddress);
  await skinLockRegistry.waitForDeployment();
  const skinLockAddressDeployed = await skinLockRegistry.getAddress();
  console.log("SkinLockRegistry deployed at:", skinLockAddressDeployed);

  // 7. Set ChestOpener in ChestMinter.
  const setTx = await chestMinter.setChestOpener(chestOpener.target);
  console.log("Setting ChestOpener on ChestMinter. Waiting for confirmation...");
  await setTx.wait();
  console.log("ChestOpener set on ChestMinter:", chestOpener.target);

  // 8. Deploy Mizontresh
  const mizontreshBaseURI = "ipfs://bafybeih3u3jnucrmt4lwlbpe2uecnaybwm7g5mtnnarek7252wcpyydxga/";
  const Mizontresh = await ethers.getContractFactory("Mizontresh");
  // pass the baseURI and the fundsRecipient you want:
  const fundsRecipient = "0x1219819360136A93AC14E4df0A90125cf9927616";
  const mizontresh = await Mizontresh.deploy(mizontreshBaseURI, fundsRecipient);
  await mizontresh.waitForDeployment();
  console.log("Mizontresh deployed at:", mizontresh.target);

  // 8a. Add Mizontresh to the SkinLockRegistry's allowed NFT list.
  try {
    const addTx = await skinLockRegistry.addAllowedNFT(mizontresh.target);
    console.log("Adding Mizontresh to allowed tokens. Waiting for confirmation...");
    await addTx.wait();
    console.log("Mizontresh added to SkinLockRegistry allowed tokens:", mizontresh.target);
  } catch (err) {
    console.error("Error adding Mizontresh to allowed tokens:", err);
  }

  // 9. Create/update .env files
  const envData = `
PRIVATE_KEY=${process.env.PRIVATE_KEY}
GAMEOFDEATH_ADDRESS=${gameOfDeath.target}
GAMEOFDEATH_BETTING_ADDRESS=${betting.target}
MIZONS_ADDRESS=${mizons.target}
CHEST_MINTER_ADDRESS=${chestMinter.target}
CHEST_OPENER_ADDRESS=${chestOpener.target}
SKIN_LOCK_ADDRESS=${skinLockAddressDeployed}
MIZONTRESH_ADDRESS=${mizontresh.target}
REACT_APP_GAMEOFDEATH_ADDRESS=${gameOfDeath.target}
REACT_APP_BETTING_ADDRESS=${betting.target}
REACT_APP_MIZONS_ADDRESS=${mizons.target}
REACT_APP_CHEST_MINTER_ADDRESS=${chestMinter.target}
REACT_APP_CHEST_OPENER_ADDRESS=${chestOpener.target}
REACT_APP_SKIN_LOCK_ADDRESS=${skinLockAddressDeployed}
REACT_APP_MIZONTRESH_ADDRESS=${mizontresh.target}
REACT_APP_BACKEND_URL=${process.env.REACT_APP_BACKEND_URL || "http://localhost:3000"}
  `.trim();

  fs.writeFileSync(".env", envData);
  console.log("Backend .env file created/updated.");

  const frontendEnvData = envData + "\nPORT=3001\n";
  fs.writeFileSync("frontend/.env", frontendEnvData);
  console.log("Frontend .env file created/updated with PORT=3001.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment error:", error);
    process.exit(1);
  });

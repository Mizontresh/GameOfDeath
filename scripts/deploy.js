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

  // 2. Deploy Mizons (requires an initialOwner address)
  const Mizons = await ethers.getContractFactory("Mizons");
  const mizons = await Mizons.deploy(deployerAddress);
  await mizons.waitForDeployment();
  console.log("Mizons deployed at:", mizons.target);

  // 3. Deploy GameOfDeathBetting (requires an initialOwner address)
  const Betting = await ethers.getContractFactory("GameOfDeathBetting");
  const betting = await Betting.deploy(deployerAddress);
  await betting.waitForDeployment();
  console.log("GameOfDeathBetting deployed at:", betting.target);

  // 4. Deploy ChestMinter
  // Use the deployed Mizons address as the Mizon token contract address.
  const mizonTokenAddress = mizons.target;
  // Base URI for ChestMinter metadata stored on IPFS (must end with a slash)
  const chestMinterBaseURI = "ipfs://bafybeibt3pnsfi47jarhjyd7f2q67o35wjaibpjhaaganbhdapcmbn47qm/";
  const ChestMinter = await ethers.getContractFactory("ChestMinter");
  const chestMinter = await ChestMinter.deploy(mizonTokenAddress, chestMinterBaseURI);
  await chestMinter.waitForDeployment();
  console.log("ChestMinter deployed at:", chestMinter.target);

  // 5. Deploy ChestOpener
  // Use the deployed ChestMinter address and set the base URI for opened item metadata.
  const chestMinterAddress = chestMinter.target;
  const itemBaseURI = "ipfs://bafybeihjt25gucou7unw35rkkcr66slzp7xqgr3bqhg4u3qxjndmclkfqi/";
  const ChestOpener = await ethers.getContractFactory("ChestOpener");
  const chestOpener = await ChestOpener.deploy(chestMinterAddress, itemBaseURI);
  await chestOpener.waitForDeployment();
  console.log("ChestOpener deployed at:", chestOpener.target);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment error:", error);
    process.exit(1);
  });

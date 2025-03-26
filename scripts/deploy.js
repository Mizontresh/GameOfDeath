// scripts/deploy.js
async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with:", deployer.address);
  
    // Deploy GameOfDeath (no constructor arguments)
    const GameOfDeath = await ethers.getContractFactory("GameOfDeath");
    const gameOfDeath = await GameOfDeath.deploy();
    await gameOfDeath.waitForDeployment();
    console.log("GameOfDeath deployed at:", gameOfDeath.target);
  
    // Deploy Mizons (requires an initialOwner address)
    const Mizons = await ethers.getContractFactory("Mizons");
    const mizons = await Mizons.deploy(deployer.address);
    await mizons.waitForDeployment();
    console.log("Mizons deployed at:", mizons.target);
  
    // Deploy GameOfDeathBetting (requires an initialOwner address)
    const Betting = await ethers.getContractFactory("GameOfDeathBetting");
    const betting = await Betting.deploy(deployer.address);
    await betting.waitForDeployment();
    console.log("GameOfDeathBetting deployed at:", betting.target);
  }
  
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
  
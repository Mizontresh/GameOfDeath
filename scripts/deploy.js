async function main() {
    const GameOfDeath = await ethers.getContractFactory("GameOfDeath");
    const gameOfDeath = await GameOfDeath.deploy();
    // Wait for deployment (in ethers v6, use .address or .target)
    console.log("GameOfDeath deployed to:", gameOfDeath.address || gameOfDeath.target);
  }
  
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
  
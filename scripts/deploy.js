async function main() {
    const TeamGame = await ethers.getContractFactory("TeamGame");
    const teamGame = await TeamGame.deploy();
    console.log("TeamGame deployed to:", teamGame.address || teamGame.target);
  }
  
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
  
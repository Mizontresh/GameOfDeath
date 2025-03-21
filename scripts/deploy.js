async function main() {
    const TeamGame = await ethers.getContractFactory("TeamGame");
    const teamGame = await TeamGame.deploy();
    // If using ethers v6, address may be in .address or .target:
    console.log("TeamGame deployed to:", teamGame.address || teamGame.target);
  }
  
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
  
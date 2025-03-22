async function main() {
    console.log("Deploying GameOfDeath contract...");
  
    // Get the contract factory for GameOfDeath.
    const GameOfDeath = await ethers.getContractFactory("GameOfDeath");
    console.log("Bytecode length:", GameOfDeath.bytecode.length);
  
    // Get the deploy transaction data (pass an empty array since there are no constructor args)
    const deployTx = GameOfDeath.getDeployTransaction([]);
    if (!deployTx.data || deployTx.data === "0x") {
      console.warn("Deploy transaction data is undefined; skipping gas estimation.");
    } else {
      const gasEstimate = await ethers.provider.estimateGas(deployTx);
      console.log("Estimated deployment gas:", gasEstimate.toString());
  
      const gasPrice = await ethers.provider.getGasPrice();
      console.log("Current gas price (wei):", gasPrice.toString());
  
      const estimatedCost = gasEstimate.mul(gasPrice);
      console.log("Estimated deployment cost (wei):", estimatedCost.toString());
    }
  
    // Deploy the contract.
    const gameOfDeath = await GameOfDeath.deploy();
    console.log("Deploying contract, please wait...");
    await gameOfDeath.waitForDeployment();
    console.log("Contract deployed at:", gameOfDeath.target);
  
    // If ethers v6 provides the deploymentTransactionHash, use it to get the receipt.
    if (gameOfDeath.deploymentTransactionHash) {
      const receipt = await ethers.provider.getTransactionReceipt(gameOfDeath.deploymentTransactionHash);
      console.log("Actual deployment gas used:", receipt.gasUsed.toString());
    } else {
      console.warn("Deployment transaction hash not available; cannot retrieve actual gas used.");
    }
  }
  
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Deployment error:", error);
      process.exit(1);
    });
  
const tx = await chestMinter.setChestOpener(chestOpener.address);
await tx.wait();
console.log("setChestOpener done!");

const readBack = await chestMinter.chestOpenerAddress();
console.log("ChestMinter's chestOpenerAddress is:", readBack);

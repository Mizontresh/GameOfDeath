require("@nomicfoundation/hardhat-toolbox");
// hardhat.config.js
require("dotenv").config();

module.exports = {
  solidity: "0.8.28",
  networks: {
    taiko: {
      url: process.env.RPC_URL,          // e.g. https://rpc.ankr.com/taiko
      chainId: 167000,
      accounts: [ process.env.PRIVATE_KEY ]
    },
    // …other networks
  },
};

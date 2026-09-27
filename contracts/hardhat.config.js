require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config({ path: ".env" });

module.exports = {
  paths: {
    sources: "./src",
  },
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    sepolia: {
      url: process.env.RPC_URL || "",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    "base-sepolia": {
      url: process.env.BASE_RPC_URL || "https://sepolia.base.org",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: {
      sepolia: process.env.ETHERSCAN_KEY || "",
      "base-sepolia": process.env.BASESCAN_KEY || "",
    },
  },
};

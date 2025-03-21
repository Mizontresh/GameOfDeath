require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { ethers } = require("ethers");

// Import the ABI from Hardhat artifacts
const teamGameArtifact = require("./artifacts/contracts/TeamGame.sol/TeamGame.json");

const app = express();
app.use(cors());
app.use(express.json());

// Phase definitions: free phase (60 sec) and lock phase (60 sec)
const PHASES = [
  { name: "free", duration: 60, allowed: true },
  { name: "locked", duration: 60, allowed: false },
];

let phaseIndex = 0;
let currentPhase = { ...PHASES[phaseIndex] }; // current phase object, including timeLeft
currentPhase.timeLeft = currentPhase.duration; // initialize timeLeft

// Set up ethers provider (connect to local Hardhat node)
const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");

// Create wallet using PRIVATE_KEY from .env (must be the same account used for deployment)
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// Get contract address and ABI from environment and artifact
const contractAddress = process.env.REACT_APP_CONTRACT_ADDRESS;
const contractABI = teamGameArtifact.abi;

const teamGame = new ethers.Contract(contractAddress, contractABI, wallet);

// Express endpoint: GET /timer returns the current phase and time left
app.get("/timer", (req, res) => {
  res.json({
    phase: currentPhase.name,
    active: currentPhase.allowed,
    timeLeft: currentPhase.timeLeft,
  });
});

// Express endpoint: GET /get-team returns a player's current team
app.get("/get-team", async (req, res) => {
  const { address } = req.query;
  if (!address) {
    return res.status(400).json({ error: "Missing address parameter" });
  }
  try {
    const teamId = await teamGame.getTeam(address);
    res.json({ team: teamId.toString() });
  } catch (err) {
    console.error("Error fetching team:", err);
    res.status(500).json({ error: err.message });
  }
});

// Phase-based timer: tick every second
setInterval(() => {
  currentPhase.timeLeft--;
  if (currentPhase.timeLeft <= 0) {
    // Switch phase
    phaseIndex = (phaseIndex + 1) % PHASES.length;
    currentPhase = { ...PHASES[phaseIndex], timeLeft: PHASES[phaseIndex].duration };

    // Update the on-chain state to reflect the new phase.
    teamGame.setSwappingAllowed(currentPhase.allowed)
      .then((tx) => tx.wait())
      .then(() => console.log(`On-chain swappingAllowed updated to ${currentPhase.allowed} on phase switch (${currentPhase.name}).`))
      .catch((err) => console.error("Error updating on-chain swappingAllowed:", err));
  }
}, 1000);

// Start the backend server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Backend server listening on http://localhost:${PORT}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Please free the port or choose another one.`);
  } else {
    console.error("Server error:", err);
  }
});

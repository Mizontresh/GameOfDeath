require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { ethers } = require("ethers");

// Import ABI from Hardhat artifacts
const teamGameArtifact = require("./artifacts/contracts/TeamGame.sol/TeamGame.json");

const app = express();
app.use(cors());
app.use(express.json());

// Phase-based timer settings: free phase (60 sec swapping allowed) then lock phase (60 sec swapping locked)
const PHASES = [
  { name: "free", duration: 60, allowed: true },
  { name: "locked", duration: 60, allowed: false },
];
let phaseIndex = 0;
let currentPhase = { ...PHASES[phaseIndex] };
currentPhase.timeLeft = currentPhase.duration; // initialize

// Ethers.js setup: connect to local Hardhat node.
const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

const contractAddress = process.env.REACT_APP_CONTRACT_ADDRESS;
const contractABI = teamGameArtifact.abi;
const teamGame = new ethers.Contract(contractAddress, contractABI, wallet);

// Endpoint: GET /timer returns the current phase info.
app.get("/timer", (req, res) => {
  res.json({
    phase: currentPhase.name,
    active: currentPhase.allowed,
    timeLeft: currentPhase.timeLeft,
  });
});

// Endpoint: GET /get-team returns the team for a given player.
app.get("/get-team", async (req, res) => {
  const { address } = req.query;
  if (!address) return res.status(400).json({ error: "Missing address parameter" });
  try {
    const teamId = await teamGame.team(address);
    res.json({ team: teamId.toString() });
  } catch (err) {
    console.error("Error fetching team:", err);
    res.status(500).json({ error: err.message });
  }
});

// Endpoint: GET /team-counts returns the current team counts.
app.get("/team-counts", async (req, res) => {
  try {
    const counts = await teamGame.getTeamCounts();
    res.json({ teamA: counts[0].toString(), teamB: counts[1].toString() });
  } catch (err) {
    console.error("Error fetching team counts:", err);
    res.status(500).json({ error: err.message });
  }
});

// Phase-based timer: tick every second.
setInterval(() => {
  currentPhase.timeLeft--;
  if (currentPhase.timeLeft <= 0) {
    // Move to next phase.
    phaseIndex = (phaseIndex + 1) % PHASES.length;
    currentPhase = { ...PHASES[phaseIndex], timeLeft: PHASES[phaseIndex].duration };

    // Update on-chain swappingAllowed state.
    teamGame.setSwappingAllowed(currentPhase.allowed)
      .then(tx => tx.wait())
      .then(() => console.log(`On-chain swappingAllowed updated to ${currentPhase.allowed} for phase "${currentPhase.name}"`))
      .catch((err) => console.error("Error updating on-chain swappingAllowed:", err));
  }
}, 1000);

// Start the backend server on the port specified in .env (default to 3000)
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

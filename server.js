require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { ethers } = require("ethers");

const app = express();
app.use(cors());
app.use(express.json());

// 1) Phase-based timer config (60s free => 60s locked).
const PHASES = [
  { name: "free", duration: 60, allowed: true },
  { name: "locked", duration: 60, allowed: false },
];
let phaseIndex = 0;
let currentPhase = { ...PHASES[phaseIndex], timeLeft: PHASES[phaseIndex].duration };

// 2) Ethers setup
const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// 3) Contract addresses & ABIs
//    Replace these lines to point to your single GameOfDeath artifact
//    after you compile & deploy that contract:
const gameOfDeathArtifact = require("./artifacts/contracts/GameOfDeath.sol/GameOfDeath.json");
const gameOfDeathAddress = process.env.GAMEOFDEATH_ADDRESS;

// Create a contract instance
const gameOfDeath = new ethers.Contract(gameOfDeathAddress, gameOfDeathArtifact.abi, wallet);

// 4) Timer endpoint
app.get("/timer", (req, res) => {
  res.json({
    phase: currentPhase.name,
    active: currentPhase.allowed,
    timeLeft: currentPhase.timeLeft,
  });
});

// 5) Example to read which team a user is on
app.get("/get-team", async (req, res) => {
  const { address } = req.query;
  if (!address) return res.status(400).json({ error: "Missing address" });
  try {
    const teamId = await gameOfDeath.getTeam(address);
    res.json({ team: teamId.toString() });
  } catch (err) {
    console.error("Error in get-team:", err);
    res.status(500).json({ error: err.message });
  }
});

// 6) Return the entire board if you want it from server-side
app.get("/get-board", async (req, res) => {
  try {
    const board = await gameOfDeath.getBoard();
    const boardNums = board.map(b => Number(b));
    res.json({ board: boardNums });
  } catch (err) {
    console.error("Error fetching board:", err);
    res.status(500).json({ error: err.message });
  }
});

// 7) Example if you want the server to place squares for a user
app.post("/place-square", async (req, res) => {
  const { address, x, y } = req.body;
  if (!address || x == null || y == null) {
    return res.status(400).json({ error: "Missing parameters" });
  }
  // Typically you do this from the front end with the user's wallet
  // But here's a demonstration from the server's wallet:
  try {
    const tx = await gameOfDeath.placeSquare(x, y);
    await tx.wait();
    res.json({ message: "Square placed!" });
  } catch (err) {
    console.error("Error placing square:", err);
    res.status(500).json({ error: err.message });
  }
});

// 8) Phase-based timer toggling the contract
setInterval(() => {
  currentPhase.timeLeft--;
  if (currentPhase.timeLeft <= 0) {
    phaseIndex = (phaseIndex + 1) % PHASES.length;
    currentPhase = {
      ...PHASES[phaseIndex],
      timeLeft: PHASES[phaseIndex].duration,
    };
    // Call setSwappingAllowed on the contract
    gameOfDeath.setSwappingAllowed(currentPhase.allowed)
      .then(tx => tx.wait())
      .then(() => {
        console.log(
          `Swapping allowed set to ${currentPhase.allowed} (phase: ${currentPhase.name})`
        );
      })
      .catch(err => console.error("Error setting swappingAllowed:", err));
  }
}, 1000);

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});

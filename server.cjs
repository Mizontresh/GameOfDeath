// server.cjs
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const { ethers } = require("ethers");
const { createCanvas } = require("canvas");
const mongoose = require("mongoose");
const conway = require("./conway"); // your Conway simulation logic

//-------------------------------------
// Mongoose Setup
//-------------------------------------
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/gameofdeath";
mongoose.connect(MONGO_URI);
mongoose.connection
  .once("open", () => console.log("Connected to MongoDB:", MONGO_URI))
  .on("error", err => console.error("MongoDB error:", err));

const gameRecordSchema = new mongoose.Schema({
  gameId: Number,
  winner: String,
  timestamp: Date,
  teamRedCount: Number,
  teamBlueCount: Number,
  boardHistory: { type: [[Number]], default: [] },
  players: [String],
  thumbnail: String,
});
const GameRecord = mongoose.model("GameRecord", gameRecordSchema);

//-------------------------------------
// Express & Socket.io Setup
//-------------------------------------
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
const serverHttp = http.createServer(app);
const io = new Server(serverHttp, { cors: { origin: "*" } });

//-------------------------------------
// Ethereum Setup
//-------------------------------------
const wsProvider = new ethers.WebSocketProvider(
  process.env.WS_PROVIDER || "ws://127.0.0.1:8545"
);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, wsProvider);

const gameArtifact = require("./artifacts/contracts/GameOfDeath.sol/GameOfDeath.json");
const bettingArtifact = require("./artifacts/contracts/GameOfDeathBetting.sol/GameOfDeathBetting.json");
const mizonsArtifact = require("./artifacts/contracts/Mizons.sol/Mizons.json");

const gameAddress = process.env.GAMEOFDEATH_ADDRESS;
const bettingAddress = process.env.GAMEOFDEATH_BETTING_ADDRESS;
const mizonsAddress = process.env.MIZONS_ADDRESS;

const gameContract = new ethers.Contract(gameAddress, gameArtifact.abi, wallet);
const bettingContract = new ethers.Contract(bettingAddress, bettingArtifact.abi, wallet);
const mizons = new ethers.Contract(mizonsAddress, mizonsArtifact.abi, wallet);

//-------------------------------------
// In-memory State & Constants
//-------------------------------------
let phase = "picking"; // valid phases: "picking", "placing", "conway", "final"
let phaseTimeLeft = 30;
let boardHistory = [];
let transitionInProgress = false;
let currentGameId = 1; // this will be updated from chain on startup/reset.
let cycleCount = 0; // intermediate conway cycles completed
let conwayActive = false;
let activePlayers = new Set();

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

// Timing constants
const PICKING_TIME = 30;
const PLACING_TIME = 30;
const FINAL_COUNTDOWN = 20; // final phase lasts 20 seconds
const CONWAY_STEPS = 10;
const MAX_CYCLES = 2; // after MAX_CYCLES intermediate cycles, run final cycle

//-------------------------------------
// Helper Functions
//-------------------------------------
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let transactionQueue = Promise.resolve();
function queueTransaction(callback) {
  transactionQueue = transactionQueue.then(async () => {
    await sleep(200);
    let nonce = await wsProvider.getTransactionCount(wallet.address, "pending");
    try {
      return await callback(nonce);
    } catch (err) {
      if (err.message && err.message.includes("Nonce too low")) {
        console.log("Nonce too low, retrying...");
        await sleep(200);
        nonce = await wsProvider.getTransactionCount(wallet.address, "pending");
        return await callback(nonce);
      }
      throw err;
    }
  });
  return transactionQueue;
}

async function waitForTxConfirmation(tx, timeout = 90000, pollInterval = 3000) {
  console.log(`Waiting for confirmation of tx ${tx.hash}...`);
  const start = Date.now();
  while (true) {
    const receipt = await wsProvider.getTransactionReceipt(tx.hash);
    if (receipt) return receipt;
    if (Date.now() - start > timeout) {
      throw new Error("Timeout waiting for transaction confirmation");
    }
    await sleep(pollInterval);
  }
}

//-------------------------------------
// Board Helpers
//-------------------------------------
async function getOnChainBoard() {
  const packed = await gameContract.getBoard();
  const CELLS_PER_CHUNK = 161;
  const totalCells = 4096;
  let cells = [];
  for (let i = 0; i < packed.length; i++) {
    let chunk = BigInt(packed[i].toString());
    for (let j = 0; j < CELLS_PER_CHUNK; j++) {
      if (cells.length >= totalCells) break;
      cells.push(Number(chunk % 3n));
      chunk /= 3n;
    }
  }
  return cells;
}

function convertToAugmentedBoard(numericalBoard) {
  return numericalBoard.map(val => ({ value: val, skin: null }));
}

function packBoard(cells) {
  const CELLS_PER_CHUNK = 161;
  const NUM_CHUNKS = 26;
  let packed = new Array(NUM_CHUNKS).fill(0n);
  for (let i = 0; i < cells.length; i++) {
    const chunkIndex = Math.floor(i / CELLS_PER_CHUNK);
    const pos = i % CELLS_PER_CHUNK;
    packed[chunkIndex] += BigInt(cells[i]) * (3n ** BigInt(pos));
  }
  return packed.map(n => n.toString());
}

//-------------------------------------
// Generate Thumbnail
//-------------------------------------
async function generateThumbnail(board, gameId) {
  const width = 64, height = 64;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const cell = board[idx];
      ctx.fillStyle = cell === 1 ? "#ff0050" : cell === 2 ? "#00bbff" : "#000000";
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const scale = 8;
  const scaledCanvas = createCanvas(width * scale, height * scale);
  const scaledCtx = scaledCanvas.getContext("2d");
  scaledCtx.imageSmoothingEnabled = false;
  scaledCtx.drawImage(canvas, 0, 0, width * scale, height * scale);
  const imageDir = path.join(__dirname, "public", "images");
  if (!fs.existsSync(imageDir)) fs.mkdirSync(imageDir, { recursive: true });
  const imagePath = path.join(imageDir, `game_${gameId}.png`);
  fs.writeFileSync(imagePath, scaledCanvas.toBuffer("image/png"));
  console.log(`Thumbnail saved as ${imagePath}`);
  return `${BASE_URL}/images/game_${gameId}.png`;
}

//-------------------------------------
// MIZ Distribution
//-------------------------------------
async function distributeWinnings(gameId, winningTeam) {
  console.log("Distributing winnings for game:", gameId, "winnerTeam:", winningTeam);
  const bets = await bettingContract.getBets(gameId);
  let winningBets = [];
  let losingBets = [];
  for (let b of bets) {
    const user = b.user;
    const team = Number(b.team);
    const tickets = Number(b.tickets);
    if (team === winningTeam) winningBets.push({ user, tickets });
    else losingBets.push({ user, tickets });
  }
  const totalWinningTickets = winningBets.reduce((acc, b) => acc + b.tickets, 0);
  const totalLosingTickets = losingBets.reduce((acc, b) => acc + b.tickets, 0);
  if (totalWinningTickets === 0) {
    console.log("No winning bets => no payouts.");
    return;
  }
  const mintPromises = winningBets.map(w => {
    const fraction = w.tickets / totalWinningTickets;
    const share = Math.floor(fraction * totalLosingTickets);
    if (share > 0) {
      return queueTransaction(async (nonce) => {
        const tx = await mizons.mint(w.user, share, { nonce });
        console.log(`Minted ${share} MIZ to ${w.user}, tx: ${tx.hash}`);
        return waitForTxConfirmation(tx);
      });
    }
    return Promise.resolve();
  });
  await Promise.all(mintPromises);
  console.log("Winnings distribution complete.");
}

//-------------------------------------
// recordGame
//-------------------------------------
async function recordGame(winner) {
  try {
    const counts = await gameContract.getTeamCounts(currentGameId);
    let thumbnail = "";
    if (boardHistory.length > 0) {
      thumbnail = await generateThumbnail(boardHistory[boardHistory.length - 1], currentGameId);
    }
    const record = {
      gameId: currentGameId,
      winner,
      timestamp: new Date(),
      teamRedCount: Number(counts.redCount),
      teamBlueCount: Number(counts.blueCount),
      boardHistory,
      players: Array.from(activePlayers),
      thumbnail,
    };
    await new GameRecord(record).save();
    console.log("Game record saved in MongoDB:", record);
    io.emit("newGameRecord", record);
    if (winner === "Red") {
      await distributeWinnings(currentGameId, 1);
    } else if (winner === "Blue") {
      await distributeWinnings(currentGameId, 2);
    } else {
      console.log("Tie => no payouts.");
    }
    activePlayers.clear();
  } catch (err) {
    console.error("Error in recordGame:", err);
  }
}

//-------------------------------------
// Off-chain Conway Steps
//-------------------------------------
async function runConwaySteps(steps) {
  conwayActive = true;
  console.log(`Running Conway steps: ${steps} steps`);
  let currentBoard = await getOnChainBoard();
  for (let turn = 1; turn <= steps; turn++) {
    currentBoard = conway.runOneStep(currentBoard);
    boardHistory.push([...currentBoard]);
    io.emit("boardUpdated", convertToAugmentedBoard(currentBoard));
    console.log(`Conway step ${turn} completed.`);
    await sleep(300);
  }
  conwayActive = false;
  await queueTransaction(async (nonce) => {
    const packed = packBoard(currentBoard);
    const tx = await gameContract.serverOverwriteBoard(packed, { nonce });
    console.log(`On-chain update after ${steps} steps, tx: ${tx.hash}`);
    await waitForTxConfirmation(tx);
  });
}

//-------------------------------------
// runFinalCycle
//-------------------------------------
async function runFinalCycle() {
  console.log("Running final conway cycle...");
  const snapshot = await getOnChainBoard();
  boardHistory.push([...snapshot]);
  await runConwaySteps(CONWAY_STEPS);

  // Count opposing placements
  let redOnBlue = 0, blueOnRed = 0;
  const board = await getOnChainBoard();
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const idx = y * 64 + x;
      const cell = board[idx];
      if (cell === 1 && y >= 32) redOnBlue++;
      if (cell === 2 && y < 32) blueOnRed++;
    }
  }
  let winner = "Tie";
  if (redOnBlue !== blueOnRed) {
    winner = redOnBlue > blueOnRed ? "Red" : "Blue";
  }
  console.log("Winner is:", winner);
  io.emit("winner", { winner });
  await recordGame(winner);

  // Force final phase so the frontend knows (no conway timer)
  await setContractPhase("final");
  phase = "final";
  phaseTimeLeft = FINAL_COUNTDOWN;
  io.emit("phaseUpdated", { phase, timeLeft: phaseTimeLeft, gameId: currentGameId });
}

//-------------------------------------
// setContractPhase
//-------------------------------------
async function setContractPhase(newPhase, attempt = 1) {
  const PHASE_MAP = { picking: 0, placing: 1, conway: 2, final: 3 };
  const phaseEnum = PHASE_MAP[newPhase];
  if (phaseEnum === undefined) throw new Error("Unknown phase: " + newPhase);

  console.log(`Setting phase to ${newPhase} (enum: ${phaseEnum}), attempt ${attempt}`);
  try {
    await queueTransaction(async (nonce) => {
      const tx = await gameContract.setPhase(phaseEnum, { nonce });
      console.log("setPhase tx:", tx.hash);
      await waitForTxConfirmation(tx);
      console.log(`Phase set confirmed to ${newPhase}`);
    });
  } catch (err) {
    console.error("Error setting phase:", err);
    if (attempt < 3) {
      console.log("Retrying setContractPhase...");
      return await setContractPhase(newPhase, attempt + 1);
    }
    console.error("Failed to set phase after max attempts. Resetting game.");
    await resetGame();
    return;
  }
  phase = newPhase;
  io.emit("phaseUpdated", { phase, timeLeft: phaseTimeLeft, gameId: currentGameId });
}

//-------------------------------------
// transitionPhase
//-------------------------------------
async function transitionPhase() {
  console.log("transitionPhase() called in phase:", phase);
  if (phase === "picking") {
    console.log("Transitioning from picking to placing");
    await setContractPhase("placing");
    phase = "placing";
    phaseTimeLeft = PLACING_TIME;
  } else if (phase === "placing") {
    console.log("Placing ended. Transitioning to conway");
    await setContractPhase("conway");
    await runConwaySteps(CONWAY_STEPS);
    cycleCount++;
    if (cycleCount < MAX_CYCLES) {
      console.log("Intermediate conway cycle done. Transitioning to picking...");
      await setContractPhase("picking");
      phase = "picking";
      phaseTimeLeft = PICKING_TIME;
    } else {
      console.log("Maximum cycles reached; running final conway cycle now...");
      await runFinalCycle();
      return; // runFinalCycle handles final phase update
    }
  } else if (phase === "final") {
    console.log("Final phase expired; resetting game...");
    await resetGame();
  }
  io.emit("phaseUpdated", { phase, timeLeft: phaseTimeLeft, gameId: currentGameId });
}

//-------------------------------------
// Main Loop
//-------------------------------------
setInterval(async () => {
  try {
    console.log(`Phase: ${phase}, timeLeft: ${phaseTimeLeft}`);
    if (transitionInProgress) return;
    if (phase === "picking" || phase === "placing" || phase === "final") {
      if (phaseTimeLeft > 0) {
        phaseTimeLeft--;
        io.emit("phaseUpdated", { phase, timeLeft: phaseTimeLeft, gameId: currentGameId });
      } else {
        transitionInProgress = true;
        await transitionPhase();
        transitionInProgress = false;
      }
    }
    // For conway phase, the simulation in runConwaySteps handles transitions.
  } catch (err) {
    console.error("Error in main loop:", err);
  }
}, 1000);

//-------------------------------------
// resetGame
//-------------------------------------
async function resetGame() {
  try {
    await queueTransaction(async (nonce) => {
      const tx = await bettingContract.clearBets(currentGameId, { nonce });
      console.log(`Cleared bets for gameId=${currentGameId}, tx: ${tx.hash}`);
      await waitForTxConfirmation(tx);
      console.log("Bets cleared for gameId", currentGameId);
    });
  } catch (err) {
    console.error("Error clearing bets (ignored):", err.message);
  }
  const newId = currentGameId + 1;
  try {
    await queueTransaction(async (nonce) => {
      const tx = await gameContract.newGame(newId, { nonce });
      console.log("newGame tx:", tx.hash);
      await waitForTxConfirmation(tx);
      console.log("Game reset on-chain to new gameId:", newId);
    });
  } catch (err) {
    console.error("Error calling newGame on-chain:", err);
  }
  // Update currentGameId from chain
  try {
    const onChainGameId = await gameContract.currentGameId();
    currentGameId = Number(onChainGameId);
    console.log("Updated local currentGameId from chain:", currentGameId);
  } catch (err) {
    console.error("Error fetching currentGameId from chain:", err);
    currentGameId = newId;
  }
  phase = "picking";
  phaseTimeLeft = PICKING_TIME;
  boardHistory = [];
  cycleCount = 0;
  activePlayers.clear();
  console.log("Local state reset, new gameId:", currentGameId);
  io.emit("phaseUpdated", { phase, timeLeft: phaseTimeLeft, gameId: currentGameId });
}

//-------------------------------------
// Contract Event Listeners
//-------------------------------------
gameContract.on("TeamJoined", (gameId, user, teamId) => {
  console.log("TeamJoined event: gameId=", gameId.toString(), user, "team=", teamId.toString());
  activePlayers.add(user.toLowerCase());
});

gameContract.on("SquarePlaced", (gameId, user, x, y, color) => {
  console.log("SquarePlaced event:", gameId.toString(), user, x.toString(), y.toString(), color.toString());
  activePlayers.add(user.toLowerCase());
  (async () => {
    try {
      const board = await getOnChainBoard();
      boardHistory.push([...board]);
      io.emit("boardUpdated", convertToAugmentedBoard(board));
    } catch (err) {
      console.error("Error in SquarePlaced handler:", err);
    }
  })();
});

//-------------------------------------
// API Endpoints
//-------------------------------------
app.get("/api/board", async (req, res) => {
  try {
    const board = await getOnChainBoard();
    res.json({ board: convertToAugmentedBoard(board) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/state", (req, res) => {
  res.json({ phase, timeLeft: phaseTimeLeft, gameId: currentGameId });
});

app.get("/api/history", (req, res) => {
  res.json({ boardHistory });
});

app.get("/api/allRecords", async (req, res) => {
  try {
    const records = await GameRecord.find().sort({ gameId: -1 });
    res.json({ records });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/records/:userAddress", async (req, res) => {
  try {
    const userAddr = req.params.userAddress.toLowerCase();
    const records = await GameRecord.find({ players: userAddr }).sort({ gameId: -1 });
    res.json({ records });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/recordById/:gameId", async (req, res) => {
  try {
    const gId = Number(req.params.gameId);
    const record = await GameRecord.findOne({ gameId: gId });
    if (!record) return res.status(404).json({ error: `No record for gameId ${gId}` });
    res.json({ record });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/bets/:gameId", async (req, res) => {
  const gameIdParam = Number(req.params.gameId);
  try {
    const bets = await bettingContract.getBets(gameIdParam);
    const formatted = bets.map(b => ({
      user: b.user,
      team: Number(b.team),
      tickets: b.tickets.toString()
    }));
    res.json({ bets: formatted });
  } catch (err) {
    console.error("Failed to fetch bets:", err);
    res.status(500).json({ error: "Failed to fetch bets." });
  }
});

app.post("/admin/reset-to-game1", async (req, res) => {
  try {
    const imageDir = path.join(__dirname, "public", "images");
    if (fs.existsSync(imageDir)) {
      const files = fs.readdirSync(imageDir);
      for (const file of files) {
        fs.unlinkSync(path.join(imageDir, file));
      }
      console.log("Thumbnail images deleted.");
    }
    await GameRecord.deleteMany({});
    console.log("MongoDB game records cleared.");
    await resetGame();
    res.json({ message: "Reset to game 1 complete." });
  } catch (err) {
    console.error("Error resetting game:", err);
    res.status(500).json({ error: err.message });
  }
});

//-------------------------------------
// Startup Block
//-------------------------------------
(async () => {
  try {
    // Fetch currentGameId from the chain on startup.
    const onChainGameId = await gameContract.currentGameId();
    currentGameId = Number(onChainGameId);
    console.log("Fetched currentGameId from chain:", currentGameId);

    const onChainPhase = await gameContract.currentPhase();
    if (Number(onChainPhase) === 3) {
      console.log("Contract in final phase at startup; resetting game...");
      await resetGame();
    } else {
      await setContractPhase("picking");
      phase = "picking";
      phaseTimeLeft = PICKING_TIME;
      io.emit("phaseUpdated", { phase, timeLeft: phaseTimeLeft, gameId: currentGameId });
    }
  } catch (err) {
    console.error("Startup error:", err);
  }
})();

const PORT = process.env.PORT || 3000;
serverHttp.listen(PORT, () => {
  console.log(`Server running on ${BASE_URL}, port ${PORT}`);
  console.log("Using contracts:", { gameAddress, bettingAddress, mizonsAddress });
});

// server.cjs
require("dotenv").config();
const fs         = require("fs");
const path       = require("path");
const express    = require("express");
const cors       = require("cors");
const http       = require("http");
const { Server } = require("socket.io");
const { ethers } = require("ethers");
const { createCanvas } = require("canvas");
const mongoose   = require("mongoose");
const conway     = require("./conway");

// --------------------
// Environment
// --------------------
const RPC_URL   = process.env.RPC_URL;
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/gameofdeath";
const BASE_URL  = process.env.BASE_URL || "http://localhost:3000";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

if (!RPC_URL)      throw new Error("RPC_URL must be set in .env");
if (!PRIVATE_KEY)  throw new Error("PRIVATE_KEY must be set in .env");

// --------------------
// MongoDB Setup
// --------------------
mongoose.connect(MONGO_URI);
mongoose.connection
  .once("open", () => console.log("📦 MongoDB:", MONGO_URI))
  .on("error", err => console.error("❌ MongoDB error:", err));

const gameRecordSchema = new mongoose.Schema({
  gameId: Number,
  winner: String,
  timestamp: Date,
  teamRedCount: Number,
  teamBlueCount: Number,
  boardHistory: { type: [[Number]], default: [] },
  skinHistory:  { type: [[Number]], default: [] },
  players: [String],
  thumbnail: String,
});
const GameRecord = mongoose.model("GameRecord", gameRecordSchema);

// --------------------
// Express & Socket.io
// --------------------
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/skins",  express.static(path.join(__dirname, "skins")));
app.use("/chests", express.static(path.join(__dirname, "chests")));
app.use("/songs",  express.static(path.join(__dirname, "songs")));
app.use("/slides", express.static(path.join(__dirname, "slides")));

const serverHttp = http.createServer(app);
const io = new Server(serverHttp, { cors: { origin: "*" } });

// --------------------
// Game State
// --------------------
let phase = "picking";
let phaseTimeLeft = 30;
let boardHistory  = [];
let skinHistory   = [];
let transitionInProgress = false;
let currentGameId = 1;
let cycleCount    = 0;
const activePlayers = new Set();

// Board + skin overlays
let liveSkinOverlay   = Array(4096).fill(0);
let boardSquareOwners = Array(4096).fill(null);

// Timing constants
const PICKING_TIME     = 120;
const PLACING_TIME     = 150;
const FINAL_COUNTDOWN  = 30;
const CONWAY_STEPS     = 10;
const MAX_CYCLES       = 5;
const STEP_DELAY       = 1000;
const FINAL_STEP_DELAY = 2000;

// We will use a block-based polling approach to avoid ephemeral filters
let lastPollBlock = 0; // We'll set it when we enter "placing" phase

// --------------------
// Ethereum Setup
// --------------------
// Always use JsonRpcProvider to avoid ephemeral filter issues with WebSocket
const provider = new ethers.JsonRpcProvider(RPC_URL);

// Periodic keep-alive ping
setInterval(async () => {
  try { await provider.send("net_version", []); } catch {}
}, 10000);

const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

// Load contract ABIs
const gameArtifact     = require("./artifacts/contracts/GameOfDeath.sol/GameOfDeath.json");
const bettingArtifact  = require("./artifacts/contracts/GameOfDeathBetting.sol/GameOfDeathBetting.json");
const mizonsArtifact   = require("./artifacts/contracts/Mizons.sol/Mizons.json");
const skinLockArtifact = require("./artifacts/contracts/SkinLockRegistry.sol/SkinLockRegistry.json");

// Environment addresses
const gameAddress     = process.env.GAMEOFDEATH_ADDRESS;
const bettingAddress  = process.env.GAMEOFDEATH_BETTING_ADDRESS;
const mizonsAddress   = process.env.MIZONS_ADDRESS;
const skinLockAddress = process.env.SKIN_LOCK_ADDRESS;

console.log("📡 Connecting to contracts…");
console.log(" • GameOfDeath:", gameAddress);
console.log(" • Betting:   ", bettingAddress);
console.log(" • Mizons:    ", mizonsAddress);
if (skinLockAddress) console.log(" • SkinLock:  ", skinLockAddress);

let gameContract    = new ethers.Contract(gameAddress,     gameArtifact.abi,    wallet);
let bettingContract = new ethers.Contract(bettingAddress,  bettingArtifact.abi, wallet);
let mizons          = new ethers.Contract(mizonsAddress,   mizonsArtifact.abi,  wallet);
let skinLockContract;
if (skinLockAddress) {
  skinLockContract = new ethers.Contract(skinLockAddress, skinLockArtifact.abi, wallet);
}

// --------------------
// Helpers: sleep & reliable queue
// --------------------
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function attemptTransaction(cb) {
  while (true) {
    try {
      await sleep(200);
      const receipt = await cb();
      return receipt;
    } catch (err) {
      console.error("⚠️ Transaction failed, retrying…", err.message || err);
      await sleep(1000);
    }
  }
}

let transactionQueue = Promise.resolve();
function queueTransaction(cb) {
  transactionQueue = transactionQueue.then(() => attemptTransaction(cb));
  return transactionQueue;
}

async function waitForTxConfirmation(tx, timeout = 90000, interval = 3000) {
  console.log(`🔃 waiting for ${tx.hash}`);
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const rcpt = await provider.getTransactionReceipt(tx.hash);
    if (rcpt) return rcpt;
    await sleep(interval);
  }
  throw new Error("⏱️  tx confirmation timeout");
}

// --------------------
// Skin + Conway Helpers
// --------------------
async function determineSpawnedSkinForUser(user) {
  if (!skinLockContract) return 0;
  try {
    const lockedSkins = await skinLockContract.getLockedSkins(user);
    if (!lockedSkins.length) return 0;
    // pick random locked skin
    const pick = lockedSkins[Math.floor(Math.random() * lockedSkins.length)];
    return Number(pick.bakedId);
  } catch (e) {
    console.error("Skin fetch error:", e);
    return 0;
  }
}

function runSkinStep(oldGrid) {
  const newGrid = Array(4096).fill(0);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const i = y * 64 + x;
      const neighbors = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < 64 && ny >= 0 && ny < 64) {
            const j = ny * 64 + nx;
            if (oldGrid[j]) neighbors.push(oldGrid[j]);
          }
        }
      }
      if (oldGrid[i]) {
        // Survives if 2 or 3 neighbors
        newGrid[i] = (neighbors.length === 2 || neighbors.length === 3) ? oldGrid[i] : 0;
      } else {
        // Spawns if exactly 3 neighbors
        newGrid[i] = (neighbors.length === 3)
          ? neighbors[Math.floor(Math.random() * neighbors.length)]
          : 0;
      }
    }
  }
  return newGrid;
}

// --------------------
// Board Helpers
// --------------------
async function getOnChainBoard() {
  const packed = await gameContract.getBoard();
  const cells = [];
  const total = 4096;
  const per   = 161;
  for (const chunk of packed) {
    let n = BigInt(chunk.toString());
    for (let i = 0; i < per && cells.length < total; i++) {
      cells.push(Number(n % 3n));
      n /= 3n;
    }
  }
  return cells;
}

function convertToAugmentedBoard(board) {
  return board.map(v => ({ value: v }));
}

function packBoard(cells) {
  const per = 161, chunks = 26;
  const arr = Array(chunks).fill(0n);
  cells.forEach((c, i) => {
    const ci = Math.floor(i / per);
    const pos = i % per;
    arr[ci] += BigInt(c) * (3n ** BigInt(pos));
  });
  return arr.map(n => n.toString());
}

// --------------------
// Thumbnail Generation
// --------------------
async function generateThumbnail(board, gameId) {
  const size = 64;
  const scale = 8;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  board.forEach((cell, i) => {
    const x = i % size;
    const y = Math.floor(i / size);
    ctx.fillStyle = cell === 1 ? "#ff0050" : cell === 2 ? "#00bbff" : "#000";
    ctx.fillRect(x, y, 1, 1);
  });

  const big = createCanvas(size * scale, size * scale);
  const bctx = big.getContext("2d");
  bctx.imageSmoothingEnabled = false;
  bctx.drawImage(canvas, 0, 0, size * scale, size * scale);

  const dir = path.join(__dirname, "public", "images");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `game_${gameId}.png`);
  fs.writeFileSync(file, big.toBuffer());
  return `${BASE_URL}/images/game_${gameId}.png`;
}

// --------------------
// Distribute Winnings
// --------------------
async function distributeWinnings(gameId, winningTeam) {
  console.log("💰 distributeWinnings for", gameId, winningTeam);
  const bets = await bettingContract.getBets();
  const winners = [];
  const losers  = [];
  bets.forEach(b => {
    const t  = Number(b.team);
    const tk = Number(b.tickets);
    if (t === winningTeam) winners.push({ user: b.user, tickets: tk });
    else                  losers.push({ user: b.user, tickets: tk });
  });
  const winSum  = winners.reduce((a, b) => a + b.tickets, 0);
  const loseSum = losers.reduce((a, b) => a + b.tickets, 0);
  if (!winSum) {
    console.log("No winners, skip payout");
    return;
  }

  const MULT = 1e6;
  await Promise.all(winners.map(w => {
    const share = Math.floor((w.tickets * loseSum * MULT) / winSum);
    if (!share) return;
    return queueTransaction(async (nonce) => {
      const tx = await mizons.mint(w.user, share, { nonce });
      console.log(`Minted ${share} to ${w.user}`);
      return waitForTxConfirmation(tx);
    });
  }));
  console.log("💸 Payouts done");
}

// --------------------
// resetGame
// --------------------
async function resetGame() {
  console.log("🔄 resetGame()");
  transactionQueue = Promise.resolve(); // clears the tx queue

  const newId = currentGameId + 1;
  try {
    // Clear bets for old game
    await queueTransaction(async (nonce) => {
      const tx = await bettingContract.clearBets(currentGameId, { nonce });
      console.log("clearBets tx:", tx.hash);
      return waitForTxConfirmation(tx);
    });
    // Start new game
    await queueTransaction(async (nonce) => {
      const tx = await gameContract.newGame(newId, { nonce });
      console.log("newGame tx:", tx.hash);
      return waitForTxConfirmation(tx);
    });
    // Open betting
    await queueTransaction(async (nonce) => {
      const tx = await bettingContract.openBetting(newId, { nonce });
      console.log("openBetting tx:", tx.hash);
      return waitForTxConfirmation(tx);
    });
  } catch (e) {
    console.error("resetGame transaction error:", e);
  }

  currentGameId    = newId;
  phase            = "picking";
  phaseTimeLeft    = PICKING_TIME;
  boardHistory     = [];
  skinHistory      = [];
  cycleCount       = 0;
  activePlayers.clear();
  liveSkinOverlay   = Array(4096).fill(0);
  boardSquareOwners = Array(4096).fill(null);

  io.emit("phaseUpdated", { phase, timeLeft: phaseTimeLeft, gameId: currentGameId });
  console.log("▶️ New gameId:", currentGameId);
}

// --------------------
// runConwaySteps
// --------------------
async function runConwaySteps(steps, delay = STEP_DELAY) {
  console.log(`🔀 runConwaySteps(${steps})`);

  let b = await getOnChainBoard();
  for (let i = 1; i <= steps; i++) {
    b = conway.runOneStep(b);
    boardHistory.push([...b]);

    liveSkinOverlay = runSkinStep(liveSkinOverlay);
    skinHistory.push([...liveSkinOverlay]);

    io.emit("boardUpdated", convertToAugmentedBoard(b));
    console.log(`Conway step ${i}/${steps}`);
    await sleep(delay);
  }

  await queueTransaction(async (nonce) => {
    const packed = packBoard(b);
    const tx     = await gameContract.serverOverwriteBoard(packed, { nonce });
    console.log("overwriteBoard tx:", tx.hash);
    return waitForTxConfirmation(tx);
  });
}

// --------------------
// runFinalCycle & recordGame
// --------------------
async function runFinalCycle() {
  console.log("🔚 runFinalCycle()");

  // One last snapshot
  const snap = await getOnChainBoard();
  boardHistory.push([...snap]);
  skinHistory.push([...liveSkinOverlay]);

  // Then run final conway steps
  await runConwaySteps(CONWAY_STEPS, FINAL_STEP_DELAY);

  const finalBoard = await getOnChainBoard();
  let redOnBlue  = 0;
  let blueOnRed  = 0;
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const c = finalBoard[y * 64 + x];
      // Red squares in the “blue” half (y >= 32)
      if (c === 1 && y >= 32) redOnBlue++;
      // Blue squares in the “red” half (y < 32)
      if (c === 2 && y < 32)  blueOnRed++;
    }
  }
  const winner = (redOnBlue === blueOnRed)
    ? "Tie"
    : (redOnBlue > blueOnRed ? "Red" : "Blue");

  io.emit("winner", { winner });
  await recordGame(winner);

  phase         = "final";
  phaseTimeLeft = FINAL_COUNTDOWN;
  io.emit("phaseUpdated", { phase, timeLeft: phaseTimeLeft, gameId: currentGameId });
}

async function recordGame(winner) {
  console.log("📚 recordGame()");
  try {
    const [rBig, bBig] = await gameContract.getTeamCounts(currentGameId);
    const redCount  = Number(rBig);
    const blueCount = Number(bBig);

    // Grab all bets & track unique users in activePlayers
    const bets = await bettingContract.getBets();
    bets.forEach(b => activePlayers.add(b.user.toLowerCase()));

    // Generate thumbnail if we have a board history
    let thumbnail = "";
    if (boardHistory.length) {
      thumbnail = await generateThumbnail(
        boardHistory[boardHistory.length - 1],
        currentGameId
      );
    }

    // Record in Mongo
    const rec = {
      gameId:        currentGameId,
      winner,
      timestamp:     new Date(),
      teamRedCount:  redCount,
      teamBlueCount: blueCount,
      boardHistory,
      skinHistory,
      players:       Array.from(activePlayers),
      thumbnail,
    };
    await new GameRecord(rec).save();
    io.emit("newGameRecord", rec);

    // Distribute Winnings
    if (winner === "Red")  await distributeWinnings(currentGameId, 1);
    if (winner === "Blue") await distributeWinnings(currentGameId, 2);

    activePlayers.clear();
  } catch (e) {
    console.error("recordGame error:", e);
  }
}

// --------------------
// Betting Helpers
// --------------------
async function openBettingForCurrentGame() {
  console.log("▶️ openBetting for", currentGameId);
  await queueTransaction(async (nonce) => {
    const tx = await bettingContract.openBetting(currentGameId, { nonce });
    console.log("openBetting tx:", tx.hash);
    return waitForTxConfirmation(tx);
  });
}

async function closeBettingForCurrentGame() {
  console.log("✋ closeBetting for", currentGameId);
  await queueTransaction(async (nonce) => {
    const tx = await bettingContract.closeBetting({ nonce });
    console.log("closeBetting tx:", tx.hash);
    return waitForTxConfirmation(tx);
  });
}

// --------------------
// Phase Transition Logic
// --------------------
async function setContractPhase(newPhase, attempt = 1) {
  const MAP = { picking: 0, placing: 1, conway: 2, final: 3 };
  const pe  = MAP[newPhase];
  if (pe == null) throw new Error("Unknown phase");

  try {
    await queueTransaction(async (nonce) => {
      const tx = await gameContract.setPhase(pe, { nonce });
      console.log("setPhase tx:", tx.hash);
      return waitForTxConfirmation(tx);
    });
    phase = newPhase;
    io.emit("phaseUpdated", { phase, timeLeft: phaseTimeLeft, gameId: currentGameId });
  } catch (e) {
    console.error("setContractPhase error:", e);
    if (attempt < 3) {
      return setContractPhase(newPhase, attempt + 1);
    }
    console.log("🛑 Max retries, resetting");
    await resetGame();
  }
}

async function transitionPhase() {
  if (transitionInProgress) return;
  transitionInProgress = true;
  try {
    switch (phase) {
      case "picking":
        await closeBettingForCurrentGame();
        await setContractPhase("placing");

        phase         = "placing";
        phaseTimeLeft = PLACING_TIME;

        // set lastPollBlock so our polling for SquarePlaced starts from here
        lastPollBlock = await provider.getBlockNumber();

        break;

      case "placing":
        await setContractPhase("conway");
        await runConwaySteps(CONWAY_STEPS);
        cycleCount++;
        if (cycleCount < MAX_CYCLES) {
          await setContractPhase("picking");
          phase         = "picking";
          phaseTimeLeft = PICKING_TIME;

          // When we go back to picking, open betting again
          await openBettingForCurrentGame();

        } else {
          // If we've reached MAX_CYCLES, proceed to final
          await runFinalCycle();
        }
        break;

      case "final":
        await resetGame();
        break;
    }
  } catch (e) {
    console.error("transitionPhase error:", e);
  } finally {
    io.emit("phaseUpdated", { phase, timeLeft: phaseTimeLeft, gameId: currentGameId });
    transitionInProgress = false;
  }
}

// --------------------
// Main Loop: countdown
// --------------------
setInterval(() => {
  if (!transitionInProgress && phaseTimeLeft > 0) {
    phaseTimeLeft--;
    io.emit("phaseUpdated", { phase, timeLeft: phaseTimeLeft, gameId: currentGameId });
    if (phaseTimeLeft === 0) transitionPhase();
  }
}, 1000);

// --------------------
// Poll for Skin Updates (Block-based)
// --------------------
async function pollBoardForSkinUpdates() {
  // Only poll while in "placing" phase
  if (phase !== "placing") return;

  const currentBlock = await provider.getBlockNumber();
  // If we don't have a starting block yet, skip (or set it to currentBlock)
  if (!lastPollBlock) {
    lastPollBlock = currentBlock;
    return;
  }

  // If lastPollBlock > currentBlock, just skip this iteration (likely chain reorg or something)
  if (lastPollBlock > currentBlock) {
    return;
  }

  // Query logs for SquarePlaced from [lastPollBlock..currentBlock]
  const logs = await gameContract.queryFilter(
    gameContract.filters.SquarePlaced(currentGameId),
    lastPollBlock,
    currentBlock
  );

  for (const log of logs) {
    const x   = Number(log.args.x);
    const y   = Number(log.args.y);
    const idx = y * 64 + x;
    boardSquareOwners[idx] = log.args.user.toLowerCase();
  }

  // Then read the board to see which squares got placed
  const board = await getOnChainBoard();
  for (let i = 0; i < 4096; i++) {
    if (board[i] && !liveSkinOverlay[i] && boardSquareOwners[i]) {
      const skin = await determineSpawnedSkinForUser(boardSquareOwners[i]);
      if (skin) {
        liveSkinOverlay[i] = skin;
      }
    }
  }

  io.emit("skinOverlayUpdated", liveSkinOverlay);

  // Advance the poll window
  lastPollBlock = currentBlock + 1;
}
setInterval(pollBoardForSkinUpdates, 3000); // Poll every 3 seconds

// --------------------
// REST Endpoints
// --------------------
app.get("/api/board", async (r, s) => {
  try {
    const b = await getOnChainBoard();
    s.json({ board: convertToAugmentedBoard(b) });
  } catch (e) {
    s.status(500).json({ error: e.message });
  }
});

app.get("/api/state", (r, s) =>
  s.json({ phase, timeLeft: phaseTimeLeft, gameId: currentGameId })
);

app.get("/api/history", (r, s) =>
  s.json({ boardHistory, skinHistory })
);

app.get("/api/skinOverlay", (r, s) =>
  s.json({ skinOverlay: liveSkinOverlay })
);

app.get("/api/allRecords", async (r, s) => {
  const skip = +r.query.skip || 0;
  const limit = +r.query.limit || 10;
  const recs = await GameRecord.find().sort({ gameId: -1 }).skip(skip).limit(limit);
  s.json({ records: recs });
});

app.get("/api/records/:u", async (r, s) => {
  const skip = +r.query.skip || 0;
  const limit = +r.query.limit || 10;
  const userAddr = r.params.u.toLowerCase();
  const recs = await GameRecord.find({ players: userAddr })
    .sort({ gameId: -1 })
    .skip(skip)
    .limit(limit);
  s.json({ records: recs });
});

app.get("/api/recordById/:i", async (r, s) => {
  const rec = await GameRecord.findOne({ gameId: +r.params.i });
  if (!rec) return s.status(404).json({ error: "Not found" });
  s.json({ record: rec });
});

app.get("/api/bets/:g", async (r, s) => {
  try {
    const bets = await bettingContract.getBets();
    s.json({
      bets: bets.map(b => ({
        user: b.user,
        team: Number(b.team),
        tickets: b.tickets.toString()
      }))
    });
  } catch (e) {
    console.error("bets error:", e);
    s.status(500).json({ error: "Failed to fetch bets" });
  }
});

app.post("/admin/reset-to-game1", async (r, s) => {
  const imgDir = path.join(__dirname, "public", "images");
  if (fs.existsSync(imgDir)) {
    fs.readdirSync(imgDir).forEach(f => fs.unlinkSync(path.join(imgDir, f)));
  }
  await GameRecord.deleteMany({});
  await resetGame();
  s.json({ message: "Reset complete" });
});

// --------------------
// Startup
// --------------------
(async () => {
  try {
    const onChainId    = await gameContract.currentGameId();
    const onChainPhase = Number(await gameContract.currentPhase());
    currentGameId      = Number(onChainId);

    if (onChainPhase === 3) {
      // If the chain says "final" phase, reset to a new game
      await resetGame();
    } else {
      // Otherwise, set to picking
      await setContractPhase("picking");
      phase = "picking";
      phaseTimeLeft = PICKING_TIME;
      io.emit("phaseUpdated", { phase, timeLeft: phaseTimeLeft, gameId: currentGameId });
      await openBettingForCurrentGame();
    }
    console.log("🚀 Server up, gameId =", currentGameId);
  } catch (e) {
    console.error("Startup error:", e);
  }
})();

const PORT = process.env.PORT || 3000;
serverHttp.listen(PORT, () => {
  console.log(`🌐 Listening on ${BASE_URL}:${PORT}`);
});

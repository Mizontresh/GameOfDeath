require("dotenv").config();
const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const { ethers } = require("ethers");
const { createCanvas } = require("canvas"); // node-canvas for thumbnails
const conway = require("./conway"); // your Conway logic

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from the "public" folder (for images, etc.)
app.use(express.static(path.join(__dirname, "public")));

const serverHttp = http.createServer(app);
const io = new Server(serverHttp, { cors: { origin: "*" } });

// WebSocket provider & wallet
const wsProvider = new ethers.WebSocketProvider("ws://127.0.0.1:8545");
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, wsProvider);

// Load contract
const artifact = require("./artifacts/contracts/GameOfDeath.sol/GameOfDeath.json");
const gameAddress = process.env.GAMEOFDEATH_ADDRESS;
const gameContract = new ethers.Contract(gameAddress, artifact.abi, wallet);

// Settings
const PICKING_TIME = 30;
const PLACING_TIME = 30;
const UPDATE_INTERVAL = 10;       // number of Conway steps off-chain
const FINAL_CONWAY_STEPS = 10;    // final steps
const MAX_CYCLES = 1;
const WINNER_OVERLAY_TIME = 30;

const STATE_FILE = "phaseState.json";
const RECORDS_FILE = "gameRecords.json";

let defaultState = {
  phase: "picking",
  phaseTimeLeft: PICKING_TIME,
  cycleCount: 0,
  boardHistory: []
};

let phase, phaseTimeLeft, cycleCount, boardHistory;
try {
  const data = fs.readFileSync(STATE_FILE, "utf8");
  if (!data.trim()) throw new Error("Empty state file");
  const parsed = JSON.parse(data);
  phase = parsed.phase;
  phaseTimeLeft = parsed.phaseTimeLeft;
  cycleCount = parsed.cycleCount;
  boardHistory = parsed.boardHistory || [];
  console.log("Loaded state:", phase, phaseTimeLeft, "Cycle:", cycleCount);
} catch (err) {
  console.log("No valid state file found – reverting to default state.");
  phase = defaultState.phase;
  phaseTimeLeft = defaultState.phaseTimeLeft;
  cycleCount = defaultState.cycleCount;
  boardHistory = defaultState.boardHistory;
}

let transitionInProgress = false;
let currentGameId = 1;
let teamCounts = { red: 0, blue: 0 };
let activePlayers = new Set();

// Sleep helper
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Transaction queue for nonce
let transactionQueue = Promise.resolve();
function queueTransaction(callback) {
  transactionQueue = transactionQueue.then(async () => {
    await sleep(200);
    let nonce = await wsProvider.getTransactionCount(wallet.address, "pending");
    try {
      return await callback(nonce);
    } catch (err) {
      if (err.message && err.message.includes("Nonce too low")) {
        console.log("Nonce error encountered. Retrying transaction.");
        await sleep(200);
        nonce = await wsProvider.getTransactionCount(wallet.address, "pending");
        return await callback(nonce);
      }
      throw err;
    }
  });
  return transactionQueue;
}

async function checkTxConfirmation(tx) {
  const receipt = await wsProvider.getTransactionReceipt(tx.hash);
  return receipt !== null ? receipt : tx.wait();
}

/** 
 * getOnChainBoard
 * Reads the packed board from the contract, decodes to an array of 4096 numbers (0,1,2).
 */
async function getOnChainBoard() {
  const packed = await gameContract.getBoard(); // array of BigNumber
  const CELLS_PER_CHUNK = 161;
  const totalCells = 4096;
  let cells = [];
  for (let i = 0; i < packed.length; i++) {
    let chunk = BigInt(packed[i].toString());
    for (let j = 0; j < CELLS_PER_CHUNK; j++) {
      if (cells.length >= totalCells) break;
      let cell = Number(chunk % 3n);
      cells.push(cell);
      chunk /= 3n;
    }
  }
  return cells;
}

// Listen for contract events
gameContract.on("SquarePlaced", async (user, x, y, color) => {
  console.log("SquarePlaced:", user, x.toString(), y.toString(), color.toString());
  activePlayers.add(user.toLowerCase());
  try {
    const board = await getOnChainBoard();
    io.emit("boardUpdated", convertToAugmentedBoard(board));
  } catch (err) {
    console.error("Error in SquarePlaced handler:", err);
  }
});

gameContract.on("TeamChanged", (user, newTeam, theGameId) => {
  console.log("TeamChanged:", user, newTeam.toString(), "Game:", theGameId.toString());
  activePlayers.add(user.toLowerCase());
});

// BASE_URL for images
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

// Convert numeric board to augmented objects: { value, skin }
function convertToAugmentedBoard(numericalBoard) {
  return numericalBoard.map((val) => ({
    value: val,
    skin: null  // could assign a skin ID if you have that logic
  }));
}

/** 
 * generateThumbnail
 * Renders a 64x64 board to 512x512 PNG for the final game record.
 */
async function generateThumbnail(board, gameId) {
  const width = 64;
  const height = 64;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const cell = board[idx];
      ctx.fillStyle = (cell === 1) ? "#ff0050" : (cell === 2) ? "#00bbff" : "#000000";
      ctx.fillRect(x, y, 1, 1);
    }
  }

  const scale = 8;
  const scaledCanvas = createCanvas(width * scale, height * scale);
  const scaledCtx = scaledCanvas.getContext("2d");
  scaledCtx.imageSmoothingEnabled = false;
  scaledCtx.drawImage(canvas, 0, 0, width * scale, height * scale);

  const imageDir = path.join(__dirname, "public", "images");
  if (!fs.existsSync(imageDir)) {
    fs.mkdirSync(imageDir, { recursive: true });
  }
  const imagePath = path.join(imageDir, `game_${gameId}.png`);
  const buffer = scaledCanvas.toBuffer("image/png");
  fs.writeFileSync(imagePath, buffer);
  console.log(`Thumbnail saved as ${imagePath}`);

  return `${BASE_URL}/images/game_${gameId}.png`;
}

/**
 * packBoard
 * Takes an array of 4096 numbers (0..2) => array of 26 base-3 bigints => strings
 */
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

/**
 * runConwaySteps
 * Off-chain sim for N steps, 0.5s each, then final on-chain push.
 */
async function runConwaySteps(totalTurns) {
  let currentBoard = await getOnChainBoard();
  for (let turn = 1; turn <= totalTurns; turn++) {
    // One step
    currentBoard = conway.runOneStep(currentBoard);
    // Save to boardHistory
    boardHistory.push([...currentBoard]);
    // Emit
    io.emit("boardUpdated", convertToAugmentedBoard(currentBoard));
    // Wait 0.5s
    await sleep(500);
  }
  // Push final
  await queueTransaction(async (nonce) => {
    const packed = packBoard(currentBoard);
    const tx = await gameContract.serverOverwriteBoard(packed, { nonce });
    console.log(`On-chain update pushed after ${totalTurns} turns, tx hash: ${tx.hash}`);
    const receipt = await checkTxConfirmation(tx);
    console.log("Final on-chain update confirmed:", receipt);
    io.emit("boardUpdated", convertToAugmentedBoard(currentBoard));
  });
}

async function setContractPhase(newPhase) {
  let enumVal = (newPhase === "picking") ? 0 : (newPhase === "placing") ? 1 : 2;
  console.log(`Setting phase to ${newPhase} (enum: ${enumVal})`);
  try {
    await queueTransaction(async (nonce) => {
      const tx = await gameContract.setPhase(enumVal, { nonce });
      console.log("setPhase tx:", tx.hash);
      const receipt = await checkTxConfirmation(tx);
      console.log("Phase set confirmed:", receipt);
    });
  } catch (err) {
    console.error("Error setting phase:", err);
    if (err.message && err.message.includes("Game is over")) {
      console.log("Game is over; resetting game.");
      await resetGame();
      return;
    }
    throw err;
  }
  phase = newPhase;
  io.emit("phaseUpdated", { phase, timeLeft: phaseTimeLeft });
}

async function computeWinner() {
  const board = await getOnChainBoard();
  let redOnBlue = 0, blueOnRed = 0;
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const idx = y * 64 + x;
      const cell = board[idx];
      if (cell === 1 && y >= 32) redOnBlue++;
      if (cell === 2 && y < 32) blueOnRed++;
    }
  }
  console.log("Red on Blue:", redOnBlue, "Blue on Red:", blueOnRed);
  if (redOnBlue === blueOnRed) return "Tie";
  return (redOnBlue > blueOnRed) ? "Red" : "Blue";
}

async function recordGame(winner) {
  try {
    const [rC, bC] = await Promise.all([
      gameContract.teamACount(),
      gameContract.teamBCount()
    ]);
    teamCounts.red = Number(rC);
    teamCounts.blue = Number(bC);
  } catch (err) {
    console.error("Error updating team counts:", err);
  }

  let records = [];
  try {
    const data = fs.readFileSync(RECORDS_FILE, "utf8");
    if (data.trim()) {
      records = JSON.parse(data);
    }
  } catch (err) {
    console.log("No records file found. Creating new one.");
  }

  let thumbnail = "";
  if (boardHistory.length > 0) {
    // The last board in boardHistory is the final
    thumbnail = await generateThumbnail(boardHistory[boardHistory.length - 1], currentGameId);
  }

  const record = {
    gameId: currentGameId,
    winner,
    timestamp: new Date().toISOString(),
    teamRedCount: teamCounts.red,
    teamBlueCount: teamCounts.blue,
    boardHistory,
    players: Array.from(activePlayers),
    thumbnail
  };

  records.push(record);
  try {
    fs.writeFileSync(RECORDS_FILE, JSON.stringify(records, null, 2), "utf8");
    console.log("Game recorded:", record);
  } catch (err) {
    console.error("Error writing records file:", err);
  }
  activePlayers.clear();
}

async function resetGame() {
  const newId = currentGameId + 1;
  try {
    await queueTransaction(async (nonce) => {
      const tx = await gameContract.newGame(newId, { nonce });
      console.log("newGame tx:", tx.hash);
      const receipt = await checkTxConfirmation(tx);
      console.log("Game reset confirmed:", receipt);
    });
  } catch (err) {
    console.error("Error resetting game:", err);
  }
  currentGameId = newId;
  phase = "picking";
  phaseTimeLeft = PICKING_TIME;
  cycleCount = 0;
  boardHistory = [];
  io.emit("phaseUpdated", { phase, timeLeft: phaseTimeLeft });
  try {
    fs.unlinkSync(STATE_FILE);
  } catch (err) {
    console.error("Error clearing state file:", err);
  }
  console.log("Game reset complete, new gameId:", currentGameId);
}

// Startup check
(async () => {
  try {
    const currentPhaseEnum = await gameContract.currentPhase();
    if (Number(currentPhaseEnum) === 3) {
      console.log("Game is over on startup; resetting...");
      const newId = currentGameId + 1;
      const tx = await gameContract.newGame(newId);
      await tx.wait();
      currentGameId = newId;
      phase = "picking";
      phaseTimeLeft = PICKING_TIME;
      cycleCount = 0;
      boardHistory = [];
      console.log("Game reset on startup.");
    } else {
      console.log("Game not over on startup; continuing.");
    }
  } catch (err) {
    console.error("Startup reset error:", err);
  }
})();

// Main loop (1 second)
setInterval(async () => {
  try {
    if (phase === "picking" || phase === "placing") {
      if (phaseTimeLeft > 0) {
        phaseTimeLeft--;
        io.emit("phaseUpdated", { phase, timeLeft: phaseTimeLeft });
      } else {
        if (!transitionInProgress) {
          transitionInProgress = true;
          if (phase === "picking") {
            await setContractPhase("placing");
            phaseTimeLeft = PLACING_TIME;
            io.emit("phaseUpdated", { phase, timeLeft: phaseTimeLeft });
          } else if (phase === "placing") {
            console.log("Transition: Placing -> Conway");
            if (cycleCount < MAX_CYCLES - 1) {
              await setContractPhase("conway");
              phaseTimeLeft = 0;
              let initialBoard = await getOnChainBoard();
              boardHistory.push([...initialBoard]);
              await runConwaySteps(UPDATE_INTERVAL);
              cycleCount++;
              console.log("Cycle", cycleCount, "complete. Returning to picking.");
              try {
                await setContractPhase("picking");
              } catch (e) {
                if (e.message.includes("Game is over")) {
                  console.log("Game is over; resetting.");
                  await resetGame();
                } else {
                  throw e;
                }
              }
              phaseTimeLeft = PICKING_TIME;
              io.emit("phaseUpdated", { phase, timeLeft: phaseTimeLeft });
            } else {
              await setContractPhase("conway");
              phaseTimeLeft = 0;
              const finalBoard = await getOnChainBoard();
              boardHistory.push(finalBoard);
              io.emit("phaseUpdated", { phase, timeLeft: phaseTimeLeft });
              await runConwaySteps(FINAL_CONWAY_STEPS);
              const winner = await computeWinner();
              console.log("Winner is:", winner);
              io.emit("winner", { winner });
              await recordGame(winner);
              phase = "final";
              phaseTimeLeft = WINNER_OVERLAY_TIME;
              io.emit("phaseUpdated", { phase, timeLeft: phaseTimeLeft });
            }
          }
          transitionInProgress = false;
        }
      }
    } else if (phase === "final") {
      if (phaseTimeLeft > 0) {
        phaseTimeLeft--;
        io.emit("phaseUpdated", { phase, timeLeft: phaseTimeLeft });
      } else {
        console.log("Final overlay expired; resetting game.");
        await queueTransaction(async (nonce) => {
          const tx = await gameContract.endGame({ nonce });
          console.log("endGame tx:", tx.hash);
          const receipt = await checkTxConfirmation(tx);
          console.log("endGame receipt:", receipt);
        });
        await resetGame();
      }
    }
  } catch (err) {
    console.error("Error in main loop:", err);
  }
  // Persist state
  try {
    fs.writeFileSync(
      STATE_FILE,
      JSON.stringify({ phase, phaseTimeLeft, cycleCount, boardHistory }),
      "utf8"
    );
  } catch (err) {
    console.error("Error writing state file:", err);
  }
}, 1000);

// API endpoints
app.get("/api/board", async (req, res) => {
  try {
    const board = await getOnChainBoard();
    res.json({ board: convertToAugmentedBoard(board) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/state", (req, res) => {
  res.json({ phase, timeLeft: phaseTimeLeft, cycleCount });
});

app.get("/api/history", (req, res) => {
  // boardHistory is an array of raw numeric boards, not augmented
  // The frontend can use these for replay if needed
  res.json({ boardHistory });
});

app.get("/api/allRecords", (req, res) => {
  try {
    let records = [];
    try {
      const data = fs.readFileSync(RECORDS_FILE, "utf8");
      if (data.trim()) {
        records = JSON.parse(data);
      }
    } catch (err) {
      console.error("No records file found.");
    }
    records.sort((a, b) => b.gameId - a.gameId);
    res.json({ records });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/records/:userAddress", (req, res) => {
  try {
    const userAddr = req.params.userAddress.toLowerCase();
    let records = [];
    try {
      const data = fs.readFileSync(RECORDS_FILE, "utf8");
      if (data.trim()) {
        records = JSON.parse(data);
      }
    } catch (err) {
      console.error("No records file found.");
    }
    const userRecords = records.filter(record =>
      record.players && record.players.map(p => p.toLowerCase()).includes(userAddr)
    );
    userRecords.sort((a, b) => b.gameId - a.gameId);
    res.json({ records: userRecords });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/recordById/:gameId", (req, res) => {
  try {
    const requestedId = Number(req.params.gameId);
    let records = [];
    try {
      const data = fs.readFileSync(RECORDS_FILE, "utf8");
      if (data.trim()) {
        records = JSON.parse(data);
      }
    } catch (err) {
      console.error("No records file found.");
    }
    const record = records.find(r => r.gameId === requestedId);
    if (!record) {
      return res.status(404).json({ error: `Record not found for gameId ${requestedId}` });
    }
    res.json({ record });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
serverHttp.listen(PORT, () => {
  console.log(`Server running on ${BASE_URL}`);
  console.log("Using contract:", gameAddress);
});

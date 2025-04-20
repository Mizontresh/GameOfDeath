// server.cjs
require("dotenv").config();
const fs           = require("fs");
const path         = require("path");
const express      = require("express");
const cors         = require("cors");
const http         = require("http");
const { Server }   = require("socket.io");
const { ethers }   = require("ethers");
const { createCanvas } = require("canvas");
const mongoose     = require("mongoose");
const conway       = require("./conway");

// ─── Environment & HTTP Provider ─────────────────────────────────────────────
const {
  RPC_URL,
  PRIVATE_KEY,
  MONGO_URI         = "mongodb://127.0.0.1:27017/gameofdeath",
  // use your public IP or domain here, or override via env
  BASE_URL          = process.env.BASE_URL || "http://3.234.250.159:3000",
  GAMEOFDEATH_ADDRESS,
  GAMEOFDEATH_BETTING_ADDRESS,
  MIZONS_ADDRESS,
  SKIN_LOCK_ADDRESS
} = process.env;

if (!RPC_URL || !PRIVATE_KEY) {
  console.error("❌ RPC_URL and PRIVATE_KEY are required");
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
// keep HTTP alive
setInterval(() => provider.send("net_version", []).catch(() => {}), 10_000);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

// ─── MongoDB Setup ────────────────────────────────────────────────────────────
mongoose.connect(MONGO_URI);
mongoose.connection
  .once("open", () => console.log("✅ MongoDB connected"))
  .on("error", err => console.error("❌ MongoDB error:", err));

const gameRecordSchema = new mongoose.Schema({
  gameId:        Number,
  winner:        String,
  timestamp:     Date,
  teamRedCount:  Number,
  teamBlueCount: Number,
  boardHistory: { type: [[Number]], default: [] },
  skinHistory:  { type: [[Number]], default: [] },
  players:      [String],
  thumbnail:    String,
});
const GameRecord = mongoose.model("GameRecord", gameRecordSchema);

// ─── Express & Socket.io ──────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/skins",  express.static(path.join(__dirname, "skins")));
app.use("/chests", express.static(path.join(__dirname, "chests")));
app.use("/songs",  express.static(path.join(__dirname, "songs")));
app.use("/slides", express.static(path.join(__dirname, "slides")));

const serverHttp = http.createServer(app);
const io         = new Server(serverHttp, { cors: { origin: "*" } });

// ─── ABIs & Contracts ────────────────────────────────────────────────────────
const gameABI     = require("./artifacts/contracts/GameOfDeath.sol/GameOfDeath.json").abi;
const bettingABI  = require("./artifacts/contracts/GameOfDeathBetting.sol/GameOfDeathBetting.json").abi;
const mizonsABI   = require("./artifacts/contracts/Mizons.sol/Mizons.json").abi;
const skinLockABI = require("./artifacts/contracts/SkinLockRegistry.sol/SkinLockRegistry.json").abi;

const gameContract    = new ethers.Contract(GAMEOFDEATH_ADDRESS,        gameABI,    wallet);
const bettingContract = new ethers.Contract(GAMEOFDEATH_BETTING_ADDRESS, bettingABI, wallet);
const mizonsContract  = new ethers.Contract(MIZONS_ADDRESS,              mizonsABI,  wallet);
const skinLockContract= SKIN_LOCK_ADDRESS
  ? new ethers.Contract(SKIN_LOCK_ADDRESS, skinLockABI, wallet)
  : null;

// ─── Game Loop State ─────────────────────────────────────────────────────────
let phase                = "picking";
let phaseTimeLeft        = 120;
let currentGameId        = 1;
let cycleCount           = 0;
let transitionInProgress = false;
let initialized          = false;

let boardHistory        = [];
let skinHistory         = [];
let liveSkinOverlay     = Array(4096).fill(0);
let boardSquareOwners   = Array(4096).fill(null);

let lastJoinBlock  = 0;
let lastPlaceBlock = 0;
const activePlayers = new Set();

// ─── Timing Constants ─────────────────────────────────────────────────────────
const PICKING_TIME     = 150;
const PLACING_TIME     = 150;
const FINAL_COUNTDOWN  = 30;
const CONWAY_STEPS     = 50;
const MAX_CYCLES       = 3;
const STEP_DELAY       = 1000;
const FINAL_STEP_DELAY = 2000;

// ─── Helpers ─────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));
function toNumber(bn) {
  const s = bn.toString();
  return s.length < 16 ? Number(s) : Number(s.slice(-13));
}

async function sendTx(fn, label, confirmations = 1) {
  console.log(`▶️ [tx] ${label}`);
  const tx      = await fn();
  console.log(`   ↳ sent: ${tx.hash}`);
  const receipt = await tx.wait(confirmations);
  console.log(`✅ [conf] ${label} in block ${receipt.blockNumber}`);
  return receipt;
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

async function getOnChainBoard() {
  const packed = await gameContract.getBoard();
  const cells  = [];
  const per     = 161, total = 4096;
  for (let chunk of packed) {
    let n = BigInt(chunk.toString());
    for (let i = 0; i < per && cells.length < total; i++) {
      cells.push(Number(n % 3n));
      n /= 3n;
    }
  }
  return cells;
}

function packBoard(cells) {
  const per    = 161, chunks = 26;
  const arr    = Array(chunks).fill(0n);
  cells.forEach((c,i) => {
    const ci = Math.floor(i / per), pos = i % per;
    arr[ci] += BigInt(c) * (3n ** BigInt(pos));
  });
  return arr.map(n => n.toString());
}

function runSkinStep(oldGrid) {
  const newGrid = Array(4096).fill(0);
  for (let y=0; y<64; y++) for (let x=0; x<64; x++) {
    const i    = y * 64 + x;
    const neigh = [];
    for (let dy=-1; dy<=1; dy++) for (let dx=-1; dx<=1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx>=0 && nx<64 && ny>=0 && ny<64) {
        const j = ny * 64 + nx;
        if (oldGrid[j]) neigh.push(oldGrid[j]);
      }
    }
    if (oldGrid[i]) {
      newGrid[i] = (neigh.length === 2 || neigh.length === 3) ? oldGrid[i] : 0;
    } else {
      newGrid[i] = (neigh.length === 3)
        ? neigh[Math.floor(Math.random() * neigh.length)]
        : 0;
    }
  }
  return newGrid;
}

async function determineSpawnedSkinForUser(user) {
  if (!skinLockContract) return 0;
  try {
    const locked = await skinLockContract.getLockedSkins(user);
    if (!locked.length) return 0;
    return Number(locked[Math.floor(Math.random() * locked.length)].bakedId);
  } catch {
    return 0;
  }
}

async function generateThumbnail(board, gameId) {
  const size   = 64, scale = 8;
  const canvas = createCanvas(size, size);
  const ctx    = canvas.getContext("2d");
  board.forEach((c, i) => {
    ctx.fillStyle = c === 1 ? "#ff0050" : c === 2 ? "#00bbff" : "#000";
    ctx.fillRect(i % size, Math.floor(i / size), 1, 1);
  });

  const big  = createCanvas(size*scale, size*scale);
  const bctx = big.getContext("2d");
  bctx.imageSmoothingEnabled = false;
  bctx.drawImage(canvas, 0, 0, size*scale, size*scale);

  const dir  = path.join(__dirname, "public", "images");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `game_${gameId}.png`);
  fs.writeFileSync(file, big.toBuffer());
  return `${BASE_URL}/images/game_${gameId}.png`;
}

// ─── Duplicate on clients: phase, board & skin overlay ──────────────────────
function broadcastState() {
  // 1) phase
  io.emit("phaseUpdated", {
    phase,
    timeLeft: phaseTimeLeft,
    gameId: currentGameId,
  });

  // 2) board (latest snapshot)
  const lastBoard = boardHistory.length
    ? boardHistory[boardHistory.length - 1].map(v => ({ value: v }))
    : [];
  io.emit("boardUpdated", lastBoard);

  // 3) skin overlay grid
  io.emit("skinOverlayUpdated", liveSkinOverlay);
}

// ─── Distribute winnings (batch‑mint) ─────────────────────────────────────────
async function distributeWinnings(gameId, winTeam) {
  console.log("💰 distributeWinnings for", gameId, winTeam);
  const bets    = await bettingContract.getBets();
  const winners = bets.filter(b => Number(b.team) === winTeam);
  const losers  = bets.filter(b => Number(b.team) !== winTeam);
  const winSum  = winners.reduce((a,b) => a + Number(b.tickets), 0);
  const loseSum = losers.reduce((a,b) => a + Number(b.tickets), 0);
  if (!winSum) return console.log("No winners");

  const recipients = winners.map(w => w.user);
  const amounts    = winners.map(w =>
    Math.floor(Number(w.tickets) * loseSum / winSum)
  );

  // scale up by 10^6 so that 1 → 1 μMIZ
  const MICRO_SCALE = BigInt(1_000_000);
  const rawAmounts  = amounts.map(a => BigInt(a) * MICRO_SCALE);

  const CHUNK_SIZE = 200;
  const recChunks  = chunkArray(recipients, CHUNK_SIZE);
  const amtChunks  = chunkArray(rawAmounts,   CHUNK_SIZE);

  for (let i = 0; i < recChunks.length; i++) {
    await sendTx(
      () => mizonsContract.mintBatch(recChunks[i], amtChunks[i]),
      `mintBatch ${i+1}/${recChunks.length} (${recChunks[i].length} addresses)`
    );
  }
  console.log("💸 all batches done");
}

// ─── Reset & New Game ─────────────────────────────────────────────────────────
async function resetGame() {
  console.log("🔄 [step] resetGame()");
  const newId = currentGameId + 1;

  await sendTx(() => bettingContract.clearBets(currentGameId),  `clearBets(${currentGameId})`);
  await sendTx(() => gameContract.newGame(newId),              `newGame(${newId})`);
  await sendTx(() => bettingContract.openBetting(newId),       `openBetting(${newId})`);

  currentGameId       = newId;
  phase               = "picking";
  phaseTimeLeft       = PICKING_TIME;
  cycleCount          = 0;
  boardHistory        = [];
  skinHistory         = [];
  liveSkinOverlay     = Array(4096).fill(0);
  boardSquareOwners   = Array(4096).fill(null);
  activePlayers.clear();

  const now = await provider.getBlockNumber();
  lastJoinBlock = lastPlaceBlock = now + 1;

  console.log(`▶️ [step] New gameId=${currentGameId}, phase reset to "picking"`);
  broadcastState();
}

// ─── Conway Steps ────────────────────────────────────────────────────────────
async function runConwaySteps(steps, delay = STEP_DELAY) {
  console.log(`🔀 [step] runConwaySteps(${steps})`);
  let b = await getOnChainBoard();
  for (let i = 1; i <= steps; i++) {
    b = conway.runOneStep(b);
    boardHistory.push([...b]);
    liveSkinOverlay = runSkinStep(liveSkinOverlay);
    skinHistory.push([...liveSkinOverlay]);
    // broadcast updated board + skins each step
    broadcastState();
    console.log(`   ↳ Conway step ${i}/${steps}`);
    await sleep(delay);
  }
  await sendTx(
    () => gameContract.serverOverwriteBoard(packBoard(b)),
    "serverOverwriteBoard"
  );
}

// ─── Final Cycle & Record ────────────────────────────────────────────────────
async function runFinalCycle() {
  console.log("🔚 [step] runFinalCycle()");
  const snap = await getOnChainBoard();
  boardHistory.push([...snap]);
  skinHistory.push([...liveSkinOverlay]);

  await runConwaySteps(CONWAY_STEPS, FINAL_STEP_DELAY);

  const finalB     = await getOnChainBoard();
  let redOnBlue    = 0;
  let blueOnRed    = 0;
  finalB.forEach((c,i) => {
    const y = Math.floor(i/64);
    if (c === 1 && y >= 32) redOnBlue++;
    if (c === 2 && y < 32)  blueOnRed++;
  });
  const winner = redOnBlue === blueOnRed
               ? "Tie"
               : (redOnBlue > blueOnRed ? "Red" : "Blue");

  console.log(`   ↳ Final: RedOnBlue=${redOnBlue}, BlueOnRed=${blueOnRed} → ${winner}`);
  io.emit("winner", { winner });
  await recordGame(winner);

  phase         = "final";
  phaseTimeLeft = FINAL_COUNTDOWN;
  broadcastState();
}

// ─── Record Game ──────────────────────────────────────────────────────────────
async function recordGame(winner) {
  console.log("📚 [step] recordGame()");
  const [rBig, bBig] = await gameContract.getTeamCounts(currentGameId);
  const redCount     = toNumber(rBig);
  const blueCount    = toNumber(bBig);

  const bets = await bettingContract.getBets();
  bets.forEach(b => activePlayers.add(b.user.toLowerCase()));

  let thumbnail = "";
  if (boardHistory.length) {
    thumbnail = await generateThumbnail(
      boardHistory[boardHistory.length - 1],
      currentGameId
    );
  }

  const rec = {
    gameId:        currentGameId,
    winner,
    timestamp:     new Date(),
    teamRedCount:  redCount,
    teamBlueCount: blueCount,
    boardHistory,
    skinHistory,
    players:       Array.from(activePlayers),
    thumbnail
  };
  await new GameRecord(rec).save();
  io.emit("newGameRecord", rec);

  if (winner === "Red")  await distributeWinnings(currentGameId, 1);
  if (winner === "Blue") await distributeWinnings(currentGameId, 2);
  activePlayers.clear();
}

// ─── Betting Control ──────────────────────────────────────────────────────────
async function openBettingForCurrentGame() {
  console.log(`▶️ [step] openBetting(${currentGameId})`);
  await sendTx(
    () => bettingContract.openBetting(currentGameId),
    `openBetting(${currentGameId})`
  );
}

async function closeBettingForCurrentGame() {
  console.log(`✋ [step] closeBetting()`);
  await sendTx(
    () => bettingContract.closeBetting(),
    `closeBetting()`
  );
}

// ─── Phase Transitions ────────────────────────────────────────────────────────
async function setContractPhase(newPhase, attempt = 1) {
  const MAP = { picking:0, placing:1, conway:2, final:3 };
  const pe  = MAP[newPhase];
  if (pe == null) throw new Error("Unknown phase "+newPhase);
  console.log(`🎛 [step] setContractPhase("${newPhase}") attempt ${attempt}`);
  try {
    await sendTx(
      () => gameContract.setPhase(pe),
      `setPhase(${newPhase})`
    );
    phase = newPhase;
    console.log(`   ↳ on‑chain phase now "${newPhase}"`);
    broadcastState();
  } catch (e) {
    console.error("‼️ setContractPhase error:", e);
    if (attempt < 3) return setContractPhase(newPhase, attempt+1);
    console.error("‼️ Max retries, invoking resetGame()");
    await resetGame();
  }
}

async function transitionPhase() {
  if (transitionInProgress) return;
  transitionInProgress = true;
  console.log(`⏭ [step] transitionPhase() from "${phase}"`);
  try {
    switch (phase) {
      case "picking":
        await closeBettingForCurrentGame();
        await setContractPhase("placing");
        phaseTimeLeft = PLACING_TIME;
        lastJoinBlock  = lastPlaceBlock = await provider.getBlockNumber() + 1;
        break;
      case "placing":
        await setContractPhase("conway");
        await runConwaySteps(CONWAY_STEPS);
        cycleCount++;
        if (cycleCount < MAX_CYCLES) {
          await setContractPhase("picking");
          phaseTimeLeft = PICKING_TIME;
          await openBettingForCurrentGame();
        } else {
          await runFinalCycle();
        }
        break;
      case "final":
        await resetGame();
        break;
    }
  } catch (e) {
    console.error("‼️ transitionPhase error:", e);
  } finally {
    broadcastState();
    transitionInProgress = false;
  }
}

// ─── Main Loops ────────────────────────────────────────────────────────────────
setInterval(() => {
  if (!initialized || transitionInProgress || phaseTimeLeft <= 0) return;
  phaseTimeLeft--;
  console.log(`⏱ [Timer] Phase "${phase}", timeLeft=${phaseTimeLeft}s`);
  broadcastState();
  if (phaseTimeLeft === 0) transitionPhase();
}, 1000);

// Polling for logs during placing
setInterval(async () => {
  if (phase !== "placing") return;
  try {
    const currentBlock = await provider.getBlockNumber();

    // 1) TeamJoined logs
    if (currentBlock >= lastJoinBlock) {
      const joins = await gameContract.queryFilter(
        gameContract.filters.TeamJoined(currentGameId),
        lastJoinBlock,
        currentBlock
      );
      joins.forEach(log => activePlayers.add(log.args.user.toLowerCase()));
      lastJoinBlock = currentBlock + 1;
    }

    // 2) SquarePlaced logs
    if (currentBlock >= lastPlaceBlock) {
      const places = await gameContract.queryFilter(
        gameContract.filters.SquarePlaced(currentGameId),
        lastPlaceBlock,
        currentBlock
      );
      places.forEach(log => {
        const x = Number(log.args.x),
              y = Number(log.args.y);
        boardSquareOwners[y * 64 + x] = log.args.user.toLowerCase();
      });
      lastPlaceBlock = currentBlock + 1;
    }

    // 3) Skin‑spawn logic
    const board = await getOnChainBoard();
    for (let i = 0; i < 4096; i++) {
      if (board[i] && !liveSkinOverlay[i] && boardSquareOwners[i]) {
        const skin = await determineSpawnedSkinForUser(boardSquareOwners[i]);
        if (skin) liveSkinOverlay[i] = skin;
      }
    }

    // 4) **Emit both** the new board _and_ the skin overlay
    const augmentedBoard = board.map(v => ({ value: v }));
    io.emit("boardUpdated", augmentedBoard);
    io.emit("skinOverlayUpdated", liveSkinOverlay);

  } catch (err) {
    console.error("‼️ Polling error:", err);
  }
}, 3000);

// ─── Initial Sync ─────────────────────────────────────────────────────────────
io.on("connection", socket => {
  // phase
  socket.emit("phaseUpdated", {
    phase,
    timeLeft: phaseTimeLeft,
    gameId: currentGameId,
  });

  // board (latest)
  const lastBoard = boardHistory.length
    ? boardHistory[boardHistory.length - 1].map(v => ({ value: v }))
    : [];
  socket.emit("boardUpdated", lastBoard);

  // skin overlay
  socket.emit("skinOverlayUpdated", liveSkinOverlay);
});

// ─── REST Endpoints ──────────────────────────────────────────────────────────
// 1) Current state
app.get("/api/state", (_,res) =>
  res.json({ phase, timeLeft: phaseTimeLeft, gameId: currentGameId })
);

// 2) All game records (paginated)
app.get("/api/allRecords", async (req, res) => {
  const skip  = parseInt(req.query.skip)  || 0;
  const limit = parseInt(req.query.limit) || 10;
  const recs  = await GameRecord.find({})
    .sort({ timestamp: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
  res.json({ records: recs });
});

// 3) My game records by wallet (paginated)
app.get("/api/records/:user", async (req, res) => {
  const user  = req.params.user.toLowerCase();
  const skip  = parseInt(req.query.skip)  || 0;
  const limit = parseInt(req.query.limit) || 10;
  const recs  = await GameRecord.find({ players: user })
    .sort({ timestamp: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
  res.json({ records: recs });
});

// 4) Live on‑chain board
app.get("/api/board", async (_, res) => {
  try {
    const board = await getOnChainBoard();
    res.json({ board });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.toString() });
  }
});

// 5) Full server‑side history
app.get("/api/history", (_, res) => {
  res.json({ boardHistory, skinHistory });
});

// 6) Skin overlay grid
app.get("/api/skinOverlay", (_, res) => {
  res.json({ skinOverlay: liveSkinOverlay });
});

// 7) Current bets for a game
app.get("/api/bets/:gameId", async (req, res) => {
  try {
    const onChain = await bettingContract.getBets();
    const bets = onChain.map(b => ({
      user:    b.user,
      team:    Number(b.team),
      tickets: Number(b.tickets)
    }));
    res.json({ bets });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.toString() });
  }
});

// ─── Startup & Listen ─────────────────────────────────────────────────────────
;(async function startup(){
  try {
    const onChainId    = toNumber(await gameContract.currentGameId());
    const onChainPhase = Number(await gameContract.currentPhase());
    currentGameId = onChainId;

    const now = await provider.getBlockNumber();
    lastJoinBlock = lastPlaceBlock = now + 1;

    if (onChainPhase === 3) {
      await resetGame();
    } else {
      phase         = "picking";
      phaseTimeLeft = PICKING_TIME;
      broadcastState();
      await sendTx(() => gameContract.setPhase(0), "setPhase(0)");
      await sendTx(
        () => bettingContract.openBetting(currentGameId),
        `openBetting(${currentGameId})`
      );
      initialized = true;
      console.log("✅ Initialization complete, starting countdown");
    }
    console.log(`🚀 Server up, gameId=${currentGameId}`);
  } catch (e) {
    console.error("‼️ Startup error:", e);
  }
})();

const PORT = process.env.PORT || 3000;
// **Bind to 0.0.0.0** so it’s reachable externally
serverHttp.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Listening on ${BASE_URL}:${PORT}`);
});

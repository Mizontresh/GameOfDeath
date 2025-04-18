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

// ─── Config & HTTP Provider ────────────────────────────────────────────────────
const {
  RPC_URL,
  PRIVATE_KEY,
  MONGO_URI         = "mongodb://127.0.0.1:27017/gameofdeath",
  BASE_URL          = "http://localhost:3000",
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
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
mongoose.connection
  .once("open", () => console.log("✅ MongoDB connected"))
  .on("error", (err) => console.error("❌ MongoDB error:", err));

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
const gameABI    = require("./artifacts/contracts/GameOfDeath.sol/GameOfDeath.json").abi;
const bettingABI = require("./artifacts/contracts/GameOfDeathBetting.sol/GameOfDeathBetting.json").abi;
const mizonsABI  = require("./artifacts/contracts/Mizons.sol/Mizons.json").abi;
const skinLockABI= require("./artifacts/contracts/SkinLockRegistry.sol/SkinLockRegistry.json").abi;

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

let boardHistory        = [];
let skinHistory         = [];
let liveSkinOverlay     = Array(4096).fill(0);
let boardSquareOwners   = Array(4096).fill(null);

let lastJoinBlock  = 0;
let lastPlaceBlock = 0;

const activePlayers = new Set();

// ─── Timing Constants ─────────────────────────────────────────────────────────
const PICKING_TIME       = 120;
const PLACING_TIME       = 150;
const FINAL_COUNTDOWN    = 30;
const CONWAY_STEPS       = 10;
const MAX_CYCLES         = 5;
const STEP_DELAY         = 1000;
const FINAL_STEP_DELAY   = 2000;

// how many blocks to wait for inclusion
const CONFIRMATION_BLOCKS = 2;
// fallback timeout for inclusion (ms)
const INCLUSION_TIMEOUT_MS = 30_000;

// ─── Helpers ─────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));
function toNumber(bn) {
  const s = bn.toString();
  return s.length < 16 ? Number(s) : Number(s.slice(-13));
}

// TX Queue (serialize nonces)
let txQueue = Promise.resolve();
function enqueueTx(fn) {
  txQueue = txQueue.then(() => fn().catch(e => { throw e; }));
  return txQueue;
}

// wait up to CONFIRMATION_BLOCKS blocks for the tx to be mined
async function waitForInclusion(hash) {
  console.log(`🔎 [inclusion] waiting for ${hash} up to ${CONFIRMATION_BLOCKS} blocks`);
  const startBlock = await provider.getBlockNumber();
  const timeoutAt  = Date.now() + INCLUSION_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    const onBlock = async (blockNumber) => {
      console.log(`⛓ new block ${blockNumber} (#${blockNumber - startBlock}/${CONFIRMATION_BLOCKS}) checking ${hash}`);
      const rcpt = await provider.getTransactionReceipt(hash);
      if (rcpt && rcpt.blockNumber) {
        console.log(`✅ ${hash} included in block ${rcpt.blockNumber}`);
        provider.removeListener("block", onBlock);
        return resolve(rcpt);
      }
      if (blockNumber >= startBlock + CONFIRMATION_BLOCKS || Date.now() > timeoutAt) {
        provider.removeListener("block", onBlock);
        return reject(new Error(`⏱️ inclusion timeout for ${hash}`));
      }
    };
    provider.on("block", onBlock);
  });
}

// wrap an on‑chain call so we log, send, wait for inclusion, then return
async function sendTx(callFactory, description) {
  console.log(`▶️ [tx] ${description}`);
  const tx = await callFactory();
  console.log(`   ↳ sent: ${tx.hash}`);
  await waitForInclusion(tx.hash);
  return tx;
}

// ─── On‑chain Board Packing ───────────────────────────────────────────────────
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
    const ci  = Math.floor(i / per), pos = i % per;
    arr[ci]  += BigInt(c) * (3n ** BigInt(pos));
  });
  return arr.map(n => n.toString());
}

// cell‑based skin Conway evolution
function runSkinStep(oldGrid) {
  const newGrid = Array(4096).fill(0);
  for (let y=0; y<64; y++) {
    for (let x=0; x<64; x++) {
      const i = y*64 + x, neigh = [];
      for (let dy=-1; dy<=1; dy++) for (let dx=-1; dx<=1; dx++) {
        if (!dx && !dy) continue;
        const nx = x+dx, ny = y+dy;
        if (nx>=0 && nx<64 && ny>=0 && ny<64) {
          const j = ny*64 + nx;
          if (oldGrid[j]) neigh.push(oldGrid[j]);
        }
      }
      if (oldGrid[i]) {
        newGrid[i] = (neigh.length===2||neigh.length===3) ? oldGrid[i] : 0;
      } else {
        newGrid[i] = (neigh.length===3)
          ? neigh[Math.floor(Math.random()*neigh.length)]
          : 0;
      }
    }
  }
  return newGrid;
}

// pick a random locked skin
async function determineSpawnedSkinForUser(user) {
  if (!skinLockContract) return 0;
  try {
    const locked = await skinLockContract.getLockedSkins(user);
    if (!locked.length) return 0;
    const pick = locked[Math.floor(Math.random()*locked.length)];
    return Number(pick.bakedId);
  } catch {
    return 0;
  }
}

// generate a 512×512 thumbnail for a given board
async function generateThumbnail(board, gameId) {
  const size  = 64, scale = 8;
  const canvas= createCanvas(size,size);
  const ctx   = canvas.getContext("2d");
  board.forEach((c,i) => {
    ctx.fillStyle = c===1? "#ff0050" : c===2? "#00bbff":"#000";
    ctx.fillRect(i%size, Math.floor(i/size), 1,1);
  });
  const big = createCanvas(size*scale, size*scale);
  const bctx= big.getContext("2d");
  bctx.imageSmoothingEnabled = false;
  bctx.drawImage(canvas,0,0, size*scale, size*scale);

  const dir  = path.join(__dirname,"public","images");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir,{recursive:true});
  const file = path.join(dir,`game_${gameId}.png`);
  fs.writeFileSync(file, big.toBuffer());
  return `${BASE_URL}/images/game_${gameId}.png`;
}

// broadcast phase & gameId
function broadcastState() {
  io.emit("phaseUpdated", { phase, timeLeft: phaseTimeLeft, gameId: currentGameId });
}

// ─── Distribute winnings ──────────────────────────────────────────────────────
async function distributeWinnings(gameId, winTeam) {
  console.log("💰 distributeWinnings for", gameId, winTeam);
  const bets    = await bettingContract.getBets();
  const winners = bets.filter(b => Number(b.team) === winTeam);
  const losers  = bets.filter(b => Number(b.team) !== winTeam);
  const winSum  = winners.reduce((a,b)=>a + Number(b.tickets), 0);
  const loseSum = losers.reduce((a,b)=>a + Number(b.tickets), 0);
  if (!winSum) return console.log("No winners");
  for (let w of winners) {
    const share = Math.floor(w.tickets * loseSum / winSum);
    if (!share) continue;
    await enqueueTx(() =>
      mizonsContract.mint(w.user, share)
        .then(tx => waitForInclusion(tx.hash))
    );
  }
  console.log("💸 payouts done");
}

// ─── Reset & New Game ─────────────────────────────────────────────────────────
async function resetGame() {
  console.log("🔄 [step] resetGame()");
  txQueue = Promise.resolve();

  const newId = currentGameId + 1;

  await sendTx(
    () => bettingContract.clearBets(currentGameId),
    `clearBets(${currentGameId})`
  );
  await sendTx(
    () => gameContract.newGame(newId),
    `newGame(${newId})`
  );
  await sendTx(
    () => bettingContract.openBetting(newId),
    `openBetting(${newId})`
  );

  currentGameId     = newId;
  phase             = "picking";
  phaseTimeLeft     = PICKING_TIME;
  cycleCount        = 0;
  boardHistory      = [];
  skinHistory       = [];
  liveSkinOverlay   = Array(4096).fill(0);
  boardSquareOwners = Array(4096).fill(null);
  activePlayers.clear();

  const now = await provider.getBlockNumber();
  lastJoinBlock  = now + 1;
  lastPlaceBlock = now + 1;

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
    io.emit("boardUpdated", b.map(v => ({ value: v })));
    console.log(`   ↳ Conway step ${i}/${steps}`);
    await sleep(delay);
  }
  await sendTx(
    () => gameContract.serverOverwriteBoard(packBoard(b)),
    `serverOverwriteBoard`
  );
}

// ─── Final Cycle & Record ────────────────────────────────────────────────────
async function runFinalCycle() {
  console.log("🔚 [step] runFinalCycle()");
  const snap = await getOnChainBoard();
  boardHistory.push([...snap]);
  skinHistory.push([...liveSkinOverlay]);

  await runConwaySteps(CONWAY_STEPS, FINAL_STEP_DELAY);

  const finalB = await getOnChainBoard();
  let redOnBlue=0, blueOnRed=0;
  finalB.forEach((c,i) => {
    const y = Math.floor(i/64);
    if (c===1 && y>=32) redOnBlue++;
    if (c===2 && y<32)  blueOnRed++;
  });
  const winner = redOnBlue===blueOnRed ? "Tie"
               : redOnBlue>blueOnRed   ? "Red":"Blue";

  console.log(`   ↳ Final tally → RedOnBlue=${redOnBlue}, BlueOnRed=${blueOnRed}, winner=${winner}`);
  io.emit("winner", { winner });
  await recordGame(winner);

  phase         = "final";
  phaseTimeLeft = FINAL_COUNTDOWN;
  broadcastState();
}

async function recordGame(winner) {
  console.log("📚 [step] recordGame()");
  const [rBig,bBig] = await gameContract.getTeamCounts(currentGameId);
  const redCount    = toNumber(rBig);
  const blueCount   = toNumber(bBig);

  const bets        = await bettingContract.getBets();
  bets.forEach(b => activePlayers.add(b.user.toLowerCase()));

  let thumbnail = "";
  if (boardHistory.length) {
    thumbnail = await generateThumbnail(boardHistory[boardHistory.length-1], currentGameId);
  }

  const rec = {
    gameId: currentGameId,
    winner,
    timestamp: new Date(),
    teamRedCount: redCount,
    teamBlueCount: blueCount,
    boardHistory,
    skinHistory,
    players: Array.from(activePlayers),
    thumbnail
  };
  await new GameRecord(rec).save();
  io.emit("newGameRecord", rec);

  if (winner==="Red")  await distributeWinnings(currentGameId,1);
  if (winner==="Blue") await distributeWinnings(currentGameId,2);
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
    console.log(`   ↳ on-chain phase now "${newPhase}"`);
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
        { const now=await provider.getBlockNumber(); lastJoinBlock=lastPlaceBlock=now+1; }
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
// countdown + timer logging
setInterval(()=>{
  if (!transitionInProgress && phaseTimeLeft>0) {
    phaseTimeLeft--;
    console.log(`⏱ [Timer] Phase "${phase}", timeLeft=${phaseTimeLeft}s`);
    broadcastState();
    if (phaseTimeLeft===0) transitionPhase();
  }
}, 1000);

// polling (every 3s) for joins, placements & skin spawns
setInterval(async()=>{
  if (phase==="placing") {
    try {
      const currentBlock = await provider.getBlockNumber();

      // TeamJoined
      const joins = await gameContract.queryFilter(
        gameContract.filters.TeamJoined(currentGameId),
        lastJoinBlock, currentBlock
      );
      joins.forEach(log=> activePlayers.add(log.args.user.toLowerCase()));
      lastJoinBlock = currentBlock+1;

      // SquarePlaced
      const places = await gameContract.queryFilter(
        gameContract.filters.SquarePlaced(currentGameId),
        lastPlaceBlock, currentBlock
      );
      places.forEach(log=>{
        const x=Number(log.args.x), y=Number(log.args.y);
        boardSquareOwners[y*64 + x] = log.args.user.toLowerCase();
      });
      lastPlaceBlock = currentBlock+1;

      // spawn skins
      const board = await getOnChainBoard();
      for (let i=0; i<4096; i++) {
        if (board[i] && !liveSkinOverlay[i] && boardSquareOwners[i]) {
          const skin = await determineSpawnedSkinForUser(boardSquareOwners[i]);
          if (skin) liveSkinOverlay[i] = skin;
        }
      }
      io.emit("skinOverlayUpdated", liveSkinOverlay);

    } catch(err) {
      console.error("‼️ Polling error:", err);
    }
  }
}, 3000);

// ─── Socket.io Initial Sync ───────────────────────────────────────────────────
io.on("connection", socket=>{
  socket.emit("phaseUpdated", { phase, timeLeft: phaseTimeLeft, gameId: currentGameId });
  if (boardHistory.length) {
    const last = boardHistory[boardHistory.length-1].map(v=>({ value:v }));
    socket.emit("boardUpdated", last);
  }
});

// ─── REST Endpoints ───────────────────────────────────────────────────────────
app.get("/api/state", (_,res)=>
  res.json({ phase, timeLeft: phaseTimeLeft, gameId: currentGameId })
);
app.get("/api/board", async(_,res)=>{
  const b = await getOnChainBoard();
  res.json({ board: b.map(v=>({ value:v })) });
});
app.get("/api/history", (_,res)=>
  res.json({ boardHistory, skinHistory })
);
app.get("/api/skinOverlay",(_,res)=>
  res.json({ skinOverlay: liveSkinOverlay })
);
app.get("/api/allRecords", async(req,res)=>{
  const skip  = +req.query.skip  || 0;
  const limit = +req.query.limit || 10;
  const recs  = await GameRecord.find()
               .sort({gameId:-1})
               .skip(skip)
               .limit(limit);
  res.json({ records: recs });
});
app.get("/api/records/:u", async(req,res)=>{
  const skip  = +req.query.skip  || 0;
  const limit = +req.query.limit || 10;
  const addr  = req.params.u.toLowerCase();
  const recs  = await GameRecord.find({ players: addr })
               .sort({gameId:-1})
               .skip(skip)
               .limit(limit);
  res.json({ records: recs });
});
app.get("/api/recordById/:i", async(req,res)=>{
  const rec = await GameRecord.findOne({ gameId: +req.params.i });
  if (!rec) return res.status(404).json({ error:"Not found" });
  res.json({ record: rec });
});
app.get("/api/bets/:g", async(req,res)=>{
  try {
    const bets = await bettingContract.getBets();
    res.json({
      bets: bets.map(b=>({
        user: b.user,
        team: Number(b.team),
        tickets: b.tickets.toString()
      }))
    });
  } catch(e) {
    console.error("‼️ bets error:", e);
    res.status(500).json({ error:"Failed to fetch bets" });
  }
});
app.post("/admin/reset-to-game1", async(_,res)=>{
  const imgDir = path.join(__dirname,"public","images");
  if (fs.existsSync(imgDir)) {
    fs.readdirSync(imgDir).forEach(f=>
      fs.unlinkSync(path.join(imgDir,f))
    );
  }
  await GameRecord.deleteMany({});
  await resetGame();
  res.json({ message:"Reset complete" });
});

// ─── Startup ──────────────────────────────────────────────────────────────────
(async function startup(){
  try {
    const onChainId    = toNumber(await gameContract.currentGameId());
    const onChainPhase = Number(await gameContract.currentPhase());
    console.log(`✅ [gameContract.currentPhase()] succeeded on attempt 1 → ${onChainPhase}`);
    currentGameId = onChainId;

    const now = await provider.getBlockNumber();
    lastJoinBlock  = lastPlaceBlock = now + 1;

    if (onChainPhase === 3) {
      await resetGame();
    } else {
      phase         = "picking";
      phaseTimeLeft = PICKING_TIME;
      broadcastState();

      console.log("⚡ [startup] setPhase(0) & openBetting()");
      await sendTx(() => gameContract.setPhase(0), `setPhase(0)`);
      await sendTx(() => bettingContract.openBetting(currentGameId), `openBetting(${currentGameId})`);
    }

    console.log(`🚀 Server up, gameId=${currentGameId}`);
  } catch(e) {
    console.error("‼️ Startup error:", e);
  }
})();

const PORT = process.env.PORT || 3000;
serverHttp.listen(PORT, () => {
  console.log(`🌐 Listening on ${BASE_URL}:${PORT}`);
});

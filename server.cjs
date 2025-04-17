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

// ─── Environment & Providers ──────────────────────────────────────────────────
const {
  RPC_URL,
  WS_RPC_URL,              // ← optional, for subscriptions
  PRIVATE_KEY,
  MONGO_URI         = "mongodb://127.0.0.1:27017/gameofdeath",
  BASE_URL          = "http://localhost:3000",
  GAMEOFDEATH_ADDRESS,
  GAMEOFDEATH_BETTING_ADDRESS,
  MIZONS_ADDRESS,
  SKIN_LOCK_ADDRESS
} = process.env;

if (!RPC_URL || !PRIVATE_KEY) {
  console.error("❌ RPC_URL and PRIVATE_KEY are required in .env");
  process.exit(1);
}

// HTTP provider for all reads/writes
const httpProvider = new ethers.JsonRpcProvider(RPC_URL);
// keep HTTP alive
setInterval(() => httpProvider.send("net_version", []).catch(()=>{}), 10_000);

// WS provider only for event subscriptions (avoids JSON‐RPC polling/filter issues)
const subscriptionProvider = WS_RPC_URL
  ? new ethers.WebSocketProvider(WS_RPC_URL)
  : httpProvider;

// single wallet (we'll use httpProvider for txs, subscriptionProvider for events)
const walletHttp = new ethers.Wallet(PRIVATE_KEY, httpProvider);
const walletSub  = new ethers.Wallet(PRIVATE_KEY, subscriptionProvider);

// ─── MongoDB setup ───────────────────────────────────────────────────────────
mongoose.connect(MONGO_URI, { useNewUrlParser:true, useUnifiedTopology:true });
mongoose.connection
  .once("open", () => console.log("✅ MongoDB connected"))
  .on("error", err => console.error("❌ MongoDB error:", err));

const gameRecordSchema = new mongoose.Schema({
  gameId: Number, winner: String, timestamp: Date,
  teamRedCount: Number, teamBlueCount: Number,
  boardHistory: { type: [[Number]], default: [] },
  skinHistory:  { type: [[Number]], default: [] },
  players: [String], thumbnail: String,
});
const GameRecord = mongoose.model("GameRecord", gameRecordSchema);

// ─── Express & Socket.io ────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname,"public")));
app.use("/skins",  express.static(path.join(__dirname,"skins")));
app.use("/chests", express.static(path.join(__dirname,"chests")));
app.use("/songs",  express.static(path.join(__dirname,"songs")));
app.use("/slides", express.static(path.join(__dirname,"slides")));

const serverHttp = http.createServer(app);
const io         = new Server(serverHttp, { cors: { origin: "*" } });

// ─── ABIs & Contracts ────────────────────────────────────────────────────────
const gameABI    = require("./artifacts/contracts/GameOfDeath.sol/GameOfDeath.json").abi;
const bettingABI = require("./artifacts/contracts/GameOfDeathBetting.sol/GameOfDeathBetting.json").abi;
const mizonsABI  = require("./artifacts/contracts/Mizons.sol/Mizons.json").abi;
const skinLockABI= require("./artifacts/contracts/SkinLockRegistry.sol/SkinLockRegistry.json").abi;

const gameContractHttp    = new ethers.Contract(GAMEOFDEATH_ADDRESS,    gameABI,    walletHttp);
const bettingContractHttp = new ethers.Contract(GAMEOFDEATH_BETTING_ADDRESS, bettingABI, walletHttp);
const mizonsContract      = new ethers.Contract(MIZONS_ADDRESS,          mizonsABI,  walletHttp);
const skinLockContract    = SKIN_LOCK_ADDRESS
  ? new ethers.Contract(SKIN_LOCK_ADDRESS, skinLockABI, walletHttp)
  : null;

// subscription‐only contract for “TeamJoined” events
const gameContractSub = new ethers.Contract(GAMEOFDEATH_ADDRESS, gameABI, walletSub);

// ─── Game Loop State ─────────────────────────────────────────────────────────
let phase            = "picking";
let phaseTimeLeft    = 120;
let currentGameId    = 1;
let cycleCount       = 0;
let transitionInProgress = false;

let boardHistory     = [];
let skinHistory      = [];
let liveSkinOverlay  = Array(4096).fill(0);
let boardSquareOwners= Array(4096).fill(null);
let lastPollBlock    = 0;
const activePlayers  = new Set();

// ─── Timing Constants ─────────────────────────────────────────────────────────
const PICKING_TIME     = 120;
const PLACING_TIME     = 150;
const FINAL_COUNTDOWN  = 30;
const CONWAY_STEPS     = 10;
const MAX_CYCLES       = 5;
const STEP_DELAY       = 1000;
const FINAL_STEP_DELAY = 2000;

// ─── Helpers ─────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r,ms));
function toNumber(bn) {
  const s = bn.toString();
  return s.length<16 ? Number(s) : Number(s.slice(-13));
}

// TX Queue (no manual nonces!)
let txQueue = Promise.resolve();
function enqueueTx(fn) {
  // fn should return a Promise<TransactionResponse>
  txQueue = txQueue.then(() => fn().catch(e=>{ throw e; }));
  return txQueue;
}
async function waitForTxConfirmation(tx, timeout=90_000, interval=3_000) {
  if (!tx || !tx.hash) throw new Error("Invalid tx");
  console.log(`🔃 waiting for ${tx.hash}`);
  const start=Date.now();
  while (Date.now()-start < timeout) {
    const rcpt = await httpProvider.getTransactionReceipt(tx.hash);
    if (rcpt) return rcpt;
    await sleep(interval);
  }
  throw new Error("⏱️ tx confirmation timeout");
}

// encode/decode board
async function getOnChainBoard() {
  const packed = await gameContractHttp.getBoard();
  const cells=[];
  const per=161, total=4096;
  for (let chunk of packed) {
    let n=BigInt(chunk.toString());
    for (let i=0;i<per&&cells.length<total;i++){
      cells.push(Number(n%3n));
      n/=3n;
    }
  }
  return cells;
}
function packBoard(cells){
  const per=161,chunks=26;
  const arr=Array(chunks).fill(0n);
  cells.forEach((c,i)=>{
    const ci=Math.floor(i/per), pos=i%per;
    arr[ci]+=BigInt(c)*(3n**BigInt(pos));
  });
  return arr.map(n=>n.toString());
}

// Conway‐style skin
function runSkinStep(oldGrid){
  const newGrid=Array(4096).fill(0);
  for(let y=0;y<64;y++)for(let x=0;x<64;x++){
    const i=y*64+x, neigh=[];
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      if(!dx&&!dy)continue;
      const nx=x+dx, ny=y+dy;
      if(nx>=0&&nx<64&&ny>=0&&ny<64){
        const j=ny*64+nx;
        if(oldGrid[j]) neigh.push(oldGrid[j]);
      }
    }
    if(oldGrid[i]){
      newGrid[i]=(neigh.length===2||neigh.length===3)? oldGrid[i]:0;
    } else {
      newGrid[i]=(neigh.length===3)
        ? neigh[Math.floor(Math.random()*neigh.length)]
        :0;
    }
  }
  return newGrid;
}

async function determineSpawnedSkinForUser(user){
  if(!skinLockContract) return 0;
  try{
    const locked=await skinLockContract.getLockedSkins(user);
    if(!locked.length) return 0;
    const pick=locked[Math.floor(Math.random()*locked.length)];
    return Number(pick.bakedId);
  }catch{
    return 0;
  }
}

async function generateThumbnail(board, gameId){
  const size=64,scale=8;
  const canvas=createCanvas(size,size);
  const ctx=canvas.getContext("2d");
  board.forEach((c,i)=>{
    ctx.fillStyle= c===1?"#ff0050": c===2?"#00bbff":"#000";
    ctx.fillRect(i%size,Math.floor(i/size),1,1);
  });
  const big=createCanvas(size*scale,size*scale);
  const bctx=big.getContext("2d");
  bctx.imageSmoothingEnabled=false;
  bctx.drawImage(canvas,0,0,size*scale,size*scale);
  const dir=path.join(__dirname,"public","images");
  if(!fs.existsSync(dir)) fs.mkdirSync(dir,{recursive:true});
  const file=path.join(dir,`game_${gameId}.png`);
  fs.writeFileSync(file, big.toBuffer());
  return `${BASE_URL}/images/game_${gameId}.png`;
}

// broadcast
function broadcastState(){
  io.emit("phaseUpdated", { phase, timeLeft: phaseTimeLeft, gameId: currentGameId });
}

// ─── Event subscription ──────────────────────────────────────────────────────
function subscribeTeamJoined(){
  gameContractSub.removeAllListeners("TeamJoined");
  gameContractSub.on("TeamJoined",(gid,user,team)=>{
    if(Number(gid)===currentGameId){
      activePlayers.add(user.toLowerCase());
    }
  });
}

// ─── Distribute winnings ──────────────────────────────────────────────────────
async function distributeWinnings(gameId, winTeam){
  console.log("💰 distributeWinnings for",gameId,winTeam);
  const bets=await bettingContractHttp.getBets();
  const winners=bets.filter(b=>Number(b.team)===winTeam);
  const losers =bets.filter(b=>Number(b.team)!==winTeam);
  const winSum =winners.reduce((a,b)=>a+Number(b.tickets),0);
  const loseSum=losers.reduce((a,b)=>a+Number(b.tickets),0);
  if(!winSum) return console.log("No winners");
  for(let w of winners){
    const share=Math.floor(w.tickets*loseSum/winSum);
    if(!share)continue;
    await enqueueTx(()=>
      mizonsContract.mint(w.user, share)
        .then(tx=>waitForTxConfirmation(tx))
    );
  }
  console.log("💸 payouts done");
}

// ─── Reset & New Game ─────────────────────────────────────────────────────────
async function resetGame(){
  console.log("🔄 resetGame()");
  txQueue=Promise.resolve();
  const newId=currentGameId+1;

  // clear bets, newGame, openBetting
  await enqueueTx(()=> bettingContractHttp.clearBets(currentGameId));
  await enqueueTx(()=> gameContractHttp.newGame(newId));
  await enqueueTx(()=> bettingContractHttp.openBetting(newId));

  currentGameId=newId;
  phase="picking";
  phaseTimeLeft=PICKING_TIME;
  boardHistory=[]; skinHistory=[];
  cycleCount=0;
  activePlayers.clear();
  liveSkinOverlay=Array(4096).fill(0);
  boardSquareOwners=Array(4096).fill(null);
  subscribeTeamJoined();
  broadcastState();
  console.log("▶️ New gameId:",currentGameId);
}

// ─── Conway Steps ────────────────────────────────────────────────────────────
async function runConwaySteps(steps,delay=STEP_DELAY){
  console.log(`🔀 runConwaySteps(${steps})`);
  let b=await getOnChainBoard();
  for(let i=1;i<=steps;i++){
    b=conway.runOneStep(b);
    boardHistory.push([...b]);
    liveSkinOverlay=runSkinStep(liveSkinOverlay);
    skinHistory.push([...liveSkinOverlay]);
    io.emit("boardUpdated",b.map(v=>({value:v})));
    console.log(`Conway step ${i}/${steps}`);
    await sleep(delay);
  }
  // push final board on-chain
  await enqueueTx(()=> 
    gameContractHttp.serverOverwriteBoard(packBoard(b))
      .then(tx=>waitForTxConfirmation(tx))
  );
}

// ─── Final Cycle & Record ────────────────────────────────────────────────────
async function runFinalCycle(){
  console.log("🔚 runFinalCycle()");
  const snap=await getOnChainBoard();
  boardHistory.push([...snap]);
  skinHistory.push([...liveSkinOverlay]);

  await runConwaySteps(CONWAY_STEPS, FINAL_STEP_DELAY);

  const finalBoard=await getOnChainBoard();
  let redOnBlue=0, blueOnRed=0;
  finalBoard.forEach((c,i)=>{
    const y=Math.floor(i/64);
    if(c===1 && y>=32) redOnBlue++;
    if(c===2 && y<32)  blueOnRed++;
  });
  const winner = redOnBlue===blueOnRed? "Tie"
                : redOnBlue>blueOnRed? "Red":"Blue";

  io.emit("winner",{winner});
  await recordGame(winner);

  phase="final";
  phaseTimeLeft=FINAL_COUNTDOWN;
  broadcastState();
}

async function recordGame(winner){
  console.log("📚 recordGame()");
  const [rBig,bBig]=await gameContractHttp.getTeamCounts(currentGameId);
  const redCount=toNumber(rBig), blueCount=toNumber(bBig);

  const bets=await bettingContractHttp.getBets();
  bets.forEach(b=> activePlayers.add(b.user.toLowerCase()));

  let thumbnail="";
  if(boardHistory.length){
    thumbnail=await generateThumbnail(boardHistory[boardHistory.length-1], currentGameId);
  }

  const rec={
    gameId: currentGameId,
    winner, timestamp:new Date(),
    teamRedCount:redCount, teamBlueCount:blueCount,
    boardHistory, skinHistory,
    players:Array.from(activePlayers),
    thumbnail
  };
  await new GameRecord(rec).save();
  io.emit("newGameRecord", rec);

  if(winner==="Red")  await distributeWinnings(currentGameId,1);
  if(winner==="Blue") await distributeWinnings(currentGameId,2);
  activePlayers.clear();
}

// ─── Betting Control ─────────────────────────────────────────────────────────
async function openBettingForCurrentGame(){
  console.log("▶️ openBetting for",currentGameId);
  await enqueueTx(()=> bettingContractHttp.openBetting(currentGameId));
}
async function closeBettingForCurrentGame(){
  console.log("✋ closeBetting for",currentGameId);
  await enqueueTx(()=> bettingContractHttp.closeBetting(currentGameId));
}

// ─── Phase Transitions ──────────────────────────────────────────────────────
async function setContractPhase(newPhase, attempt=1){
  const MAP={ picking:0, placing:1, conway:2, final:3 };
  const pe=MAP[newPhase];
  if(pe==null) throw new Error("Unknown phase "+newPhase);
  try{
    await enqueueTx(()=> 
      gameContractHttp.setPhase(pe)
        .then(tx=>waitForTxConfirmation(tx))
    );
    phase=newPhase;
    broadcastState();
  }catch(e){
    console.error("setContractPhase error:",e);
    if(attempt<3) return setContractPhase(newPhase,attempt+1);
    console.error("Max retries, resetting");
    await resetGame();
  }
}

async function transitionPhase(){
  if(transitionInProgress) return;
  transitionInProgress=true;
  try{
    switch(phase){
      case "picking":
        await closeBettingForCurrentGame();
        await setContractPhase("placing");
        phaseTimeLeft=PLACING_TIME;
        lastPollBlock=await httpProvider.getBlockNumber();
        break;
      case "placing":
        await setContractPhase("conway");
        await runConwaySteps(CONWAY_STEPS);
        cycleCount++;
        if(cycleCount<MAX_CYCLES){
          await setContractPhase("picking");
          phaseTimeLeft=PICKING_TIME;
          await openBettingForCurrentGame();
        } else {
          await runFinalCycle();
        }
        break;
      case "final":
        await resetGame();
        break;
    }
  }catch(e){
    console.error("transitionPhase error:",e);
  }finally{
    broadcastState();
    transitionInProgress=false;
  }
}

// ─── Main Loops ─────────────────────────────────────────────────────────────
// countdown
setInterval(()=>{
  if(!transitionInProgress && phaseTimeLeft>0){
    phaseTimeLeft--;
    broadcastState();
    if(phaseTimeLeft===0) transitionPhase();
  }
},1000);

// poll skins
setInterval(async()=>{
  if(phase==="placing"){
    const currentBlock=await httpProvider.getBlockNumber();
    if(!lastPollBlock){ lastPollBlock=currentBlock; return; }
    const logs=await gameContractHttp.queryFilter(
      gameContractHttp.filters.SquarePlaced(currentGameId),
      lastPollBlock, currentBlock
    );
    for(const log of logs){
      const x=Number(log.args.x), y=Number(log.args.y);
      boardSquareOwners[y*64+x]=log.args.user.toLowerCase();
    }
    const board=await getOnChainBoard();
    for(let i=0;i<4096;i++){
      if(board[i] && !liveSkinOverlay[i] && boardSquareOwners[i]){
        const skin=await determineSpawnedSkinForUser(boardSquareOwners[i]);
        if(skin) liveSkinOverlay[i]=skin;
      }
    }
    io.emit("skinOverlayUpdated",liveSkinOverlay);
    lastPollBlock=currentBlock+1;
  }
},3000);

subscribeTeamJoined();

// ─── Socket.io initial state ────────────────────────────────────────────────
io.on("connection", socket => {
  // send current phase+gameId immediately
  socket.emit("phaseUpdated", { phase, timeLeft: phaseTimeLeft, gameId: currentGameId });
  // optionally send latest board too
  if(boardHistory.length){
    const last=boardHistory[boardHistory.length-1].map(v=>({value:v}));
    socket.emit("boardUpdated", last);
  }
});

// ─── REST Endpoints ───────────────────────────────────────────────────────────
app.get("/api/state", (_,res) =>
  res.json({ phase, timeLeft: phaseTimeLeft, gameId: currentGameId })
);

app.get("/api/board", async (_,res) => {
  const b=await getOnChainBoard();
  res.json({ board: b.map(v=>({value:v})) });
});

app.get("/api/history", (_,res)=>
  res.json({ boardHistory, skinHistory })
);

app.get("/api/skinOverlay",(_,res)=>
  res.json({ skinOverlay: liveSkinOverlay })
);

app.get("/api/allRecords", async(req,res)=>{
  const skip=+req.query.skip||0, limit=+req.query.limit||10;
  const recs=await GameRecord.find().sort({gameId:-1}).skip(skip).limit(limit);
  res.json({ records: recs });
});

app.get("/api/records/:u", async(req,res)=>{
  const skip=+req.query.skip||0, limit=+req.query.limit||10;
  const addr=req.params.u.toLowerCase();
  const recs=await GameRecord.find({ players: addr })
               .sort({gameId:-1}).skip(skip).limit(limit);
  res.json({ records: recs });
});

app.get("/api/recordById/:i", async(req,res)=>{
  const rec=await GameRecord.findOne({ gameId:+req.params.i });
  if(!rec) return res.status(404).json({ error:"Not found" });
  res.json({ record: rec });
});

app.get("/api/bets/:g", async(req,res)=>{
  try{
    const bets=await bettingContractHttp.getBets();
    res.json({
      bets: bets.map(b=>({
        user: b.user,
        team: Number(b.team),
        tickets: b.tickets.toString()
      }))
    });
  }catch(e){
    console.error("bets error:",e);
    res.status(500).json({ error:"Failed to fetch bets" });
  }
});

app.post("/admin/reset-to-game1", async(_,res)=>{
  const imgDir=path.join(__dirname,"public","images");
  if(fs.existsSync(imgDir)){
    fs.readdirSync(imgDir).forEach(f=>fs.unlinkSync(path.join(imgDir,f)));
  }
  await GameRecord.deleteMany({});
  await resetGame();
  res.json({ message:"Reset complete" });
});

// ─── Startup ─────────────────────────────────────────────────────────────────
(async function startup(){
  try{
    // initialize currentGameId & phase from on-chain
    const onChainId = toNumber(await gameContractHttp.currentGameId());
    const onChainPhase = Number(await gameContractHttp.currentPhase());
    currentGameId = onChainId;

    if(onChainPhase===3){
      // if contract was in final, spin up newGame right away
      await resetGame();
    } else {
      phase="picking";
      phaseTimeLeft=PICKING_TIME;
      await enqueueTx(()=> gameContractHttp.setPhase(0));
      await enqueueTx(()=> bettingContractHttp.openBetting(currentGameId));
      broadcastState();
    }
    console.log(`🚀 Server up, gameId=${currentGameId}`);
  }catch(e){
    console.error("Startup error:",e);
  }
})();

const PORT = process.env.PORT||3000;
serverHttp.listen(PORT, ()=>{
  console.log(`🌐 Listening on ${BASE_URL}:${PORT}`);
});

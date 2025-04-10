import React, { useState, useEffect, useRef, useCallback } from "react";
import { io } from "socket.io-client";
import { ethers } from "ethers";
import "./App.css";
import logo from "./logo.png";

// -------------------- Minimal ABIs --------------------
const gameABI = [
  "function joinTeam(uint256 gameId, uint8 teamId) external",
  "function placeSquare(uint256 x, uint256 y) external",
  "function getTeam(uint256 gameId, address user) external view returns (uint8)",
  "function getTeamCounts(uint256 gameId) external view returns (uint256 redCount, uint256 blueCount)",
  "function currentPhase() external view returns (uint8)",
  "function currentGameId() external view returns (uint256)"
];

const bettingABI = [
  "function placeBet(uint256 gameId, uint8 team, uint256 tickets) external payable",
  "function getBets(uint256 gameId) external view returns (tuple(address user, uint8 team, uint256 tickets)[])",
  "function openBetting(uint256 gameId) external",
  "function closeBetting(uint256 gameId) external",
  "function clearBet(uint256 gameId) external"
];

const mizonsABI = [
  "function balanceOf(address owner) external view returns (uint256)",
  "function mint(address to, uint256 amount) external",
  "function approve(address spender, uint256 amount) external returns (bool)"
];

const chestMinterABI = [
  "function mintRandomChest() external returns (uint256)",
  "function tokenChestType(uint256 tokenId) external view returns (uint8)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256)",
  "function balanceOf(address owner) external view returns (uint256)",
  "function tokenURI(uint256 tokenId) external view returns (string)"
];

const chestOpenerABI = [
  "function openChest(uint256 chestId) external payable",
  "function itemCounter() external view returns (uint256)",
  "function tokenURI(uint256 tokenId) external view returns (string)",
  "function tokenAwardedItem(uint256 tokenId) external view returns (uint16)",
  "function balanceOf(address owner) external view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256)"
];

// -------------------- Environment Constants --------------------
const gameAddress = process.env.REACT_APP_GAMEOFDEATH_ADDRESS;
const bettingAddress = process.env.REACT_APP_BETTING_ADDRESS;
const mizonsAddress = process.env.REACT_APP_MIZONS_ADDRESS;
const chestMinterAddress = process.env.REACT_APP_CHEST_MINTER_ADDRESS;
const chestOpenerAddress = process.env.REACT_APP_CHEST_OPENER_ADDRESS;
const backendUrl = process.env.REACT_APP_BACKEND_URL || "http://localhost:3000";

// -------------------- Helper Functions --------------------
function convertToAugmentedBoard(numericalBoard) {
  return numericalBoard.map(val => ({ value: val, skin: null }));
}

// -------------------- Inventory Component --------------------
function Inventory({ inventory, backendUrl, onOpenChest }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      gap: 4,
      justifyItems: "center"
    }}>
      {inventory.length === 0 ? (
        <p>No chests found.</p>
      ) : (
        inventory.map(chest => (
          <div
            key={chest.tokenId}
            style={{ position: "relative", textAlign: "center", cursor: "pointer" }}
            onClick={() => onOpenChest(chest.tokenId)}
          >
            <img
              src={`${backendUrl}/chests/icons/chest${chest.type}/frame1.png`}
              alt={`Chest Type ${chest.type}`}
              style={{ width: 35, height: "auto" }}
            />
          </div>
        ))
      )}
    </div>
  );
}

// -------------------- RecordsList Component --------------------
function RecordsList({ backendUrl, showMyGames, userAddress, onSelectRecord, refreshKey, setLatestRecord }) {
  const [records, setRecords] = useState([]);
  const [skip, setSkip] = useState(0);
  const limit = 10;
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);

  async function fetchRecords() {
    if (loading) return;
    setLoading(true);
    try {
      const currentSkip = skip;
      const endpoint =
        showMyGames && userAddress
          ? `${backendUrl}/api/records/${userAddress}?skip=${currentSkip}&limit=${limit}`
          : `${backendUrl}/api/allRecords?skip=${currentSkip}&limit=${limit}`;
      const res = await fetch(endpoint);
      const data = await res.json();
      setRecords(prev => [...prev, ...data.records]);
      setSkip(currentSkip + limit);
      if (data.records.length < limit) setHasMore(false);
    } catch (err) {
      console.error("Error fetching records:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function refreshRecords() {
      setRecords([]);
      setSkip(0);
      setHasMore(true);
      setLoading(true);
      try {
        const endpoint =
          showMyGames && userAddress
            ? `${backendUrl}/api/records/${userAddress}?skip=0&limit=${limit}`
            : `${backendUrl}/api/allRecords?skip=0&limit=${limit}`;
        const res = await fetch(endpoint);
        const data = await res.json();
        setRecords(data.records);
        setSkip(limit);
        if (data.records.length < limit) setHasMore(false);
        if (data.records.length > 0) {
          setLatestRecord(data.records[0]);
        }
      } catch (err) {
        console.error("Error refreshing records:", err);
      } finally {
        setLoading(false);
      }
    }
    refreshRecords();
  }, [showMyGames, refreshKey, userAddress, backendUrl, setLatestRecord]);

  return (
    <div className="records-list-container">
      {records.length === 0 && !loading ? (
        <p>No records found.</p>
      ) : (
        <ul className="game-records-list">
          {records.map((rec, index) => {
            const dateString = rec.timestamp ? new Date(rec.timestamp).toLocaleString() : "N/A";
            return (
              <li
                key={`${rec.gameId}-${index}`}
                className="game-record-item"
                onClick={() => onSelectRecord(rec)}
              >
                {rec.thumbnail && (
                  <img src={rec.thumbnail} alt={`Game #${rec.gameId}`} className="record-thumbnail" />
                )}
                <div className="record-info">
                  <strong>Game #{rec.gameId}</strong>
                  <p>{rec.winner} won at {dateString}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {hasMore ? (
        <button className="load-more-btn" onClick={fetchRecords} disabled={loading}>
          {loading ? "Loading..." : "Load More"}
        </button>
      ) : (
        <p style={{ textAlign: "center" }}>No more records to load.</p>
      )}
    </div>
  );
}

// -------------------- WholeSkinsPanel Component --------------------
// This panel displays all possible skins (IDs 0..1023). The ones the user owns are shown normally;
// the others are overlaid with a semi-transparent gray.
function WholeSkinsPanel({ onSelectSkin, onClose, ownedSkins }) {
  const GRID_COLUMNS = 32;
  const CELL_SIZE = 18;
  const TOTAL_SKINS = 1024;
  const scale = 70 / (GRID_COLUMNS * CELL_SIZE);

  function getSkinCoords(skinId) {
    return { x: (skinId % GRID_COLUMNS) * CELL_SIZE, y: Math.floor(skinId / GRID_COLUMNS) * CELL_SIZE };
  }

  return (
    <div className="whole-skins-overlay">
      <div style={{ position: "relative", width: "70vmin", height: "70vmin", margin: "0 auto", overflow: "hidden" }}>
        <img
          src={`${backendUrl}/skins/whole.png`}
          alt="All Skins"
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
        />
        {Array.from({ length: TOTAL_SKINS }, (_, i) => {
          const { x, y } = getSkinCoords(i);
          const isOwned = ownedSkins.includes(i);
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: x * scale + "vmin",
                top: y * scale + "vmin",
                width: CELL_SIZE * scale + "vmin",
                height: CELL_SIZE * scale + "vmin",
                backgroundColor: isOwned ? "transparent" : "rgba(128,128,128,0.5)",
                cursor: "pointer"
              }}
              onClick={() => {
                if (!isOwned) {
                  alert("You do not own this skin");
                } else {
                  onSelectSkin(i);
                }
              }}
            />
          );
        })}
      </div>
      <button className="close-whole-skins-btn" onClick={onClose}>Close</button>
    </div>
  );
}

// -------------------- Main App Component --------------------
function App() {
  // Layout variables.
  const LEFT_PANEL_WIDTH = 320;
  const RIGHT_PANEL_WIDTH = 320;
  const TOP_BAR_HEIGHT = 120;
  const MIN_BOARD_SIZE = 300;
  const [boardSize, setBoardSize] = useState(MIN_BOARD_SIZE);

  useEffect(() => {
    function handleResize() {
      const availableWidth = window.innerWidth - (LEFT_PANEL_WIDTH + RIGHT_PANEL_WIDTH + 60);
      const availableHeight = window.innerHeight - (TOP_BAR_HEIGHT + 40);
      setBoardSize(Math.max(MIN_BOARD_SIZE, Math.min(availableWidth, availableHeight)));
    }
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // States.
  const [userAddress, setUserAddress] = useState("");
  const [gameContract, setGameContract] = useState(null);
  const [bettingContract, setBettingContract] = useState(null);
  const [chestMinterContract, setChestMinterContract] = useState(null);
  const [chestOpenerContract, setChestOpenerContract] = useState(null);
  const [mizonsBalance, setMizonsBalance] = useState("0");
  const [phaseData, setPhaseData] = useState({ phase: "picking", timeLeft: 30, gameId: 1 });
  const [teamCounts, setTeamCounts] = useState({ red: 0, blue: 0 });
  const [userTeam, setUserTeam] = useState(0);
  const [status, setStatus] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Live board & replay history.
  const [liveBoard, setLiveBoard] = useState(Array(4096).fill({ value: 0, skin: null }));
  const [boardHistory, setBoardHistory] = useState([]);
  const [liveReplayIndex, setLiveReplayIndex] = useState(-1);
  const [liveAutoReplay, setLiveAutoReplay] = useState(false);

  // Past record state.
  const [showMyGames, setShowMyGames] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [selectedHistory, setSelectedHistory] = useState(null);
  const [selectedReplayIndex, setSelectedReplayIndex] = useState(-1);
  const [selectedAutoReplay, setSelectedAutoReplay] = useState(false);
  const [latestRecord, setLatestRecord] = useState(null);

  // Bets & inventory.
  const [liveRedBets, setLiveRedBets] = useState(0);
  const [liveBlueBets, setLiveBlueBets] = useState(0);
  const [betAmount, setBetAmount] = useState(1);
  const [inventory, setInventory] = useState([]);
  // Chest animation state.
  // For small chests, we cycle frames 1 to 5.
  // For brain chest, we show "brain" then "stir" then reveal the minted chest.
  const [chestAnimation, setChestAnimation] = useState({
    active: false,
    step: null,
    data: null,
    chestType: null,
    frame: 1
  });
  const [winnerOverlay, setWinnerOverlay] = useState(null);

  // Owned skins from ChestOpener (final item tokens). Duplicates count only once.
  const [ownedSkins, setOwnedSkins] = useState([]);
  // Whether to show the skins tab.
  const [showWholeSkins, setShowWholeSkins] = useState(false);

  const socketRef = useRef(null);

  // --------------- Board display ---------------
  let displayBoard;
  if (selectedHistory) {
    const replayIndex = selectedReplayIndex < 0 ? selectedHistory.length - 1 : selectedReplayIndex;
    displayBoard = convertToAugmentedBoard(selectedHistory[replayIndex]);
  } else if (liveReplayIndex >= 0 && boardHistory.length > 0) {
    const index = Math.min(liveReplayIndex, boardHistory.length - 1);
    displayBoard = convertToAugmentedBoard(boardHistory[index]);
  } else {
    displayBoard = liveBoard;
  }

  // --------------- Scoreboard ratio ---------------
  function computeOpposingStats(board) {
    let redOnBlue = 0, blueOnRed = 0;
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const idx = y * 64 + x;
        const val = board[idx].value;
        if (val === 1 && y >= 32) redOnBlue++;
        if (val === 2 && y < 32) blueOnRed++;
      }
    }
    return { redOnBlue, blueOnRed };
  }
  const { redOnBlue, blueOnRed } = computeOpposingStats(displayBoard);
  const totalOpposing = redOnBlue + blueOnRed;
  const redPercent = totalOpposing > 0 ? (redOnBlue / totalOpposing) * 100 : 50;
  const bluePercent = totalOpposing > 0 ? (blueOnRed / totalOpposing) * 100 : 50;

  const showVeil = phaseData.phase === "placing" && !selectedRecord && liveReplayIndex < 0;

  // --------------- Format MIZ balance ---------------
  function formatMizons(balance) {
    const bal = Number(ethers.formatUnits(balance, 18));
    if (bal === 0) return "0";
    if (bal < 0.000001 || bal > 1000000) return bal.toExponential(6);
    return bal.toFixed(6);
  }

  // --------------- selectRecord ---------------
  function selectRecord(rec) {
    setSelectedRecord(rec);
    if (rec.boardHistory && rec.boardHistory.length > 0) {
      setSelectedHistory(rec.boardHistory);
      setSelectedReplayIndex(0);
      setSelectedAutoReplay(false);
      setLiveReplayIndex(-1);
    } else {
      setSelectedHistory(null);
      setSelectedReplayIndex(-1);
    }
  }

  // --------------- Wallet connect/disconnect ---------------
  async function connectWallet() {
    if (!window.ethereum) {
      setErrorMsg("No MetaMask found!");
      return;
    }
    try {
      await window.ethereum.request({ method: "eth_requestAccounts" });
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const addr = await signer.getAddress();
      setUserAddress(addr);
      setStatus("");
    } catch (err) {
      setErrorMsg("Connect error: " + err.message);
    }
  }

  function disconnectWallet() {
    setUserAddress("");
    setGameContract(null);
    setBettingContract(null);
    setChestMinterContract(null);
    setChestOpenerContract(null);
    setStatus("");
    setErrorMsg("");
  }

  useEffect(() => {
    if (window.ethereum) {
      const handleAccountsChanged = accounts => {
        if (accounts.length > 0) setUserAddress(accounts[0]);
        else setUserAddress("");
      };
      window.ethereum.on("accountsChanged", handleAccountsChanged);
      return () => window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
    }
  }, []);

  // --------------- Socket.io setup ---------------
  useEffect(() => {
    socketRef.current = io(backendUrl, { transports: ["websocket"] });
    socketRef.current.on("connect", () => console.log("Socket connected:", socketRef.current.id));
    socketRef.current.on("phaseUpdated", data => setPhaseData(data));
    socketRef.current.on("boardUpdated", augmentedBoard => {
      if (liveReplayIndex < 0 && !selectedHistory) setLiveBoard(augmentedBoard);
    });
    socketRef.current.on("winner", ({ winner }) => {
      if (!chestAnimation.active) {
        setWinnerOverlay(winner);
        setTimeout(() => setWinnerOverlay(null), 3000);
      }
    });
    socketRef.current.on("newGameRecord", record => {
      console.log("Received new game record:", record);
      setRefreshKey(prev => prev + 1);
    });
    socketRef.current.on("disconnect", () => console.log("Socket disconnected"));
    return () => socketRef.current.disconnect();
  }, [liveReplayIndex, selectedHistory, chestAnimation.active]);

  // --------------- Phase polling ---------------
  useEffect(() => {
    const interval = setInterval(() => {
      fetch(`${backendUrl}/api/state`)
        .then(res => res.json())
        .then(data => setPhaseData(data))
        .catch(err => console.error("Error fetching state:", err));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // --------------- Contract setup ---------------
  useEffect(() => {
    if (!window.ethereum || !userAddress) return;
    if (!gameAddress || !bettingAddress || !mizonsAddress || !chestMinterAddress || !chestOpenerAddress) {
      setErrorMsg("Missing contract addresses in env variables.");
      return;
    }
    async function setupContracts() {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const gameC = new ethers.Contract(gameAddress, gameABI, signer);
        const bettingC = new ethers.Contract(bettingAddress, bettingABI, signer);
        const chestMinterC = new ethers.Contract(chestMinterAddress, chestMinterABI, signer);
        const chestOpenerC = new ethers.Contract(chestOpenerAddress, chestOpenerABI, signer);
        setGameContract(gameC);
        setBettingContract(bettingC);
        setChestMinterContract(chestMinterC);
        setChestOpenerContract(chestOpenerC);
      } catch (err) {
        console.error("Error setting up contracts:", err);
        setErrorMsg("Error setting up contracts: " + err.message);
      }
    }
    setupContracts();
  }, [userAddress]);

  // --------------- Bets polling ---------------
  useEffect(() => {
    if (!phaseData.gameId) return;
    async function fetchBets() {
      try {
        const res = await fetch(`${backendUrl}/api/bets/${phaseData.gameId}`);
        const data = await res.json();
        if (data && data.bets) {
          const red = data.bets.filter(b => b.team === 1).reduce((sum, b) => sum + Number(b.tickets), 0);
          const blue = data.bets.filter(b => b.team === 2).reduce((sum, b) => sum + Number(b.tickets), 0);
          setLiveRedBets(red);
          setLiveBlueBets(blue);
        }
      } catch (err) {
        console.error("Failed to fetch bets:", err);
      }
    }
    fetchBets();
    const interval = setInterval(fetchBets, 5000);
    return () => clearInterval(interval);
  }, [phaseData.gameId]);

  // --------------- Board history polling ---------------
  useEffect(() => {
    const interval = setInterval(() => {
      fetch(`${backendUrl}/api/history`)
        .then(res => res.json())
        .then(data => setBoardHistory(data.boardHistory || []))
        .catch(err => console.error("loadHistory error:", err));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // --------------- Live board polling ---------------
  useEffect(() => {
    if (phaseData.phase !== "placing") return;
    if (selectedHistory || liveReplayIndex >= 0) return;
    const interval = setInterval(() => {
      fetch(`${backendUrl}/api/board`)
        .then(res => res.json())
        .then(data => { if (data && data.board) setLiveBoard(data.board); })
        .catch(err => console.error("Error polling board:", err));
    }, 1000);
    return () => clearInterval(interval);
  }, [phaseData.phase, selectedHistory, liveReplayIndex]);

  // --------------- Live auto-replay ---------------
  useEffect(() => {
    if (!liveAutoReplay || boardHistory.length === 0) return;
    const autoInterval = setInterval(() => {
      setLiveReplayIndex(prev => {
        const newIndex = prev < 0 ? 0 : prev + 1;
        if (newIndex >= boardHistory.length) {
          setLiveAutoReplay(false);
          return boardHistory.length - 1;
        }
        return newIndex;
      });
    }, 500);
    return () => clearInterval(autoInterval);
  }, [liveAutoReplay, boardHistory]);

  // --------------- Recorded auto-replay ---------------
  useEffect(() => {
    if (!selectedAutoReplay || !selectedHistory || selectedHistory.length === 0) return;
    const autoInterval = setInterval(() => {
      setSelectedReplayIndex(prev => {
        const newIndex = prev < 0 ? 0 : prev + 1;
        if (newIndex >= selectedHistory.length) {
          setSelectedAutoReplay(false);
          return selectedHistory.length - 1;
        }
        return newIndex;
      });
    }, 500);
    return () => clearInterval(autoInterval);
  }, [selectedAutoReplay, selectedHistory]);

  // --------------- Team info polling ---------------
  useEffect(() => {
    if (!gameContract) return;
    if (selectedHistory || liveReplayIndex >= 0) return;
    const interval = setInterval(() => {
      (async () => {
        try {
          const counts = await gameContract.getTeamCounts(phaseData.gameId);
          setTeamCounts({ red: Number(counts.redCount), blue: Number(counts.blueCount) });
          if (userAddress) {
            const tId = await gameContract.getTeam(phaseData.gameId, userAddress);
            setUserTeam(Number(tId));
          }
        } catch (err) {
          console.error("fetchTeamInfo error:", err);
        }
      })();
    }, 1000);
    return () => clearInterval(interval);
  }, [gameContract, userAddress, selectedHistory, liveReplayIndex, phaseData.gameId]);

  // --------------- MIZ balance polling ---------------
  useEffect(() => {
    if (!window.ethereum || !mizonsAddress || !userAddress) return;
    const provider = new ethers.BrowserProvider(window.ethereum);
    const mizonsContract = new ethers.Contract(mizonsAddress, mizonsABI, provider);
    const interval = setInterval(() => {
      mizonsContract
        .balanceOf(userAddress)
        .then(bal => setMizonsBalance(bal.toString()))
        .catch(err => console.error("Error fetching MIZ balance:", err));
    }, 1000);
    return () => clearInterval(interval);
  }, [mizonsAddress, userAddress]);

  // --------------- Refresh inventory ---------------
  const refreshInventory = useCallback(async () => {
    if (!chestMinterContract || !userAddress) return;
    try {
      const balanceBN = await chestMinterContract.balanceOf(userAddress);
      const balance = Number(balanceBN);
      const chestList = [];
      for (let i = 0; i < balance; i++) {
        const tokenIdBN = await chestMinterContract.tokenOfOwnerByIndex(userAddress, i);
        const tokenId = Number(tokenIdBN);
        const chestTypeBN = await chestMinterContract.tokenChestType(tokenId);
        const chestType = Number(chestTypeBN);
        chestList.push({ tokenId, type: chestType });
      }
      setInventory(chestList);
    } catch (error) {
      console.error("Error fetching inventory:", error);
    }
  }, [chestMinterContract, userAddress]);

  useEffect(() => {
    refreshInventory();
  }, [refreshInventory, status]);

  // --------------- Fetch owned skins from ChestOpener ---------------
  async function fetchOwnedSkinsFromOpener() {
    if (!chestOpenerContract || !userAddress) return;
    try {
      const itemBalanceBN = await chestOpenerContract.balanceOf(userAddress);
      const itemBalance = Number(itemBalanceBN);
      const finalSkins = [];
      for (let i = 0; i < itemBalance; i++) {
        const tokenIdBN = await chestOpenerContract.tokenOfOwnerByIndex(userAddress, i);
        const tokenId = Number(tokenIdBN);
        const awardedItemBN = await chestOpenerContract.tokenAwardedItem(tokenId);
        const awardedItem = Number(awardedItemBN);
        finalSkins.push(awardedItem);
      }
      const uniqueSkins = Array.from(new Set(finalSkins));
      setOwnedSkins(uniqueSkins);
    } catch (err) {
      console.error("Error fetching final skins from ChestOpener:", err);
    }
  }

  // Refresh owned skins whenever chest operations occur.
  useEffect(() => {
    fetchOwnedSkinsFromOpener();
  }, [chestOpenerContract, userAddress, status]);

  // --------------- joinTeam ---------------
  async function joinTeam(teamId) {
    if (!gameContract) {
      setErrorMsg("No contract connected.");
      return;
    }
    if (phaseData.phase !== "picking") {
      setErrorMsg("Team joining is only allowed during picking phase.");
      return;
    }
    if (userTeam === teamId) {
      setStatus("Already in that team!");
      return;
    }
    try {
      setStatus(`Joining team ${teamId === 1 ? "Red" : "Blue"}...`);
      const tx = await gameContract.joinTeam(phaseData.gameId, teamId);
      await tx.wait();
      setStatus("Joined team successfully!");
      setErrorMsg("");
      const tId = await gameContract.getTeam(phaseData.gameId, userAddress);
      setUserTeam(Number(tId));
    } catch (err) {
      console.error("joinTeam error:", err);
      setErrorMsg("joinTeam error: " + (err.reason || err.message));
    }
  }

  // --------------- placeSquare ---------------
  async function placeSquare(x, y) {
    if (!gameContract) {
      setErrorMsg("No contract connected.");
      return;
    }
    if (phaseData.phase !== "placing") {
      setErrorMsg("Not in placing phase!");
      return;
    }
    try {
      setStatus(`Placing square at (${x}, ${y})...`);
      const tx = await gameContract.placeSquare(x, y);
      await tx.wait();
      setStatus("Square placed!");
      setErrorMsg("");
    } catch (err) {
      console.error("placeSquare error:", err);
      setErrorMsg("placeSquare error: " + err.message);
    }
  }

  // --------------- Handle brain chest minting with stirring animation ---------------
  async function handleMintChest() {
    if (!userAddress) {
      alert("Connect your wallet first!");
      return;
    }
    if (!chestMinterContract) {
      alert("Chest contract not connected.");
      return;
    }
    try {
      // Step 1: Show brain chest.
      setChestAnimation({
        active: true,
        step: "brain",
        chestType: null,
        frame: 0,
        data: { image: `${backendUrl}/chests/brain.png` }
      });
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Step 2: Show stirring animation.
      setChestAnimation({
        active: true,
        step: "stir",
        chestType: null,
        frame: 0,
        data: { image: `${backendUrl}/chests/brain.png` }
      });
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Step 3: Mint the chest NFT.
      const tx = await chestMinterContract.mintRandomChest({ gasLimit: 400000 });
      await tx.wait();
      await new Promise(resolve => setTimeout(resolve, 1000));
      refreshInventory();
      fetchOwnedSkinsFromOpener();

      // Step 4: Retrieve new chest token info.
      const balanceBN = await chestMinterContract.balanceOf(userAddress);
      const balance = Number(balanceBN);
      const tokenIdBN = await chestMinterContract.tokenOfOwnerByIndex(userAddress, balance - 1);
      const tokenId = Number(tokenIdBN);
      const chestTypeBN = await chestMinterContract.tokenChestType(tokenId);
      const chestType = Number(chestTypeBN);

      // Build backend URLs.
      const metadataUrl = `${backendUrl}/chests/var/${chestType}.json`;
      const imageUrl = `${backendUrl}/chests/icons/chest${chestType}/frame1.png`;
      console.log("Big Chest Metadata URL:", metadataUrl);
      console.log("Big Chest Image URL:", imageUrl);

      // Step 5: Fetch metadata.
      const response = await fetch(metadataUrl);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const metadata = await response.json();
      metadata.image = imageUrl;

      // Step 6: Reveal the minted chest.
      setChestAnimation({
        active: true,
        step: "revealed",
        data: metadata,
        chestType: chestType,
        frame: 0
      });
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (err) {
      console.error("Error minting chest:", err);
      alert("Chest minting failed: " + err.message);
    } finally {
      setChestAnimation({
        active: false,
        step: null,
        data: null,
        chestType: null,
        frame: 0
      });
    }
  }

  // --------------- Handle opening a small chest from inventory ---------------
  async function handleOpenChest(tokenId) {
    const chest = inventory.find(c => c.tokenId === tokenId);
    if (!chest) {
      alert("Chest not found in inventory.");
      return;
    }
    // Start small chest animation (cycle frames 1 to 5).
    setChestAnimation({ active: true, step: "opening", chestType: chest.type, frame: 1, data: null });
    for (let i = 1; i <= 5; i++) {
      setChestAnimation(prev => ({ ...prev, frame: i }));
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    try {
      const tx = await chestOpenerContract.openChest(tokenId, { value: ethers.parseEther("0.001") });
      await tx.wait();
      const newItemIdBN = await chestOpenerContract.itemCounter();
      const newItemId = Number(newItemIdBN) - 1;
      const awardedItemBN = await chestOpenerContract.tokenAwardedItem(newItemId);
      const awardedItem = Number(awardedItemBN);
      
      // Build backend URLs for the final item.
      const imageUrl = `${backendUrl}/skins/icons/${awardedItem}.png`;
      const metadataUrl = `${backendUrl}/skins/text1/${awardedItem}.json`;
      console.log("Awarded Image URL:", imageUrl);
      console.log("Awarded Metadata URL:", metadataUrl);
      
      const response = await fetch(metadataUrl);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const metadata = await response.json();
      metadata.image = imageUrl;
      
      setChestAnimation({ active: true, step: "revealed", data: metadata, chestType: chest.type, frame: 0 });
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (err) {
      console.error("Error opening chest:", err);
      alert("Failed to open chest: " + err.message);
    } finally {
      setChestAnimation({ active: false, step: null, data: null, chestType: null, frame: 0 });
      refreshInventory();
      fetchOwnedSkinsFromOpener();
    }
  }

  // --------------- Approve tokens ---------------
  async function approveTokens() {
    if (!userAddress) {
      alert("Connect your wallet first!");
      return;
    }
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const mizonsContract = new ethers.Contract(mizonsAddress, mizonsABI, signer);
      const tx = await mizonsContract.approve(chestMinterAddress, "1000000000000", { gasLimit: 100000 });
      await tx.wait();
      alert("Approval successful!");
    } catch (err) {
      console.error("Approval error:", err);
      alert("Approval failed: " + err.message);
    }
  }

  // --------------- Place bet ---------------
  async function placeBet(teamId) {
    if (!bettingContract) {
      setErrorMsg("No betting contract available.");
      return;
    }
    if (phaseData.phase !== "picking") {
      setErrorMsg("Betting is only allowed during picking phase.");
      return;
    }
    try {
      setStatus(`Placing ${betAmount} bet(s) on ${teamId === 1 ? "Red" : "Blue"}...`);
      for (let i = 0; i < betAmount; i++) {
        const tx = await bettingContract.placeBet(phaseData.gameId, teamId, 1, { value: ethers.parseEther("0.00005") });
        await tx.wait();
      }
      setStatus(`${betAmount} bet(s) placed on ${teamId === 1 ? "Red" : "Blue"}!`);
      setErrorMsg("");
    } catch (err) {
      console.error("Bet failed:", err);
      setErrorMsg("Bet failed: " + err.message);
    }
  }

  // --------------- Live replay controls ---------------
  const livePrevBoard = () => {
    if (boardHistory.length === 0) return;
    setLiveReplayIndex(prev => (prev < 0 ? boardHistory.length - 1 : Math.max(0, prev - 1)));
  };
  const liveNextBoard = () => {
    if (boardHistory.length === 0) return;
    setLiveReplayIndex(prev => (prev < 0 ? 0 : Math.min(boardHistory.length - 1, prev + 1)));
  };
  const liveGoToLive = () => {
    setLiveAutoReplay(false);
    setLiveReplayIndex(-1);
  };
  const liveToggleAutoReplay = () => {
    if (boardHistory.length === 0) return;
    if (liveReplayIndex < 0) setLiveReplayIndex(0);
    setLiveAutoReplay(prev => !prev);
  };

  // --------------- Recorded replay controls ---------------
  const recordPrevBoard = () => {
    if (!selectedHistory || selectedHistory.length === 0) return;
    setSelectedReplayIndex(prev => (prev < 0 ? selectedHistory.length - 1 : Math.max(0, prev - 1)));
  };
  const recordNextBoard = () => {
    if (!selectedHistory || selectedHistory.length === 0) return;
    setSelectedReplayIndex(prev => (prev < 0 ? 0 : Math.min(selectedHistory.length - 1, prev + 1)));
  };
  const recordToggleAutoReplay = () => {
    if (!selectedHistory || selectedHistory.length === 0) return;
    if (!selectedAutoReplay) setSelectedReplayIndex(0);
    setSelectedAutoReplay(prev => !prev);
  };
  const recordGoBackToLive = () => {
    setSelectedRecord(null);
    setSelectedHistory(null);
    setSelectedReplayIndex(-1);
    setSelectedAutoReplay(false);
  };

  return (
    <div className="app-container">
      <style>{`
        input[type="range"] {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 6px;
          background: #222;
          border-radius: 4px;
          outline: none;
          margin: 6px 0;
          cursor: pointer;
          border: 1px solid #ff00e2;
        }
        input[type="range"]::-webkit-slider-runnable-track {
          background: #111;
          border-radius: 4px;
          box-shadow: 0 0 4px #ff00e2;
        }
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 16px;
          height: 16px;
          background: #ff00e2;
          border-radius: 50%;
          box-shadow: 0 0 6px #ff00e2;
          margin-top: -5px;
        }
        input[type="range"]::-moz-range-track {
          background: #111;
          border-radius: 4px;
          box-shadow: 0 0 4px #ff00e2;
        }
        input[type="range"]::-moz-range-thumb {
          width: 16px;
          height: 16px;
          background: #ff00e2;
          border: none;
          border-radius: 50%;
          box-shadow: 0 0 6px #ff00e2;
        }
        .chest-animation-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(0,0,0,0.85);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 1100;
        }
        .chest-animation-content {
          text-align: center;
          animation: chestPop 0.8s ease-out;
          transition: opacity 0.5s ease;
        }
        @keyframes chestPop {
          0% { transform: scale(0.5); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes shake {
          0% { transform: translate(0, 0); }
          20% { transform: translate(-10px, 0); }
          40% { transform: translate(10px, 0); }
          60% { transform: translate(-10px, 0); }
          80% { transform: translate(10px, 0); }
          100% { transform: translate(0, 0); }
        }
        .shake {
          animation: shake 1s;
        }
        .chest-animation-content img {
          width: 200px;
          height: auto;
          transition: opacity 0.5s ease;
        }
        .chest-animation-content p {
          color: #ff00e2;
          font-size: 1.5rem;
          text-shadow: 0 0 4px #ff00e2;
          margin-top: 1rem;
        }
        .stir {
          animation: stirAnimation 1s infinite;
        }
        @keyframes stirAnimation {
          0% { transform: rotate(0deg); }
          50% { transform: rotate(5deg); }
          100% { transform: rotate(0deg); }
        }
      `}</style>

      {/* Chest Animation Overlay */}
      {chestAnimation.active && (
        <div className="chest-animation-overlay">
          <div className="chest-animation-content">
            {chestAnimation.step === "brain" && chestAnimation.data && (
              <img src={chestAnimation.data.image} alt="Brain Chest" />
            )}
            {chestAnimation.step === "stir" && chestAnimation.data && (
              <img className="stir" src={chestAnimation.data.image} alt="Brain Chest Stirring" />
            )}
            {chestAnimation.step === "opening" && chestAnimation.chestType !== null && (
              <img
                src={`${backendUrl}/chests/icons/chest${chestAnimation.chestType}/frame${chestAnimation.frame}.png`}
                alt={`Chest Animation Frame ${chestAnimation.frame}`}
              />
            )}
            {chestAnimation.step === "revealed" && chestAnimation.data && (
              <>
                <img src={chestAnimation.data.image} alt={chestAnimation.data.name} />
                <h3>{chestAnimation.data.name}</h3>
                <p>{chestAnimation.data.description}</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Top-Left Buttons */}
      <div className="top-left-buttons">
        <button onClick={() => alert("Information: This is Game of Death!")}>Info</button>
        <button onClick={() => alert("Lore: In the pit of despair...")}>Lore</button>
        <button onClick={() => {
          // When clicking the skins tab, refresh owned skins from ChestOpener then show panel.
          fetchOwnedSkinsFromOpener().then(() => setShowWholeSkins(true));
        }}>
          Skins
        </button>
      </div>

      {/* Winner Overlay */}
      {winnerOverlay && !selectedHistory && liveReplayIndex < 0 && !chestAnimation.active && (
        <div className="winner-overlay">
          <h1 className="winner-text">{winnerOverlay} TEAM WON!</h1>
        </div>
      )}

      {/* Title Bar */}
      <div className="title-bar"><h1>Game of Death</h1></div>

      {/* Scoreboard */}
      <div className="scoreboard-bar-container">
        <div className="score-bar">
          <div className="score-bar-red" style={{ width: `${redPercent}%` }} />
          <div className="score-bar-blue" style={{ width: `${bluePercent}%` }} />
        </div>
      </div>

      {/* Wallet Corner */}
      <div className="wallet-corner">
        {userAddress ? (
          <>
            <p className="tiny-wallet">{userAddress.slice(0, 6)}...{userAddress.slice(-4)}</p>
            <button className="corner-btn" onClick={disconnectWallet}>Disconnect</button>
          </>
        ) : (
          <button className="corner-btn" onClick={connectWallet}>Connect Wallet</button>
        )}
      </div>

      {/* Main Content */}
      <div className="main-content">
        {/* Left Panel */}
        <div className="left-panel">
          <h2>Your MIZ</h2>
          <div className="miz-balance-container">
            <img src={logo} alt="MIZ Logo" className="miz-logo" />
            <p>{formatMizons(mizonsBalance)} MIZ</p>
          </div>

          {/* Chest Roll Section */}
          <div className="chest-roll-section">
            <h2 style={{ fontSize: "1rem" }}>Chest Roll</h2>
            <button onClick={approveTokens}>Approve Tokens</button>
            <button onClick={handleMintChest} style={{ display: "block", margin: "10px auto" }}>
              <img src={`${backendUrl}/chests/brain.png`} alt="Brain Chest" style={{ width: 100, height: "auto" }} />
            </button>
            <div style={{ marginTop: 10, borderTop: "1px solid #ccc", paddingTop: 10, height: "auto", overflowY: "auto" }}>
              <h3 style={{ fontSize: "1rem", textAlign: "center" }}>Your Inventory</h3>
              <Inventory inventory={inventory} backendUrl={backendUrl} onOpenChest={handleOpenChest} />
            </div>
          </div>

          {/* Phase and Team Info */}
          <div style={{ marginTop: 20, width: "100%" }}>
            <div className="phase-info-card">
              <p>Phase: {phaseData.phase}</p>
              <p>Time Left: {phaseData.timeLeft > 0 ? phaseData.timeLeft : 0}s</p>
              <p>Game ID: {phaseData.gameId}</p>
            </div>
            <p style={{ marginTop: 6 }}>Your Team: {userTeam === 1 ? "Red" : userTeam === 2 ? "Blue" : "None"}</p>
            <div className="join-team-buttons">
              <button className="join-red" onClick={() => joinTeam(1)} disabled={phaseData.phase !== "picking"}>
                Join Red
              </button>
              <button className="join-blue" onClick={() => joinTeam(2)} disabled={phaseData.phase !== "picking"}>
                Join Blue
              </button>
            </div>
            <p>Team Red: {teamCounts.red}</p>
            <p>Team Blue: {teamCounts.blue}</p>

            {/* Bet Panel */}
            <h3 style={{ marginTop: 10 }}>Bet Panel</h3>
            <p style={{ margin: 0 }}>Red Bets: {liveRedBets}</p>
            <p style={{ margin: 0 }}>Blue Bets: {liveBlueBets}</p>
            <p style={{ margin: 0 }}>Tickets: {betAmount}</p>
            <input type="range" min="1" max="10" value={betAmount} onChange={e => setBetAmount(Number(e.target.value))} />
            <div className="bet-buttons">
              <button className="bet-red" onClick={() => placeBet(1)} disabled={phaseData.phase !== "picking"}>
                Bet Red
              </button>
              <button className="bet-blue" onClick={() => placeBet(2)} disabled={phaseData.phase !== "picking"}>
                Bet Blue
              </button>
            </div>
          </div>
        </div>

        {/* Center Board */}
        <div className="center-board">
          <div className="board-container" style={{ width: boardSize, height: boardSize }}>
            <div className="board-border">
              {showVeil && userTeam === 1 && (
                <div style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  width: "100%",
                  height: "50%",
                  background: "rgba(0,0,0,0.3)",
                  pointerEvents: "none",
                  zIndex: 999
                }} />
              )}
              {showVeil && userTeam === 2 && (
                <div style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "50%",
                  background: "rgba(0,0,0,0.3)",
                  pointerEvents: "none",
                  zIndex: 999
                }} />
              )}
              <div className="board-grid">
                {displayBoard.map((cell, i) => {
                  const x = i % 64;
                  const y = Math.floor(i / 64);
                  let cellClass = "cell";
                  if (cell.value === 1) cellClass += " red";
                  if (cell.value === 2) cellClass += " blue";
                  if (!selectedHistory && liveReplayIndex < 0 && phaseData.phase === "placing") {
                    if (userTeam === 1 && y >= 32) cellClass += " dim-cell";
                    if (userTeam === 2 && y < 32) cellClass += " dim-cell";
                  }
                  return (
                    <div
                      key={i}
                      className={cellClass}
                      onClick={() => {
                        if (selectedHistory) return;
                        if (phaseData.phase !== "placing") return;
                        if (userTeam === 1 && y >= 32) return;
                        if (userTeam === 2 && y < 32) return;
                        placeSquare(x, y);
                      }}
                    />
                  );
                })}
              </div>
            </div>
          </div>
          {!selectedHistory && (
            <div className="replay-container">
              <button onClick={livePrevBoard}>←</button>
              <button onClick={liveGoToLive}>Live</button>
              <button onClick={liveNextBoard}>→</button>
              <button className="auto-replay-btn" onClick={liveToggleAutoReplay}>
                {liveAutoReplay ? "Stop Replay" : "Auto Replay"}
              </button>
            </div>
          )}
          {!selectedHistory && liveReplayIndex >= 0 && (
            <p style={{ marginTop: 4 }}>Viewing Board {liveReplayIndex + 1}/{boardHistory.length}</p>
          )}
          {!selectedHistory && liveReplayIndex < 0 && (
            <p style={{ marginTop: 4 }}>Viewing Live Board</p>
          )}
        </div>

        {/* Right Panel */}
        <div className="right-panel">
          <h2>Game Records</h2>
          <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
            <button className="toggle-btn" onClick={() => { setShowMyGames(false); setRefreshKey(prev => prev + 1); }}>
              All Games
            </button>
            <button className="toggle-btn" onClick={() => { setShowMyGames(true); setRefreshKey(prev => prev + 1); }} disabled={!userAddress}>
              My Games
            </button>
          </div>
          <RecordsList
            backendUrl={backendUrl}
            showMyGames={showMyGames}
            userAddress={userAddress}
            onSelectRecord={selectRecord}
            refreshKey={refreshKey}
            setLatestRecord={setLatestRecord}
          />
          {selectedRecord && selectedHistory && (
            <div style={{ marginTop: 10 }}>
              <h3>Game #{selectedRecord.gameId} Details</h3>
              <p>Played at: {selectedRecord.timestamp ? new Date(selectedRecord.timestamp).toLocaleString() : "N/A"}</p>
              <p>Winner: {selectedRecord.winner}</p>
              <p>Team Red: {selectedRecord.teamRedCount} | Team Blue: {selectedRecord.teamBlueCount}</p>
              {selectedRecord.thumbnail && (
                <img src={selectedRecord.thumbnail} alt={`Game #${selectedRecord.gameId}`} style={{ width: 150, height: 150, objectFit: "cover" }} />
              )}
              <div style={{ marginTop: 6 }}>
                <button className="auto-replay-btn" onClick={() => {
                  setSelectedAutoReplay(!selectedAutoReplay);
                  if (!selectedAutoReplay) setSelectedReplayIndex(0);
                }}>
                  {selectedAutoReplay ? "Stop Auto Replay" : "Start Auto Replay"}
                </button>
              </div>
              <div className="replay-container" style={{ justifyContent: "center" }}>
                <button onClick={recordPrevBoard}>←</button>
                <button onClick={recordGoBackToLive}>Exit</button>
                <button onClick={recordNextBoard}>→</button>
              </div>
              {selectedReplayIndex < 0 ? (
                <p>Viewing final snapshot</p>
              ) : (
                <p>Viewing Board {selectedReplayIndex + 1}/{selectedHistory.length}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* WholeSkinsPanel Overlay */}
      {showWholeSkins && (
        <WholeSkinsPanel
          onSelectSkin={(skinId) => {
            alert(`Selected skin #${skinId}`);
            setShowWholeSkins(false);
          }}
          onClose={() => setShowWholeSkins(false)}
          ownedSkins={ownedSkins}
        />
      )}

      {/* Error Bar */}
      {errorMsg && (
        <div className="error-bar">
          {errorMsg} <button className="error-close" onClick={() => setErrorMsg("")}>x</button>
        </div>
      )}
    </div>
  );
}

export default App;

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
  "function placeBet(uint256 gameId, uint8 team, uint256 tickets) external",
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

// -------------------- Environment Constants --------------------
const gameAddress = process.env.REACT_APP_GAMEOFDEATH_ADDRESS;
const bettingAddress = process.env.REACT_APP_BETTING_ADDRESS;
const mizonsAddress = process.env.REACT_APP_MIZONS_ADDRESS;
const chestMinterAddress = process.env.REACT_APP_CHEST_MINTER_ADDRESS;
const backendUrl = process.env.REACT_APP_BACKEND_URL || "http://localhost:3000";

// -------------------- Helper: Convert Numeric Board to Augmented Board --------------------
function convertToAugmentedBoard(numericalBoard) {
  return numericalBoard.map(val => ({ value: val, skin: null }));
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
                  <p>
                    {rec.winner} won at {dateString}
                  </p>
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
function WholeSkinsPanel({ onSelectSkin, onClose }) {
  const GRID_COLUMNS = 32;
  const GRID_ROWS = 32;
  const CELL_SIZE = 18;
  const TOTAL_SKINS = 1024;

  function getSkinCoords(skinId) {
    const x = (skinId % GRID_COLUMNS) * CELL_SIZE;
    const y = Math.floor(skinId / GRID_COLUMNS) * CELL_SIZE;
    return { x, y };
  }

  return (
    <div className="whole-skins-overlay">
      <div style={{ position: "relative" }}>
        <img
          src={`${backendUrl}/skins/whole.png`}
          alt="All Skins"
          style={{
            width: GRID_COLUMNS * CELL_SIZE,
            height: GRID_ROWS * CELL_SIZE,
            display: "block"
          }}
        />
        {Array.from({ length: TOTAL_SKINS }, (_, i) => {
          const { x, y } = getSkinCoords(i);
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: x,
                top: y,
                width: CELL_SIZE,
                height: CELL_SIZE,
                backgroundColor: "rgba(0,0,0,0.9)",
                cursor: "not-allowed"
              }}
              onClick={() => onSelectSkin(i)}
            />
          );
        })}
      </div>
      <button className="close-whole-skins-btn" onClick={onClose}>
        Close
      </button>
    </div>
  );
}

// -------------------- Main App Component --------------------
function App() {
  // Desktop layout: using your original side-panel design
  // Mobile layout will be activated via CSS media queries.
  // For desktop, the title is at the top; below that, the scoreboard;
  // then the main content is in three columns (left panel, center board, right panel).
  
  // For the board size on desktop we can use a minimum board size.
  const LEFT_PANEL_WIDTH = 320;
  const RIGHT_PANEL_WIDTH = 320;
  const TOP_BAR_HEIGHT = 120;
  const MIN_BOARD_SIZE = 300;
  const [boardSize, setBoardSize] = useState(MIN_BOARD_SIZE);
  
  useEffect(() => {
    function handleResize() {
      // For desktop, the board size is the minimum of available width and height.
      const marginBetween = 60;
      const availableWidth = window.innerWidth - (LEFT_PANEL_WIDTH + RIGHT_PANEL_WIDTH + marginBetween);
      const bottomMargin = 40;
      const availableHeight = window.innerHeight - (TOP_BAR_HEIGHT + bottomMargin);
      const size = Math.max(MIN_BOARD_SIZE, Math.min(availableWidth, availableHeight));
      setBoardSize(size);
    }
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  
  // States
  const [userAddress, setUserAddress] = useState("");
  const [gameContract, setGameContract] = useState(null);
  const [bettingContract, setBettingContract] = useState(null);
  const [chestMinterContract, setChestMinterContract] = useState(null);
  const [mizonsBalance, setMizonsBalance] = useState("0");
  const [phaseData, setPhaseData] = useState({ phase: "picking", timeLeft: 30, gameId: 1 });
  const [teamCounts, setTeamCounts] = useState({ red: 0, blue: 0 });
  const [userTeam, setUserTeam] = useState(0);
  const [status, setStatus] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  
  // Live board & replay history
  const [liveBoard, setLiveBoard] = useState(Array(4096).fill({ value: 0, skin: null }));
  const [boardHistory, setBoardHistory] = useState([]);
  const [liveReplayIndex, setLiveReplayIndex] = useState(-1);
  const [liveAutoReplay, setLiveAutoReplay] = useState(false);
  
  // Past record state
  const [showMyGames, setShowMyGames] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [selectedHistory, setSelectedHistory] = useState(null);
  const [selectedReplayIndex, setSelectedReplayIndex] = useState(-1);
  const [selectedAutoReplay, setSelectedAutoReplay] = useState(false);
  const [latestRecord, setLatestRecord] = useState(null);
  
  // Bets & inventory
  const [liveRedBets, setLiveRedBets] = useState(0);
  const [liveBlueBets, setLiveBlueBets] = useState(0);
  const [betAmount, setBetAmount] = useState(1);
  
  // Overlays
  const [showWholeSkins, setShowWholeSkins] = useState(false);
  const [winnerOverlay, setWinnerOverlay] = useState(null);
  const socketRef = useRef(null);
  const [inventory, setInventory] = useState(new Array(16).fill(0));
  
  // Determine which board to display:
  // 1) If a record is selected, show that record’s snapshot.
  // 2) Else if liveReplayIndex >= 0, show a boardHistory snapshot.
  // 3) Otherwise, show the liveBoard.
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
  
  // Compute scoreboard ratio
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
  let redPercent = 50, bluePercent = 50;
  if (totalOpposing > 0) {
    redPercent = (redOnBlue / totalOpposing) * 100;
    bluePercent = (blueOnRed / totalOpposing) * 100;
  }
  
  // Show veil in placing phase if not replaying
  const showVeil = phaseData.phase === "placing" && !selectedRecord && liveReplayIndex < 0;
  
  // Format MIZ balance
  function formatMizons(balance) {
    const bal = Number(ethers.formatUnits(balance, 18));
    if (bal === 0) return "0";
    if (bal < 0.000001 || bal > 1000000) return bal.toExponential(6);
    return bal.toFixed(6);
  }
  
  // selectRecord
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
  
  // Wallet connect/disconnect
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
  
  // Socket.io setup
  useEffect(() => {
    socketRef.current = io(backendUrl, { transports: ["websocket"] });
    socketRef.current.on("connect", () => console.log("Socket connected:", socketRef.current.id));
    socketRef.current.on("phaseUpdated", data => setPhaseData(data));
    socketRef.current.on("boardUpdated", augmentedBoard => {
      if (liveReplayIndex < 0 && !selectedHistory) {
        setLiveBoard(augmentedBoard);
      }
    });
    socketRef.current.on("winner", ({ winner }) => {
      setWinnerOverlay(winner);
      setTimeout(() => setWinnerOverlay(null), 3000);
    });
    socketRef.current.on("newGameRecord", record => console.log("Received new game record:", record));
    socketRef.current.on("disconnect", () => console.log("Socket disconnected"));
    return () => socketRef.current.disconnect();
  }, [liveReplayIndex, selectedHistory]);
  
  // Poll phaseData every 2 seconds.
  useEffect(() => {
    const interval = setInterval(() => {
      fetch(`${backendUrl}/api/state`)
        .then(res => res.json())
        .then(data => setPhaseData(data))
        .catch(err => console.error("Error fetching state:", err));
    }, 2000);
    return () => clearInterval(interval);
  }, []);
  
  // Contract setup when wallet is connected.
  useEffect(() => {
    if (!window.ethereum || !userAddress) return;
    if (!gameAddress || !bettingAddress || !mizonsAddress || !chestMinterAddress) {
      setErrorMsg("Missing contract addresses in env variables.");
      return;
    }
    async function setupContracts() {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const gameC = new ethers.Contract(gameAddress, gameABI, signer);
        const bettingC = new ethers.Contract(bettingAddress, bettingABI, signer);
        const chestC = new ethers.Contract(chestMinterAddress, chestMinterABI, signer);
        setGameContract(gameC);
        setBettingContract(bettingC);
        setChestMinterContract(chestC);
      } catch (err) {
        console.error("Error setting up contracts:", err);
        setErrorMsg("Error setting up contracts: " + err.message);
      }
    }
    setupContracts();
  }, [userAddress]);
  
  // Poll bets
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
  
  // Poll board history
  useEffect(() => {
    const interval = setInterval(() => {
      fetch(`${backendUrl}/api/history`)
        .then(res => res.json())
        .then(data => setBoardHistory(data.boardHistory || []))
        .catch(err => console.error("loadHistory error:", err));
    }, 2000);
    return () => clearInterval(interval);
  }, []);
  
  // Poll live board in "placing" phase if not replaying.
  useEffect(() => {
    if (phaseData.phase !== "placing") return;
    if (selectedHistory || liveReplayIndex >= 0) return;
    const interval = setInterval(() => {
      fetch(`${backendUrl}/api/board`)
        .then(res => res.json())
        .then(data => {
          if (data && data.board) setLiveBoard(data.board);
        })
        .catch(err => console.error("Error polling board:", err));
    }, 1000);
    return () => clearInterval(interval);
  }, [phaseData.phase, selectedHistory, liveReplayIndex]);
  
  // Auto-replay for live board.
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
  
  // Auto-replay for records.
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
  
  // Poll team info if not replaying.
  useEffect(() => {
    if (!gameContract) return;
    if (selectedHistory || liveReplayIndex >= 0) return;
    const interval = setInterval(() => {
      (async () => {
        try {
          const counts = await gameContract.getTeamCounts(phaseData.gameId);
          setTeamCounts({
            red: Number(counts.redCount),
            blue: Number(counts.blueCount)
          });
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
  
  // Poll MIZ balance.
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
  
  // Refresh inventory.
  const refreshInventory = useCallback(async () => {
    if (!chestMinterContract || !userAddress) return;
    try {
      const balanceBN = await chestMinterContract.balanceOf(userAddress);
      const balance = Number(balanceBN);
      const chestCounts = new Array(16).fill(0);
      for (let i = 0; i < balance; i++) {
        const tokenIdBN = await chestMinterContract.tokenOfOwnerByIndex(userAddress, i);
        const tokenId = Number(tokenIdBN);
        const chestTypeBN = await chestMinterContract.tokenChestType(tokenId);
        const chestType = Number(chestTypeBN);
        chestCounts[chestType]++;
      }
      setInventory(chestCounts);
    } catch (error) {
      console.error("Error fetching inventory:", error);
    }
  }, [chestMinterContract, userAddress]);
  useEffect(() => {
    refreshInventory();
  }, [refreshInventory, status]);
  
  // Join Team.
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
  
  // Place Square.
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
  
  // Chest mint & approval.
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
      const tx = await chestMinterContract.mintRandomChest({ gasLimit: 400000 });
      await tx.wait();
      alert("Chest NFT minted successfully!");
      refreshInventory();
    } catch (err) {
      console.error("Error minting chest:", err);
      alert("Chest minting failed: " + err.message);
    }
  }
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
  
  // Betting.
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
        const tx = await bettingContract.placeBet(phaseData.gameId, teamId, 1);
        await tx.wait();
      }
      setStatus(`${betAmount} bet(s) placed on ${teamId === 1 ? "Red" : "Blue"}!`);
      setErrorMsg("");
    } catch (err) {
      console.error("Bet failed:", err);
      setErrorMsg("Bet failed: " + err.message);
    }
  }
  
  // Live replay controls.
  function livePrevBoard() {
    if (boardHistory.length === 0) return;
    setLiveReplayIndex(i => (i < 0 ? boardHistory.length - 1 : Math.max(0, i - 1)));
  }
  function liveNextBoard() {
    if (boardHistory.length === 0) return;
    setLiveReplayIndex(i => (i < 0 ? 0 : Math.min(boardHistory.length - 1, i + 1)));
  }
  function liveGoToLive() {
    setLiveAutoReplay(false);
    setLiveReplayIndex(-1);
  }
  function liveToggleAutoReplay() {
    if (boardHistory.length === 0) return;
    if (liveReplayIndex < 0) setLiveReplayIndex(0);
    setLiveAutoReplay(prev => !prev);
  }
  
  // Recorded replay controls.
  function recordPrevBoard() {
    if (!selectedHistory || selectedHistory.length === 0) return;
    setSelectedReplayIndex(i => (i < 0 ? selectedHistory.length - 1 : Math.max(0, i - 1)));
  }
  function recordNextBoard() {
    if (!selectedHistory || selectedHistory.length === 0) return;
    setSelectedReplayIndex(i => (i < 0 ? 0 : Math.min(selectedHistory.length - 1, i + 1)));
  }
  function recordToggleAutoReplay() {
    if (!selectedHistory || selectedHistory.length === 0) return;
    if (!selectedAutoReplay) setSelectedReplayIndex(0);
    setSelectedAutoReplay(prev => !prev);
  }
  function recordGoBackToLive() {
    setSelectedRecord(null);
    setSelectedHistory(null);
    setSelectedReplayIndex(-1);
    setSelectedAutoReplay(false);
  }
  
  return (
    <div className="app-container">
      {/* Top-Left Buttons */}
      <div className="top-left-buttons">
        <button onClick={() => alert("Information: This is Game of Death!")}>Info</button>
        <button onClick={() => alert("Lore: In the pit of despair...")}>Lore</button>
        <button onClick={() => setShowWholeSkins(true)}>Skins</button>
      </div>
  
      {/* Winner Overlay */}
      {winnerOverlay && !selectedHistory && liveReplayIndex < 0 && (
        <div className="winner-overlay">
          <h1 className="winner-text">{winnerOverlay} TEAM WON!</h1>
        </div>
      )}
  
      {/* Title Bar (Desktop view: at top; Mobile: stays at top) */}
      <div className="title-bar">
        <h1>Game of Death</h1>
      </div>
  
      {/* Ratio Scoreboard */}
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
            <p className="tiny-wallet">
              {userAddress.slice(0, 6)}...{userAddress.slice(-4)}
            </p>
            <button className="corner-btn" onClick={disconnectWallet}>Disconnect</button>
          </>
        ) : (
          <button className="corner-btn" onClick={connectWallet}>Connect Wallet</button>
        )}
      </div>
  
      {/* Main Content */}
      <div className="main-content">
        {/* Desktop view: three columns; Mobile view: stacked (via media query) */}
  
        {/* Left Panel */}
        <div className="left-panel">
          <h2>Your MIZ</h2>
          <div className="miz-balance-container">
            <img src={logo} alt="MIZ Logo" className="miz-logo" />
            <p>{formatMizons(mizonsBalance)} MIZ</p>
          </div>
          <div className="chest-roll-section">
            <h2 style={{ fontSize: "1rem" }}>Chest Roll</h2>
            <button onClick={approveTokens}>Approve Tokens</button>
            <button onClick={handleMintChest} style={{ display: "block", margin: "10px auto" }}>
              <img src={`${backendUrl}/chests/brain.png`} alt="Brain Chest" style={{ width: 100, height: "auto" }} />
            </button>
            <div style={{
              marginTop: 10,
              borderTop: "1px solid #ccc",
              paddingTop: 10,
              height: "auto",
              overflowY: "auto"
            }}>
              <h3 style={{ fontSize: "1rem", textAlign: "center" }}>Your Inventory</h3>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 4,
                justifyItems: "center"
              }}>
                {Array.from({ length: 16 }, (_, i) => 15 - i).map(type => {
                  const count = inventory[type] || 0;
                  return (
                    <div key={type} style={{ position: "relative", textAlign: "center" }}>
                      <img src={`${backendUrl}/chests/var/frame${type}.png`} alt={`Chest Type ${type}`} style={{ width: 35, height: "auto" }} />
                      <div style={{
                        position: "absolute",
                        bottom: 0,
                        right: 0,
                        background: "rgba(0,0,0,0.6)",
                        color: "#fff",
                        borderRadius: "50%",
                        padding: "2px 5px",
                        fontSize: "0.7rem"
                      }}>
                        {count}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div style={{ marginTop: 20, width: "100%" }}>
            <div className="phase-info-card">
              <p>Phase: {phaseData.phase}</p>
              <p>Time Left: {phaseData.timeLeft > 0 ? phaseData.timeLeft : 0}s</p>
              <p>Game ID: {phaseData.gameId}</p>
            </div>
            <p style={{ marginTop: 6 }}>
              Your Team: {userTeam === 1 ? "Red" : userTeam === 2 ? "Blue" : "None"}
            </p>
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
            <h3 style={{ marginTop: 10 }}>Bet Panel</h3>
            <p style={{ margin: 0 }}>Red Bets: {liveRedBets}</p>
            <p style={{ margin: 0 }}>Blue Bets: {liveBlueBets}</p>
            <p style={{ margin: 0 }}>Tickets: {betAmount}</p>
            <input type="range" min="1" max="10" value={betAmount} onChange={e => setBetAmount(Number(e.target.value))} style={{ width: "100%" }} />
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
            <p style={{ marginTop: 4 }}>
              Viewing Board {liveReplayIndex + 1}/{boardHistory.length}
            </p>
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
              <p>
                Played at: {selectedRecord.timestamp ? new Date(selectedRecord.timestamp).toLocaleString() : "N/A"}
              </p>
              <p>Winner: {selectedRecord.winner}</p>
              <p>
                Team Red: {selectedRecord.teamRedCount} | Team Blue: {selectedRecord.teamBlueCount}
              </p>
              {selectedRecord.thumbnail && (
                <img src={selectedRecord.thumbnail} alt={`Game #${selectedRecord.gameId}`} style={{ width: 150, height: 150, objectFit: "cover" }} />
              )}
              <div style={{ marginTop: 6 }}>
                <button className="auto-replay-btn" onClick={recordToggleAutoReplay}>
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
  
      {/* Whole Skins Overlay */}
      {showWholeSkins && (
        <WholeSkinsPanel
          onSelectSkin={skinId => {
            alert(`Selected skin #${skinId}`);
            setShowWholeSkins(false);
          }}
          onClose={() => setShowWholeSkins(false)}
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

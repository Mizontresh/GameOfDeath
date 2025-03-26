// src/App.js
import React, { useEffect, useState, useRef } from "react";
import "./App.css";
import { io } from "socket.io-client";
import { ethers } from "ethers";

// Minimal ABI for GameOfDeath – note that joinTeam now requires a gameId.
const gameABI = [
  "function joinTeam(uint256 gameId, uint8 teamId) external",
  "function placeSquare(uint256 x, uint256 y) external",
  "function getTeam(uint256 gameId, address user) external view returns (uint8)",
  "function teamACount() external view returns (uint256)",
  "function teamBCount() external view returns (uint256)",
  "function currentPhase() external view returns (uint8)",
  "function getTeamCounts(uint256 gameId) external view returns (uint256 redCount, uint256 blueCount)"
];

// Minimal ABI for Betting contract
const bettingABI = [
  "function placeBet(uint256 gameId, uint8 team, uint256 tickets) external",
  "function getBets(uint256 gameId) external view returns (tuple(address user, uint8 team, uint256 tickets)[])"
];

// Minimal ABI for Mizons token
const mizonsABI = [
  "function balanceOf(address owner) external view returns (uint256)"
];

const contractAddress = process.env.REACT_APP_GAMEOFDEATH_ADDRESS;
const bettingAddress = process.env.REACT_APP_BETTING_ADDRESS;
const mizonsAddress = process.env.REACT_APP_MIZONS_ADDRESS;
const backendUrl = process.env.REACT_APP_BACKEND_URL || "http://localhost:3000";

function App() {
  // Board & replay states
  const [liveBoard, setLiveBoard] = useState(Array(4096).fill({ value: 0, skin: null }));
  const [boardHistory, setBoardHistory] = useState([]);
  const [liveReplayIndex, setLiveReplayIndex] = useState(-1);
  const [liveAutoReplay, setLiveAutoReplay] = useState(false);

  // Basic states
  const [userAddress, setUserAddress] = useState("");
  const [gameContract, setGameContract] = useState(null);
  const [teamCounts, setTeamCounts] = useState({ red: 0, blue: 0 });
  const [userTeam, setUserTeam] = useState(0);
  // phaseData includes phase, timeLeft, gameId
  const [phaseData, setPhaseData] = useState({ phase: "picking", timeLeft: 30, gameId: 1 });
  const [status, setStatus] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [betAmount, setBetAmount] = useState(1);
  const [winnerOverlay, setWinnerOverlay] = useState(null);

  // Records
  const [allRecords, setAllRecords] = useState([]);
  const [myRecords, setMyRecords] = useState([]);
  const [showMyGames, setShowMyGames] = useState(false);

  // Betting
  const [bettingContract, setBettingContract] = useState(null);
  const [liveRedBets, setLiveRedBets] = useState(0);
  const [liveBlueBets, setLiveBlueBets] = useState(0);

  // Mizons Balance
  const [mizonsBalance, setMizonsBalance] = useState("0");

  const socketRef = useRef(null);

  // Socket.io connection
  useEffect(() => {
    socketRef.current = io(backendUrl, { transports: ["websocket"] });
    socketRef.current.on("connect", () => {
      console.log("Socket connected:", socketRef.current.id);
    });
    socketRef.current.on("phaseUpdated", (data) => {
      console.log("phaseUpdated event:", data);
      setPhaseData(data);
    });
    socketRef.current.on("TeamJoined", (data) => {
      if (data.gameId === phaseData.gameId) {
        setTeamCounts(prev => {
          if (data.team === 1) return { ...prev, red: prev.red + 1 };
          if (data.team === 2) return { ...prev, blue: prev.blue + 1 };
          return prev;
        });
      }
    });
    socketRef.current.on("boardUpdated", (augmentedBoard) => {
      if (liveReplayIndex < 0) {
        setLiveBoard(augmentedBoard);
      }
    });
    socketRef.current.on("winner", ({ winner }) => {
      setWinnerOverlay(winner);
      setTimeout(() => setWinnerOverlay(null), 3000);
    });
    socketRef.current.on("newGameRecord", (record) => {
      console.log("Received newGameRecord:", record);
      fetchAllGames();
      if (userAddress &&
          record.players.map(p => p.toLowerCase()).includes(userAddress.toLowerCase())) {
        fetchMyGames(userAddress);
      }
    });
    socketRef.current.on("disconnect", () => {
      console.log("Socket disconnected");
    });
    return () => {
      socketRef.current.disconnect();
    };
  }, [backendUrl, liveReplayIndex, phaseData.gameId, userAddress]);

  // Poll phase state every 2 seconds
  useEffect(() => {
    async function fetchPhaseState() {
      try {
        const res = await fetch(`${backendUrl}/api/state`);
        const data = await res.json();
        setPhaseData(data);
      } catch (err) {
        console.error("Error fetching state:", err);
      }
    }
    fetchPhaseState();
    const interval = setInterval(fetchPhaseState, 2000);
    return () => clearInterval(interval);
  }, []);

  // Setup contracts
  useEffect(() => {
    if (!window.ethereum || !contractAddress) return;
    async function setupContracts() {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const gameC = new ethers.Contract(contractAddress, gameABI, signer);
        setGameContract(gameC);
        const bettingC = new ethers.Contract(bettingAddress, bettingABI, signer);
        setBettingContract(bettingC);
      } catch (err) {
        console.error("Error setting up contracts:", err);
      }
    }
    setupContracts();
  }, [contractAddress, bettingAddress]);

  // Poll bets every 5 seconds
  useEffect(() => {
    if (!phaseData.gameId) return;
    async function fetchBets() {
      try {
        const res = await fetch(`${backendUrl}/api/bets/${phaseData.gameId}`);
        const data = await res.json();
        if (data && data.bets) {
          const red = data.bets.filter(b => b.team === 1)
            .reduce((sum, b) => sum + Number(b.tickets), 0);
          const blue = data.bets.filter(b => b.team === 2)
            .reduce((sum, b) => sum + Number(b.tickets), 0);
          setLiveRedBets(red);
          setLiveBlueBets(blue);
        }
      } catch (err) {
        console.error("fetchBets error:", err);
      }
    }
    fetchBets();
    const interval = setInterval(fetchBets, 5000);
    return () => clearInterval(interval);
  }, [phaseData.gameId]);

  // Poll board history every 2 seconds
  useEffect(() => {
    async function loadHistory() {
      try {
        const res = await fetch(`${backendUrl}/api/history`);
        const data = await res.json();
        setBoardHistory(data.boardHistory || []);
      } catch (err) {
        console.error("loadHistory error:", err);
      }
    }
    loadHistory();
    const interval = setInterval(loadHistory, 2000);
    return () => clearInterval(interval);
  }, [backendUrl]);

  // When in placing phase, poll live board every second
  useEffect(() => {
    if (liveReplayIndex >= 0 || phaseData.phase !== "placing") return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${backendUrl}/api/board`);
        const data = await res.json();
        if (data && data.board) {
          setLiveBoard(data.board);
        }
      } catch (err) {
        console.error("Error polling board:", err);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [liveReplayIndex, phaseData.phase, backendUrl]);

  // Live auto replay
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

  // Poll team info every second
  useEffect(() => {
    if (!gameContract || liveReplayIndex >= 0) return;
    async function fetchTeamInfo() {
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
    }
    fetchTeamInfo();
    const interval = setInterval(fetchTeamInfo, 1000);
    return () => clearInterval(interval);
  }, [gameContract, liveReplayIndex, userAddress, phaseData.gameId]);

  // Poll Mizons balance every 5 seconds
  useEffect(() => {
    if (!window.ethereum || !mizonsAddress || !userAddress) return;
    const provider = new ethers.BrowserProvider(window.ethereum);
    const mizonsContract = new ethers.Contract(mizonsAddress, mizonsABI, provider);
    async function fetchMizonsBalance() {
      try {
        const bal = await mizonsContract.balanceOf(userAddress);
        setMizonsBalance(bal.toString());
      } catch (err) {
        console.error("Error fetching MIZ balance:", err);
      }
    }
    fetchMizonsBalance();
    const interval = setInterval(fetchMizonsBalance, 5000);
    return () => clearInterval(interval);
  }, [mizonsAddress, userAddress]);

  // Setup game contract (if not already set)
  useEffect(() => {
    if (!window.ethereum || !contractAddress) return;
    async function setupContract() {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const contract = new ethers.Contract(contractAddress, gameABI, signer);
        setGameContract(contract);
      } catch (err) {
        console.error("setupContract error:", err);
      }
    }
    setupContract();
  }, [contractAddress]);

  async function fetchAllGames() {
    try {
      const res = await fetch(`${backendUrl}/api/allRecords`);
      const data = await res.json();
      if (data && data.records) setAllRecords(data.records);
    } catch (err) {
      console.error("Error fetching all records:", err);
    }
  }
  useEffect(() => {
    fetchAllGames();
    const interval = setInterval(fetchAllGames, 5000);
    return () => clearInterval(interval);
  }, [backendUrl]);

  async function fetchMyGames(address) {
    if (!address) return;
    try {
      const res = await fetch(`${backendUrl}/api/records/${address}`);
      const data = await res.json();
      if (data && data.records) setMyRecords(data.records);
    } catch (err) {
      console.error("Error fetching my records:", err);
    }
  }
  useEffect(() => {
    if (userAddress) fetchMyGames(userAddress);
  }, [userAddress]);

  // Connect wallet
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
      fetchMyGames(addr);
    } catch (err) {
      setErrorMsg("Connect error: " + err.message);
    }
  }
  function disconnectWallet() {
    setUserAddress("");
    setGameContract(null);
    setStatus("");
    setErrorMsg("");
    setAllRecords([]);
    setMyRecords([]);
  }

  // joinTeam: allowed only in picking phase.
  async function joinTeam(teamId) {
    console.log("Attempting to join team. Phase:", phaseData.phase, "Game ID:", phaseData.gameId);
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
      setErrorMsg("placeSquare error: " + err.message);
    }
  }

  async function placeBet(teamId) {
    if (phaseData.phase !== "picking") {
      setErrorMsg("Betting is only allowed during picking phase.");
      return;
    }
    if (!bettingContract || !phaseData.gameId) {
      setErrorMsg("Betting contract or game ID not available.");
      return;
    }
    try {
      setStatus(`Betting ${betAmount} on ${teamId === 1 ? "Red" : "Blue"}...`);
      const tx = await bettingContract.placeBet(phaseData.gameId, teamId, betAmount);
      await tx.wait();
      setStatus(`Bet placed on ${teamId === 1 ? "Red" : "Blue"}!`);
      setErrorMsg("");
    } catch (err) {
      setErrorMsg("Bet failed: " + err.message);
    }
  }

  function livePrevBoard() {
    if (boardHistory.length === 0) return;
    setLiveReplayIndex(prev => (prev < 0 ? boardHistory.length - 1 : Math.max(0, prev - 1)));
  }
  function liveNextBoard() {
    if (boardHistory.length === 0) return;
    setLiveReplayIndex(prev => (prev < 0 ? 0 : Math.min(boardHistory.length - 1, prev + 1)));
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

  let displayedBoard = liveBoard;
  if (liveReplayIndex >= 0 && liveReplayIndex < boardHistory.length) {
    displayedBoard = boardHistory[liveReplayIndex].map(val => ({ value: val, skin: null }));
  }

  function computeOpposingStats(board) {
    let redOnBlue = 0, blueOnRed = 0;
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const idx = y * 64 + x;
        const cell = board[idx].value;
        if (cell === 1 && y >= 32) redOnBlue++;
        if (cell === 2 && y < 32) blueOnRed++;
      }
    }
    return { redOnBlue, blueOnRed };
  }
  const { redOnBlue, blueOnRed } = computeOpposingStats(displayedBoard);
  const totalOpposing = redOnBlue + blueOnRed;
  const redPercent = totalOpposing > 0 ? (redOnBlue / totalOpposing) * 100 : 0;
  const bluePercent = totalOpposing > 0 ? (blueOnRed / totalOpposing) * 100 : 0;

  function selectRecord(rec) {
    if (rec.boardHistory && rec.boardHistory.length > 0) {
      // Here we simply update the replay history for the selected record.
      // (If you need to reset additional state, add it here.)
      // We use rec.boardHistory from the backend.
      setPhaseData(prev => ({ ...prev })); // dummy update if needed
    }
  }

  const shouldShowWinner = winnerOverlay && liveReplayIndex < 0;

  return (
    <div className="app-container">
      {shouldShowWinner && (
        <div className="winner-overlay">
          <h1 className={`winner-text ${winnerOverlay.toLowerCase()}`}>
            {winnerOverlay} TEAM WON!
          </h1>
        </div>
      )}
      <div className="title-bar">
        <h1 className="game-title">GAME OF DEATH</h1>
        <p className="phase-time-text">{status}</p>
      </div>
      <div className="scoreboard-bar-container">
        <div className="score-bar">
          <div className="score-bar-red" style={{ width: `${redPercent}%` }} />
          <div className="score-bar-blue" style={{ width: `${bluePercent}%` }} />
        </div>
      </div>
      <div className="wallet-corner">
        {userAddress ? (
          <>
            <p className="tiny-wallet">
              {userAddress.slice(0, 6)}...{userAddress.slice(-4)}
            </p>
            <button className="corner-btn" onClick={disconnectWallet}>
              Disconnect
            </button>
          </>
        ) : (
          <button className="corner-btn" onClick={connectWallet}>
            Connect Wallet
          </button>
        )}
      </div>
      <div className="main-content">
        {/* Left Panel: Game Records */}
        <div className="left-panel permanent-records-panel">
          <h2 className="neon-heading">Game Records</h2>
          <div className="record-buttons">
            <button className={`neon-btn red-btn ${!showMyGames ? "active" : ""}`}
              onClick={() => setShowMyGames(false)}>
              All Games
            </button>
            <button className={`neon-btn blue-btn ${showMyGames ? "active" : ""}`}
              onClick={() => setShowMyGames(true)}
              disabled={!userAddress}>
              My Games
            </button>
          </div>
          <div className="records-list-container">
            {(!showMyGames ? allRecords : myRecords).length === 0 ? (
              <p>No records found.</p>
            ) : (
              <ul className="game-records-list">
                {(!showMyGames ? allRecords : myRecords).map((rec, index) => {
                  const dateString = rec.timestamp ? new Date(rec.timestamp).toLocaleString() : "N/A";
                  return (
                    <li key={`${rec.gameId}-${index}`} onClick={() => selectRecord(rec)} className="game-record-item">
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
          </div>
        </div>
        {/* Center Board */}
        <div className="center-board">
          <div className="board-container">
            <div className="board-border">
              <div className="board-grid">
                {displayedBoard.map((cell, i) => {
                  const x = i % 64;
                  const y = Math.floor(i / 64);
                  let cls = "cell";
                  if (cell.value === 1) cls += " red";
                  if (cell.value === 2) cls += " blue";
                  if (phaseData.phase === "placing") {
                    if (userTeam === 1 && y >= 32) cls += " dim-cell";
                    if (userTeam === 2 && y < 32) cls += " dim-cell";
                  }
                  return (
                    <div key={i} className={cls} onClick={() => {
                      if (phaseData.phase !== "placing") return;
                      placeSquare(x, y);
                    }} />
                  );
                })}
              </div>
            </div>
          </div>
          <div className="replay-container">
            <button className="replay-btn" onClick={livePrevBoard}>←</button>
            <button className="replay-btn" onClick={liveGoToLive}>Live</button>
            <button className="replay-btn" onClick={liveNextBoard}>→</button>
            <button className="replay-btn" onClick={liveToggleAutoReplay}>
              {liveAutoReplay ? "Stop Replay" : "Auto Replay"}
            </button>
          </div>
          {liveReplayIndex < 0 ? (
            <p className="replay-info">Viewing Live Board</p>
          ) : (
            <p className="replay-info">
              Viewing Board {liveReplayIndex + 1}/{boardHistory.length}
            </p>
          )}
        </div>
        {/* Right Panel */}
        <div className="right-panel">
          <div className="phase-info-card">
            <p>Phase: {phaseData.phase}</p>
            <p>Time Left: {phaseData.timeLeft > 0 ? phaseData.timeLeft : 0}s</p>
            <p>Game ID: {phaseData.gameId}</p>
          </div>
          <p>Your Team: {userTeam === 1 ? "Red" : userTeam === 2 ? "Blue" : "None"}</p>
          <div className="join-team-buttons">
            <button className="join-red neon-btn red-btn" onClick={() => joinTeam(1)} disabled={phaseData.phase !== "picking"}>
              Join Red
            </button>
            <button className="join-blue neon-btn blue-btn" onClick={() => joinTeam(2)} disabled={phaseData.phase !== "picking"}>
              Join Blue
            </button>
          </div>
          <p>Team Red: {teamCounts.red}</p>
          <p>Team Blue: {teamCounts.blue}</p>
          <h2 className="neon-heading" style={{ marginTop: "20px" }}>Bet Panel</h2>
          <p>Red Bets: {liveRedBets}</p>
          <p>Blue Bets: {liveBlueBets}</p>
          <p>Tickets: {betAmount}</p>
          <input type="range" min="1" max="10" value={betAmount} onChange={(e) => setBetAmount(Number(e.target.value))} />
          <div className="bet-buttons">
            <button className="bet-red neon-btn red-btn" onClick={() => placeBet(1)} disabled={phaseData.phase !== "picking"}>
              Bet Red
            </button>
            <button className="bet-blue neon-btn blue-btn" onClick={() => placeBet(2)} disabled={phaseData.phase !== "picking"}>
              Bet Blue
            </button>
          </div>
          <h2 className="neon-heading" style={{ marginTop: "20px" }}>Your MIZ</h2>
          <p style={{ fontSize: "1.2rem", color: "#ccc" }}>{mizonsBalance}</p>
        </div>
      </div>
      {errorMsg && <div className="error-bar">{errorMsg}</div>}
    </div>
  );
}

export default App;

import React, { useEffect, useState, useRef } from "react";
import "./App.css";
import { io } from "socket.io-client";
import { ethers } from "ethers";

// Minimal ABIs (adjust if needed)
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
  "function getBets(uint256 gameId) external view returns (tuple(address user, uint8 team, uint256 tickets)[])"
];

const mizonsABI = [
  "function balanceOf(address owner) external view returns (uint256)"
];

// Environment constants
const contractAddress = process.env.REACT_APP_GAMEOFDEATH_ADDRESS;
const bettingAddress = process.env.REACT_APP_BETTING_ADDRESS;
const mizonsAddress = process.env.REACT_APP_MIZONS_ADDRESS;
const backendUrl = process.env.REACT_APP_BACKEND_URL || "http://localhost:3000";

function App() {
  // Basic states
  const [userAddress, setUserAddress] = useState("");
  const [gameContract, setGameContract] = useState(null);
  const [bettingContract, setBettingContract] = useState(null);
  const [mizonsBalance, setMizonsBalance] = useState("0");
  
  // Phase & game info
  const [phaseData, setPhaseData] = useState({ phase: "picking", timeLeft: 30, gameId: 1 });
  const [teamCounts, setTeamCounts] = useState({ red: 0, blue: 0 });
  const [userTeam, setUserTeam] = useState(0);
  const [status, setStatus] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  
  // Board states (live vs. replay)
  const [liveBoard, setLiveBoard] = useState(Array(4096).fill({ value: 0, skin: null }));
  const [boardHistory, setBoardHistory] = useState([]);
  const [liveReplayIndex, setLiveReplayIndex] = useState(-1);
  const [liveAutoReplay, setLiveAutoReplay] = useState(false);

  // Records
  const [allRecords, setAllRecords] = useState([]);
  const [myRecords, setMyRecords] = useState([]);
  const [showMyGames, setShowMyGames] = useState(false);

  // Selected record replay
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [selectedHistory, setSelectedHistory] = useState(null);
  const [selectedReplayIndex, setSelectedReplayIndex] = useState(-1);
  const [selectedAutoReplay, setSelectedAutoReplay] = useState(false);

  // Betting
  const [liveRedBets, setLiveRedBets] = useState(0);
  const [liveBlueBets, setLiveBlueBets] = useState(0);
  const [betAmount, setBetAmount] = useState(1);

  // Winner overlay
  const [winnerOverlay, setWinnerOverlay] = useState(null);

  const socketRef = useRef(null);

  // Helper function: format MIZ balance in scientific notation when needed
  function formatMizons(balance) {
    // Convert balance (a string) to a Number using ethers.formatUnits (assuming 18 decimals)
    const bal = Number(ethers.formatUnits(balance, 18));
    if (bal === 0) return "0";
    if (bal < 0.000001 || bal > 1000000) {
      return bal.toExponential(6); // e.g., 1.234567e-9 or 1.234567e+12
    }
    return bal.toFixed(6);
  }

  // Socket.io setup
  useEffect(() => {
    socketRef.current = io(backendUrl, { transports: ["websocket"] });
    socketRef.current.on("connect", () => {
      console.log("Socket connected:", socketRef.current.id);
    });
    socketRef.current.on("phaseUpdated", (data) => {
      console.log("phaseUpdated event:", data);
      setPhaseData(data);
    });
    socketRef.current.on("boardUpdated", (augmentedBoard) => {
      // Only update live board if we're not in a selected replay
      if (!selectedHistory && liveReplayIndex < 0) {
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
      if (
        userAddress &&
        record.players.map((p) => p.toLowerCase()).includes(userAddress.toLowerCase())
      ) {
        fetchMyGames(userAddress);
      }
    });
    socketRef.current.on("disconnect", () => {
      console.log("Socket disconnected");
    });
    return () => {
      socketRef.current.disconnect();
    };
  }, [backendUrl, userAddress, liveReplayIndex, selectedHistory]);

  // Poll phase state from backend every 2 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetch(`${backendUrl}/api/state`)
        .then((res) => res.json())
        .then((data) => {
          setPhaseData(data);
        })
        .catch((err) => console.error("Error fetching state:", err));
    }, 2000);
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
        const bettingC = new ethers.Contract(bettingAddress, bettingABI, signer);
        setGameContract(gameC);
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
          const red = data.bets
            .filter((b) => b.team === 1)
            .reduce((sum, b) => sum + Number(b.tickets), 0);
          const blue = data.bets
            .filter((b) => b.team === 2)
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
    const interval = setInterval(() => {
      fetch(`${backendUrl}/api/history`)
        .then((res) => res.json())
        .then((data) => {
          setBoardHistory(data.boardHistory || []);
        })
        .catch((err) => console.error("loadHistory error:", err));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // When in placing phase and not replaying, poll live board every 1 second
  useEffect(() => {
    if (phaseData.phase !== "placing") return;
    if (selectedHistory || liveReplayIndex >= 0) return;
    const interval = setInterval(() => {
      fetch(`${backendUrl}/api/board`)
        .then((res) => res.json())
        .then((data) => {
          if (data && data.board) {
            setLiveBoard(data.board);
          }
        })
        .catch((err) => console.error("Error polling board:", err));
    }, 1000);
    return () => clearInterval(interval);
  }, [phaseData.phase, selectedHistory, liveReplayIndex]);

  // Live auto replay
  useEffect(() => {
    if (!liveAutoReplay || boardHistory.length === 0) return;
    const autoInterval = setInterval(() => {
      setLiveReplayIndex((prev) => {
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

  // Selected record auto replay
  useEffect(() => {
    if (!selectedAutoReplay || !selectedHistory || selectedHistory.length === 0)
      return;
    const autoInterval = setInterval(() => {
      setSelectedReplayIndex((prev) => {
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

  // Poll team info every 1 second (if not in a record replay)
  useEffect(() => {
    if (!gameContract || selectedHistory || liveReplayIndex >= 0) return;
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

  // Poll MIZ balance every 5 seconds
  useEffect(() => {
    if (!window.ethereum || !mizonsAddress || !userAddress) return;
    const provider = new ethers.BrowserProvider(window.ethereum);
    const mizonsContract = new ethers.Contract(mizonsAddress, mizonsABI, provider);
    const interval = setInterval(() => {
      mizonsContract
        .balanceOf(userAddress)
        .then((bal) => setMizonsBalance(bal.toString()))
        .catch((err) => console.error("Error fetching MIZ balance:", err));
    }, 5000);
    return () => clearInterval(interval);
  }, [mizonsAddress, userAddress]);

  // Fetch all game records
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
  }, []);

  // Fetch my game records
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

  // Wallet connect
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
    setSelectedRecord(null);
    setSelectedHistory(null);
    setSelectedReplayIndex(-1);
  }

  // joinTeam
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

  // placeSquare
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

  // placeBet
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
      setStatus(`Betting ${betAmount} on ${teamId === 1 ? "Red" : "Blue"}...`);
      const tx = await bettingContract.placeBet(phaseData.gameId, teamId, betAmount);
      await tx.wait();
      setStatus(`Bet placed on ${teamId === 1 ? "Red" : "Blue"}!`);
      setErrorMsg("");
    } catch (err) {
      console.error("Bet failed:", err);
      setErrorMsg("Bet failed: " + err.message);
    }
  }

  // Live replay controls
  function livePrevBoard() {
    if (boardHistory.length === 0) return;
    setLiveReplayIndex((i) => (i < 0 ? boardHistory.length - 1 : Math.max(0, i - 1)));
  }
  function liveNextBoard() {
    if (boardHistory.length === 0) return;
    setLiveReplayIndex((i) => (i < 0 ? 0 : Math.min(boardHistory.length - 1, i + 1)));
  }
  function liveGoToLive() {
    setLiveAutoReplay(false);
    setLiveReplayIndex(-1);
  }
  function liveToggleAutoReplay() {
    if (boardHistory.length === 0) return;
    if (liveReplayIndex < 0) setLiveReplayIndex(0);
    setLiveAutoReplay((prev) => !prev);
  }

  // Selected record replay controls
  function recordPrevBoard() {
    if (!selectedHistory || selectedHistory.length === 0) return;
    setSelectedReplayIndex((i) => (i < 0 ? selectedHistory.length - 1 : Math.max(0, i - 1)));
  }
  function recordNextBoard() {
    if (!selectedHistory || selectedHistory.length === 0) return;
    setSelectedReplayIndex((i) => (i < 0 ? 0 : Math.min(selectedHistory.length - 1, i + 1)));
  }
  function recordToggleAutoReplay() {
    if (!selectedHistory || selectedHistory.length === 0) return;
    if (!selectedAutoReplay) setSelectedReplayIndex(0);
    setSelectedAutoReplay((prev) => !prev);
  }
  function recordGoBackToLive() {
    setSelectedRecord(null);
    setSelectedHistory(null);
    setSelectedReplayIndex(-1);
    setSelectedAutoReplay(false);
  }

  // Decide which board to display
  let displayedBoard = liveBoard;
  if (selectedHistory && selectedHistory.length > 0) {
    if (selectedReplayIndex >= 0 && selectedReplayIndex < selectedHistory.length) {
      displayedBoard = selectedHistory[selectedReplayIndex].map((val) => ({
        value: val,
        skin: null
      }));
    } else {
      displayedBoard = selectedHistory[selectedHistory.length - 1].map((val) => ({
        value: val,
        skin: null
      }));
    }
  } else if (liveReplayIndex >= 0 && liveReplayIndex < boardHistory.length) {
    displayedBoard = boardHistory[liveReplayIndex].map((val) => ({
      value: val,
      skin: null
    }));
  }

  // Scoreboard logic
  function computeOpposingStats(board) {
    let redOnBlue = 0,
      blueOnRed = 0;
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

  // Selecting a record from the left panel
  function selectRecord(rec) {
    setSelectedRecord(rec);
    if (rec.boardHistory && rec.boardHistory.length > 0) {
      setSelectedHistory(rec.boardHistory);
      setSelectedReplayIndex(0);
      setSelectedAutoReplay(false);
      setLiveReplayIndex(-1);
      setLiveAutoReplay(false);
    } else {
      setSelectedHistory(null);
      setSelectedReplayIndex(-1);
    }
  }

  const shouldShowWinner = winnerOverlay && !selectedHistory && liveReplayIndex < 0;

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
            <button
              className={`neon-btn red-btn ${!showMyGames ? "active" : ""}`}
              onClick={() => setShowMyGames(false)}
            >
              All Games
            </button>
            <button
              className={`neon-btn blue-btn ${showMyGames ? "active" : ""}`}
              onClick={() => setShowMyGames(true)}
              disabled={!userAddress}
            >
              My Games
            </button>
          </div>
          <div className="records-list-container">
            {(!showMyGames ? allRecords : myRecords).length === 0 ? (
              <p>No records found.</p>
            ) : (
              <ul className="game-records-list">
                {(!showMyGames ? allRecords : myRecords).map((rec, index) => {
                  const dateString = rec.timestamp
                    ? new Date(rec.timestamp).toLocaleString()
                    : "N/A";
                  return (
                    <li
                      key={`${rec.gameId}-${index}`}
                      onClick={() => selectRecord(rec)}
                      className="game-record-item"
                    >
                      {rec.thumbnail && (
                        <img
                          src={rec.thumbnail}
                          alt={`Game #${rec.gameId}`}
                          className="record-thumbnail"
                        />
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
          </div>
          {selectedRecord && selectedHistory && (
            <div className="selected-record-details">
              <h3>Game #{selectedRecord.gameId} Details</h3>
              <p>Winner: {selectedRecord.winner}</p>
              <p>
                Played at:{" "}
                {selectedRecord.timestamp
                  ? new Date(selectedRecord.timestamp).toLocaleString()
                  : "N/A"}
              </p>
              <p>
                Team Red: {selectedRecord.teamRedCount} | Team Blue:{" "}
                {selectedRecord.teamBlueCount}
              </p>
              {selectedRecord.thumbnail && (
                <img
                  src={selectedRecord.thumbnail}
                  alt={`Game #${selectedRecord.gameId}`}
                  className="searched-record-thumbnail"
                />
              )}
              <div className="record-auto-container">
                <button className="replay-btn" onClick={recordToggleAutoReplay}>
                  {selectedAutoReplay ? "Stop Auto Replay" : "Start Auto Replay"}
                </button>
              </div>
              <div className="replay-container">
                <button className="replay-btn" onClick={recordPrevBoard}>
                  ←
                </button>
                <button className="replay-btn" onClick={recordGoBackToLive}>
                  Exit
                </button>
                <button className="replay-btn" onClick={recordNextBoard}>
                  →
                </button>
              </div>
              {selectedReplayIndex < 0 ? (
                <p className="replay-info">Viewing final snapshot</p>
              ) : (
                <p className="replay-info">
                  Viewing Board {selectedReplayIndex + 1}/{selectedHistory.length}
                </p>
              )}
            </div>
          )}
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
                  // Dim cells during placing phase if user cannot place there
                  if (!selectedHistory && liveReplayIndex < 0 && phaseData.phase === "placing") {
                    if (userTeam === 1 && y >= 32) cls += " dim-cell";
                    if (userTeam === 2 && y < 32) cls += " dim-cell";
                  }
                  return (
                    <div
                      key={i}
                      className={cls}
                      onClick={() => {
                        if (selectedHistory) return;
                        if (phaseData.phase !== "placing") return;
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
              <button className="replay-btn" onClick={livePrevBoard}>
                ←
              </button>
              <button className="replay-btn" onClick={liveGoToLive}>
                Live
              </button>
              <button className="replay-btn" onClick={liveNextBoard}>
                →
              </button>
              <button className="replay-btn" onClick={liveToggleAutoReplay}>
                {liveAutoReplay ? "Stop Replay" : "Auto Replay"}
              </button>
            </div>
          )}
          {selectedHistory ? null : liveReplayIndex < 0 ? (
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
            <button
              className="join-red neon-btn red-btn"
              onClick={() => joinTeam(1)}
              disabled={phaseData.phase !== "picking"}
            >
              Join Red
            </button>
            <button
              className="join-blue neon-btn blue-btn"
              onClick={() => joinTeam(2)}
              disabled={phaseData.phase !== "picking"}
            >
              Join Blue
            </button>
          </div>
          <p>Team Red: {teamCounts.red}</p>
          <p>Team Blue: {teamCounts.blue}</p>
          <h2 className="neon-heading" style={{ marginTop: "20px" }}>
            Bet Panel
          </h2>
          <p>Red Bets: {liveRedBets}</p>
          <p>Blue Bets: {liveBlueBets}</p>
          <p>Tickets: {betAmount}</p>
          <input
            type="range"
            min="1"
            max="10"
            value={betAmount}
            onChange={(e) => setBetAmount(Number(e.target.value))}
          />
          <div className="bet-buttons">
            <button
              className="bet-red neon-btn red-btn"
              onClick={() => placeBet(1)}
              disabled={phaseData.phase !== "picking"}
            >
              Bet Red
            </button>
            <button
              className="bet-blue neon-btn blue-btn"
              onClick={() => placeBet(2)}
              disabled={phaseData.phase !== "picking"}
            >
              Bet Blue
            </button>
          </div>
          <h2 className="neon-heading" style={{ marginTop: "20px" }}>
            Your MIZ
          </h2>
          <p style={{ fontSize: "1.2rem", color: "#ccc" }}>
            {formatMizons(mizonsBalance)} MIZ
          </p>
        </div>
      </div>

      {errorMsg && <div className="error-bar">{errorMsg}</div>}
    </div>
  );
}

export default App;

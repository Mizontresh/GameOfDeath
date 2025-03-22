import React, { useEffect, useState } from "react";
import "./App.css";
import { io } from "socket.io-client";
import { ethers } from "ethers";

const gameABI = [
  "function joinTeam(uint8) external",
  "function placeSquare(uint256, uint256) external",
  "function getTeam(address) external view returns (uint8)",
  "function teamACount() external view returns (uint256)",
  "function teamBCount() external view returns (uint256)"
];

const contractAddress = process.env.REACT_APP_GAMEOFDEATH_ADDRESS;
const backendUrl = process.env.REACT_APP_BACKEND_URL || "http://localhost:3000";

function App() {
  const [userAddress, setUserAddress] = useState("");
  const [gameContract, setGameContract] = useState(null);
  const [liveBoard, setLiveBoard] = useState(Array(4096).fill(0));
  const [teamCounts, setTeamCounts] = useState({ red: 0, blue: 0 });
  const [userTeam, setUserTeam] = useState(0);
  const [phaseData, setPhaseData] = useState({ phase: "picking", timeLeft: 90 });
  const [boardHistory, setBoardHistory] = useState([]);
  const [replayIndex, setReplayIndex] = useState(-1);
  const [autoReplay, setAutoReplay] = useState(false);
  const [status, setStatus] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [betAmount, setBetAmount] = useState(1);
  const [winnerOverlay, setWinnerOverlay] = useState(null);

  // Left panel states
  const [allRecords, setAllRecords] = useState([]);
  const [myRecords, setMyRecords] = useState([]);
  const [showMyGames, setShowMyGames] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);

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
  }

  useEffect(() => {
    const socket = io(backendUrl, { transports: ["websocket"] });
    socket.on("connect", () => console.log("Socket connected:", socket.id));
    socket.on("boardUpdated", (newBoard) => {
      if (replayIndex < 0) setLiveBoard(newBoard);
    });
    socket.on("phaseUpdated", (data) => setPhaseData(data));
    socket.on("winner", ({ winner }) => {
      setWinnerOverlay(winner);
      setTimeout(() => setWinnerOverlay(null), 3000);
    });
    socket.on("disconnect", () => console.log("Socket disconnected"));
    return () => socket.disconnect();
  }, [replayIndex]);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        if (replayIndex < 0) {
          const res = await fetch(`${backendUrl}/api/board`);
          const data = await res.json();
          if (data && data.board) setLiveBoard(data.board);
        }
      } catch (err) {
        console.error("Error polling board:", err);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [replayIndex]);

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
  }, []);

  useEffect(() => {
    let autoInterval;
    if (autoReplay && boardHistory.length > 0) {
      autoInterval = setInterval(() => {
        setReplayIndex((prev) => {
          if (prev < boardHistory.length - 1) return prev + 1;
          setAutoReplay(false);
          return prev;
        });
      }, 1000);
    }
    return () => clearInterval(autoInterval);
  }, [autoReplay, boardHistory]);

  useEffect(() => {
    if (!gameContract || replayIndex >= 0) return;
    async function fetchTeamInfo() {
      try {
        const [rC, bC] = await Promise.all([
          gameContract.teamACount(),
          gameContract.teamBCount()
        ]);
        setTeamCounts({ red: Number(rC), blue: Number(bC) });
        if (userAddress) {
          const tId = await gameContract.getTeam(userAddress);
          setUserTeam(Number(tId));
        }
      } catch (err) {
        console.error("fetchTeamInfo error:", err);
      }
    }
    fetchTeamInfo();
    const interval = setInterval(fetchTeamInfo, 1000);
    return () => clearInterval(interval);
  }, [gameContract, replayIndex, userAddress]);

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
  }, []);

  async function fetchAllGames() {
    try {
      const res = await fetch(`${backendUrl}/api/allRecords`);
      const data = await res.json();
      if (data && data.records) setAllRecords(data.records);
    } catch (err) {
      console.error("Error fetching all records:", err);
    }
  }

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
    fetchAllGames();
  }, []);

  useEffect(() => {
    if (userAddress) fetchMyGames(userAddress);
  }, [userAddress]);

  async function joinTeam(teamId) {
    if (!gameContract) {
      setErrorMsg("No contract connected.");
      return;
    }
    if (phaseData.phase !== "picking") {
      setErrorMsg("Cannot join outside picking phase!");
      return;
    }
    try {
      setStatus(`Joining ${teamId === 1 ? "Red" : "Blue"}...`);
      const tx = await gameContract.joinTeam(teamId);
      await tx.wait();
      setStatus("Joined!");
      setErrorMsg("");
    } catch (err) {
      setErrorMsg("joinTeam error: " + err.message);
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
      setStatus(`Placing square at (${x},${y})...`);
      const tx = await gameContract.placeSquare(x, y);
      await tx.wait();
      setStatus("Square placed!");
      setErrorMsg("");
    } catch (err) {
      setErrorMsg("placeSquare error: " + err.message);
    }
  }

  function prevBoard() {
    if (boardHistory.length > 0) {
      setReplayIndex((i) => (i < 0 ? boardHistory.length - 1 : Math.max(0, i - 1)));
    }
  }
  function nextBoard() {
    if (boardHistory.length > 0) {
      setReplayIndex((i) => (i < 0 ? 0 : Math.min(boardHistory.length - 1, i + 1)));
    }
  }
  function goToLive() {
    setAutoReplay(false);
    setReplayIndex(-1);
  }
  function toggleAutoReplay() {
    if (boardHistory.length > 0) {
      if (replayIndex < 0) setReplayIndex(0);
      setAutoReplay((prev) => !prev);
    }
  }

  let displayedBoard = liveBoard;
  if (replayIndex >= 0 && replayIndex < boardHistory.length) {
    displayedBoard = boardHistory[replayIndex];
  }

  function computeOpposingStats(board) {
    let redOnBlue = 0, blueOnRed = 0;
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const idx = y * 64 + x;
        const val = board[idx];
        if (val === 1 && y >= 32) redOnBlue++;
        if (val === 2 && y < 32) blueOnRed++;
      }
    }
    return { redOnBlue, blueOnRed };
  }
  const { redOnBlue, blueOnRed } = computeOpposingStats(displayedBoard);
  const sum = redOnBlue + blueOnRed;
  const redPercent = sum > 0 ? (redOnBlue / sum) * 100 : 0;
  const bluePercent = sum > 0 ? (blueOnRed / sum) * 100 : 0;

  const displayedRecords = showMyGames ? myRecords : allRecords;

  function selectRecord(rec) {
    setSelectedRecord(rec);
    if (rec.boardHistory && rec.boardHistory.length > 0) {
      setReplayIndex(rec.boardHistory.length - 1);
      setLiveBoard(rec.boardHistory[rec.boardHistory.length - 1]);
    }
  }

  return (
    <div className="app-container">
      {winnerOverlay && (
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
        {/* Permanent Left Panel */}
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
            {displayedRecords.length === 0 ? (
              <p>No records found.</p>
            ) : (
              <ul className="game-records-list">
                {displayedRecords.map((rec, index) => {
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
                        <p>{rec.winner} won at {dateString}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {selectedRecord && (
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
                Team Red: {selectedRecord.teamRedCount} | Team Blue: {selectedRecord.teamBlueCount}
              </p>
              {selectedRecord.thumbnail && (
                <img
                  src={selectedRecord.thumbnail}
                  alt={`Game #${selectedRecord.gameId}`}
                  className="searched-record-thumbnail"
                />
              )}
            </div>
          )}
        </div>

        {/* Center Board */}
        <div className="center-board">
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div className="board-container">
              <div className="board-border">
                <div className="board-grid">
                  {displayedBoard.map((val, i) => {
                    const x = i % 64;
                    const y = Math.floor(i / 64);
                    let cls = "cell";
                    if (val === 1) cls += " red";
                    if (val === 2) cls += " blue";
                    if (phaseData.phase === "placing" && replayIndex < 0) {
                      if (userTeam === 1 && y >= 32) cls += " dim-cell";
                      if (userTeam === 2 && y < 32) cls += " dim-cell";
                    }
                    return (
                      <div
                        key={i}
                        className={cls}
                        onClick={() => {
                          if (phaseData.phase !== "placing") return;
                          placeSquare(x, y);
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="replay-container">
              <button className="replay-btn" onClick={prevBoard}>←</button>
              <button className="replay-btn" onClick={goToLive}>Live</button>
              <button className="replay-btn" onClick={nextBoard}>→</button>
              <button className="replay-btn" onClick={toggleAutoReplay}>
                {autoReplay ? "Stop Replay" : "Auto Replay"}
              </button>
            </div>
            {replayIndex < 0 ? (
              <p className="replay-info">Viewing Live Board</p>
            ) : (
              <p className="replay-info">
                Viewing Board {replayIndex + 1}/{boardHistory.length}
              </p>
            )}
          </div>
        </div>

        {/* Right Panel */}
        <div className="right-panel">
          <div className="phase-info-card">
            <p>Phase: {phaseData.phase}</p>
            <p>Time Left: {phaseData.timeLeft > 0 ? phaseData.timeLeft : 0}s</p>
          </div>
          <p>Your Team: {userTeam === 1 ? "Red" : userTeam === 2 ? "Blue" : "None"}</p>
          <div className="join-team-buttons">
            <button className="join-red neon-btn red-btn" onClick={() => joinTeam(1)}>
              Join Red
            </button>
            <button className="join-blue neon-btn blue-btn" onClick={() => joinTeam(2)}>
              Join Blue
            </button>
          </div>
          <p>Team Red: {teamCounts.red}</p>
          <p>Team Blue: {teamCounts.blue}</p>
          <h2 className="neon-heading" style={{ marginTop: "20px" }}>
            Bet Panel
          </h2>
          <p>Tickets: {betAmount}</p>
          <input
            type="range"
            min="1"
            max="10"
            value={betAmount}
            onChange={(e) => setBetAmount(Number(e.target.value))}
          />
          <div className="bet-buttons">
            <button className="bet-red neon-btn red-btn">Bet Red</button>
            <button className="bet-blue neon-btn blue-btn">Bet Blue</button>
          </div>
        </div>
      </div>
      {errorMsg && <div className="error-bar">{errorMsg}</div>}
    </div>
  );
}

export default App;

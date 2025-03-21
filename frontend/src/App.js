import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import "./App.css";

const gameOfDeathABI = [
  "function joinTeam(uint8 teamId) external",
  "function getTeam(address user) external view returns (uint8)",
  "function teamACount() external view returns (uint256)",
  "function teamBCount() external view returns (uint256)",
  "function placeSquare(uint256 x, uint256 y) external",
  "function getBoard() external view returns (uint8[4096])"
];

const gameOfDeathAddress = process.env.REACT_APP_GAMEOFDEATH_ADDRESS;
const backendUrl = process.env.REACT_APP_BACKEND_URL;

function App() {
  const [errorMsg, setErrorMsg] = useState("");
  const [status, setStatus] = useState("");
  const [userAddress, setUserAddress] = useState("");
  const [gameContract, setGameContract] = useState(null);

  // Timer data from backend
  const [timerData, setTimerData] = useState({ phase: "", active: false, timeLeft: 0 });

  // 64×64 board
  const [board, setBoard] = useState(Array(4096).fill(0));
  // userTeam: 0=none,1=red,2=blue
  const [userTeam, setUserTeam] = useState(0);
  // Team counts
  const [teamCounts, setTeamCounts] = useState({ red: 0, blue: 0 });

  // Bet slider
  const [betAmount, setBetAmount] = useState(1);

  // --------------------------------------
  // 1) Connect / Disconnect Wallet
  // --------------------------------------
  async function connectWallet() {
    if (!window.ethereum) {
      setErrorMsg("MetaMask not detected.");
      return;
    }
    try {
      await window.ethereum.request({ method: "eth_requestAccounts" });
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();

      setUserAddress(address);
      setStatus("Wallet connected.");
      setErrorMsg("");

      const contract = new ethers.Contract(gameOfDeathAddress, gameOfDeathABI, signer);
      setGameContract(contract);
    } catch (err) {
      console.error(err);
      setErrorMsg("Error connecting wallet.");
    }
  }

  function disconnectWallet() {
    setUserAddress("");
    setGameContract(null);
    setStatus("");
    setErrorMsg("");
  }

  // --------------------------------------
  // 2) Timer from Backend
  // --------------------------------------
  useEffect(() => {
    async function fetchTimer() {
      try {
        const res = await fetch(`${backendUrl}/timer`);
        const data = await res.json();
        setTimerData(data);

        if (data.active) {
          setStatus(`Free phase: ${data.timeLeft} seconds left`);
        } else {
          setStatus(`Locked phase: ${data.timeLeft} seconds left`);
        }
      } catch (err) {
        console.error("Timer error:", err);
        setErrorMsg("Error fetching timer from backend.");
      }
    }
    fetchTimer();
    const interval = setInterval(fetchTimer, 1000);
    return () => clearInterval(interval);
  }, []);

  // --------------------------------------
  // 3) Board + Team Counts
  // --------------------------------------
  useEffect(() => {
    if (!gameContract) return;

    async function fetchBoardAndCounts() {
      try {
        const [boardArray, aCount, bCount] = await Promise.all([
          gameContract.getBoard(),
          gameContract.teamACount(),
          gameContract.teamBCount()
        ]);
        setBoard(boardArray.map(c => Number(c)));
        setTeamCounts({ red: Number(aCount), blue: Number(bCount) });
      } catch (err) {
        console.error("Fetch board/team error:", err);
      }
    }

    fetchBoardAndCounts();
    const interval = setInterval(fetchBoardAndCounts, 5000);
    return () => clearInterval(interval);
  }, [gameContract]);

  // --------------------------------------
  // 4) Fetch user’s team
  // --------------------------------------
  useEffect(() => {
    if (!gameContract || !userAddress) {
      setUserTeam(0);
      return;
    }
    (async () => {
      try {
        const tId = await gameContract.getTeam(userAddress);
        setUserTeam(Number(tId));
      } catch (err) {
        console.error("getTeam error:", err);
      }
    })();
  }, [gameContract, userAddress]);

  // --------------------------------------
  // 5) Join team
  // --------------------------------------
  async function joinTeam(teamId) {
    if (!gameContract || !userAddress) {
      setErrorMsg("Connect your wallet first!");
      return;
    }
    if (!timerData.active) {
      setErrorMsg("Cannot join or switch teams during locked phase!");
      return;
    }
    try {
      const teamName = teamId === 1 ? "Red" : "Blue";
      setStatus(`Joining team ${teamName}...`);
      setErrorMsg("");
      const tx = await gameContract.joinTeam(teamId);
      await tx.wait();
      setStatus(`Joined team ${teamName}!`);
      const newTeam = await gameContract.getTeam(userAddress);
      setUserTeam(Number(newTeam));
    } catch (err) {
      console.error("joinTeam error:", err);
      setErrorMsg(`Error: ${err.message}`);
    }
  }

  // --------------------------------------
  // 6) Place square
  // --------------------------------------
  async function placeSquare(x, y) {
    if (!gameContract || !userAddress) {
      setErrorMsg("No wallet connected.");
      return;
    }
    if (timerData.active) {
      setErrorMsg("Cannot place squares in free phase!");
      return;
    }
    const index = y * 64 + x;
    if (board[index] !== 0) {
      setErrorMsg("Cell already occupied!");
      return;
    }
    try {
      setStatus(`Placing square at (${x}, ${y})...`);
      setErrorMsg("");
      const tx = await gameContract.placeSquare(x, y);
      await tx.wait();
      setStatus(`Square placed at (${x}, ${y})!`);
    } catch (err) {
      console.error("placeSquare error:", err);
      setErrorMsg(`Error: ${err.message}`);
    }
  }

  function getTeamName(t) {
    if (t === 1) return "Red";
    if (t === 2) return "Blue";
    return "None";
  }

  // --------------------------------------
  // 7) Render board (centered)
  // --------------------------------------
  function renderBoard() {
    return (
      <div className="board-border">
        <div className="board-grid">
          {board.map((cellValue, i) => {
            const x = i % 64;
            const y = Math.floor(i / 64);

            let cellClass = "cell";
            if (cellValue === 1) cellClass += " red";
            if (cellValue === 2) cellClass += " blue";

            return (
              <div
                key={i}
                className={cellClass}
                onClick={() => placeSquare(x, y)}
              />
            );
          })}
        </div>
      </div>
    );
  }

  // --------------------------------------
  // 8) Layout
  // --------------------------------------
  return (
    <div className="app-container">
      {/* Top Title Bar */}
      <div className="title-bar">
        <h1 className="game-title">GAME OF DEATH</h1>
        <p className="phase-time-text">{status}</p>
      </div>

      {/* Corner wallet panel */}
      <div className="wallet-corner">
        {userAddress ? (
          <>
            <p className="tiny-wallet">
              {userAddress.length > 10
                ? userAddress.slice(0, 6) + "..." + userAddress.slice(-4)
                : userAddress}
            </p>
            <button className="corner-btn" onClick={disconnectWallet}>X</button>
          </>
        ) : (
          <button className="corner-btn" onClick={connectWallet}>Connect</button>
        )}
      </div>

      {/* If there's an error, show it */}
      {errorMsg && <div className="error-bar">{errorMsg}</div>}

      <div className="main-content">
        {/* Left Bet Panel */}
        <div className="left-panel">
          <h2>Bet Panel</h2>
          <p className="bet-instructions">Place a bet on Red or Blue</p>

          <div className="bet-slider-container">
            <label>Tickets: {betAmount}</label>
            <input
              type="range"
              min="1"
              max="10"
              value={betAmount}
              onChange={(e) => setBetAmount(Number(e.target.value))}
            />
          </div>

          <div className="bet-buttons">
            <button className="bet-red">Bet Red</button>
            <button className="bet-blue">Bet Blue</button>
          </div>
        </div>

        {/* Center: The Board (always centered) */}
        <div className="center-board">{renderBoard()}</div>

        {/* Right Info Panel: Phase/team stuff */}
        <div className="right-panel">
          <h3>Phase: {timerData.phase.toUpperCase()}</h3>
          <p>Time Left: {timerData.timeLeft}s</p>
          <p>Your Team: {getTeamName(userTeam)}</p>

          <div className="join-team-buttons">
            <button className="join-red" onClick={() => joinTeam(1)}>Join Red</button>
            <button className="join-blue" onClick={() => joinTeam(2)}>Join Blue</button>
          </div>

          <p>Team Red: {teamCounts.red} | Team Blue: {teamCounts.blue}</p>
        </div>
      </div>
    </div>
  );
}

export default App;

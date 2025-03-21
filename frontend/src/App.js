import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import "./App.css";

const contractABI = [
  "function incrementScore() public",
  "function getScore(address user) external view returns (uint256)",
  "event ScoreIncremented(address indexed user, uint256 newScore)"
];
const contractAddress = process.env.REACT_APP_CONTRACT_ADDRESS;
const backendUrl = process.env.REACT_APP_BACKEND_URL;

function App() {
  const [status, setStatus] = useState("Loading timer...");
  const [timerData, setTimerData] = useState({ active: false, timeLeft: 0, phase: "" });
  const [score, setScore] = useState(0);
  const [contract, setContract] = useState(null);
  const [userAddress, setUserAddress] = useState("");

  // Initialize MetaMask connection and contract instance.
  useEffect(() => {
    async function init() {
      if (!window.ethereum) {
        setStatus("MetaMask not detected");
        return;
      }
      try {
        await window.ethereum.request({ method: "eth_requestAccounts" });
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const address = await signer.getAddress();
        setUserAddress(address);
        const _contract = new ethers.Contract(contractAddress, contractABI, signer);
        setContract(_contract);
        setStatus("Connected to MetaMask. Polling timer...");
      } catch (err) {
        console.error(err);
        setStatus("Error connecting to MetaMask");
      }
    }
    init();
  }, []);

  // Poll the backend for timer state every second.
  useEffect(() => {
    async function fetchTimer() {
      try {
        const res = await fetch(`${backendUrl}/timer`);
        const data = await res.json(); // { active, timeLeft, phase }
        setTimerData(data);
        setStatus(data.active ? `Active: ${data.timeLeft} sec left` : `Inactive: ${data.timeLeft} sec left`);
      } catch (err) {
        console.error(err);
        setStatus("Error fetching timer from backend");
      }
    }
    fetchTimer();
    const intervalId = setInterval(fetchTimer, 1000);
    return () => clearInterval(intervalId);
  }, []);

  // Poll the backend for the user's score every 5 seconds.
  useEffect(() => {
    async function fetchScore() {
      if (!userAddress) return;
      try {
        const res = await fetch(`${backendUrl}/get-score?address=${userAddress}`);
        const data = await res.json();
        setScore(data.score);
      } catch (err) {
        console.error(err);
      }
    }
    fetchScore();
    const intervalId = setInterval(fetchScore, 5000);
    return () => clearInterval(intervalId);
  }, [userAddress]);

  // Handle button press: call the contract's incrementScore.
  async function handleIncrementScore() {
    if (!contract) return;
    try {
      setStatus("Sending transaction...");
      const tx = await contract.incrementScore();
      setStatus("Transaction sent. Waiting for confirmation...");
      await tx.wait();
      setStatus("Score incremented!");
    } catch (err) {
      console.error(err);
      setStatus(err.code === 4001 ? "Transaction rejected by user." : "Error: " + err.message);
    }
  }

  return (
    <div className="App">
      <h1>Game of Death</h1>
      <p>{status}</p>
      <p>Phase: {timerData.phase}</p>
      <p>Your score: {score}</p>
      <button onClick={handleIncrementScore} disabled={!timerData.active}>
        Press Button (Increment Score)
      </button>
      <p>Time left in current phase: {timerData.timeLeft} seconds</p>
    </div>
  );
}

export default App;

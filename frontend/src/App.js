import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import "./App.css";

const contractABI = [
  "function joinTeam(uint8 teamId) public",
  "function getTeam(address user) external view returns (uint256)"
];
const contractAddress = process.env.REACT_APP_CONTRACT_ADDRESS;
const backendUrl = process.env.REACT_APP_BACKEND_URL;

function App() {
  const [status, setStatus] = useState("Loading timer...");
  const [timerData, setTimerData] = useState({ active: false, timeLeft: 0, phase: "" });
  const [team, setTeam] = useState("0"); // 0 = not assigned, 1 = Team A, 2 = Team B
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
        const data = await res.json();
        setTimerData(data);
        setStatus(
          data.active
            ? `Free to switch teams: ${data.timeLeft} sec left`
            : `Lock phase: ${data.timeLeft} sec left`
        );
      } catch (err) {
        console.error(err);
        setStatus("Error fetching timer from backend");
      }
    }
    fetchTimer();
    const intervalId = setInterval(fetchTimer, 1000);
    return () => clearInterval(intervalId);
  }, []);

  // Poll for user's team every 5 seconds.
  useEffect(() => {
    async function fetchTeam() {
      if (!userAddress) return;
      try {
        const res = await fetch(`${backendUrl}/get-team?address=${userAddress}`);
        const data = await res.json();
        setTeam(data.team);
      } catch (err) {
        console.error(err);
      }
    }
    fetchTeam();
    const intervalId = setInterval(fetchTeam, 5000);
    return () => clearInterval(intervalId);
  }, [userAddress]);

  // Handle team change: allow user to choose between team 1 and 2.
  async function handleJoinTeam(teamId) {
    if (!contract) return;
    try {
      setStatus(`Joining Team ${teamId}...`);
      const tx = await contract.joinTeam(teamId);
      setStatus("Transaction sent. Waiting for confirmation...");
      await tx.wait();
      setStatus(`Joined Team ${teamId}!`);
    } catch (err) {
      console.error(err);
      setStatus(err.code === 4001 ? "Transaction rejected by user." : "Error: " + err.message);
    }
  }

  return (
    <div className="App">
      <h1>Game of Death</h1>
      <p>{status}</p>
      <p>Current phase: {timerData.phase} ({timerData.active ? "Free to switch teams" : "Locked"})</p>
      <p>Time left in current phase: {timerData.timeLeft} seconds</p>
      <p>Your current team: {team === "0" ? "None" : (team === "1" ? "Team A" : "Team B")}</p>
      {timerData.active ? (
        <div>
          <button onClick={() => handleJoinTeam(1)}>Join Team A</button>
          <button onClick={() => handleJoinTeam(2)}>Join Team B</button>
        </div>
      ) : (
        <p>Team switching is locked.</p>
      )}
    </div>
  );
}

export default App;

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
  const [status, setStatus] = useState("Initializing...");
  const [timerData, setTimerData] = useState({ phase: "", active: false, timeLeft: 0 });
  const [team, setTeam] = useState("0"); // 0 = none, 1 = Team A, 2 = Team B
  const [score, setScore] = useState(0);
  const [contract, setContract] = useState(null);
  const [userAddress, setUserAddress] = useState("");

  // Initialize MetaMask connection, signer, and contract instance.
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
        const data = await res.json(); // { phase, active, timeLeft }
        setTimerData(data);
        setStatus(
          data.active
            ? `Free to switch teams (${data.phase} phase): ${data.timeLeft} sec left`
            : `Locked (${data.phase} phase): ${data.timeLeft} sec left`
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

  // Poll the backend for user's team and score every 5 seconds.
  useEffect(() => {
    async function fetchData() {
      if (!userAddress) return;
      try {
        const resTeam = await fetch(`${backendUrl}/get-team?address=${userAddress}`);
        const teamData = await resTeam.json();
        setTeam(teamData.team);
      } catch (err) {
        console.error("Error fetching team:", err);
      }
      try {
        const resScore = await fetch(`${backendUrl}/get-score?address=${userAddress}`);
        const scoreData = await resScore.json();
        setScore(scoreData.score);
      } catch (err) {
        console.error("Error fetching score:", err);
      }
    }
    fetchData();
    const intervalId = setInterval(fetchData, 5000);
    return () => clearInterval(intervalId);
  }, [userAddress]);

  // Additionally, poll for team counts every 5 seconds.
  const [teamCounts, setTeamCounts] = useState({ teamA: "0", teamB: "0" });
  useEffect(() => {
    async function fetchTeamCounts() {
      try {
        const res = await fetch(`${backendUrl}/team-counts`);
        const data = await res.json();
        setTeamCounts(data);
      } catch (err) {
        console.error("Error fetching team counts:", err);
      }
    }
    fetchTeamCounts();
    const intervalId = setInterval(fetchTeamCounts, 5000);
    return () => clearInterval(intervalId);
  }, []);

  // Handle team switch button press.
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
      <p>Phase: {timerData.phase}</p>
      <p>Time left in current phase: {timerData.timeLeft} seconds</p>
      <p>Your current team: {team === "0" ? "None" : team === "1" ? "Team A" : "Team B"}</p>
      <p>Team Counts - Team A: {teamCounts.teamA} | Team B: {teamCounts.teamB}</p>
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

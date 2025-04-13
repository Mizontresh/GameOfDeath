// App.js
import React, { useState, useEffect, useCallback, useRef } from "react";
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
  "function tokenAwardedItem(uint256 tokenId) external view returns (uint256)",
  "function balanceOf(address owner) external view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256)",
  "function safeTransferFrom(address from, address to, uint256 tokenId, bytes data) external"
];
const skinLockABI = [
  "function getLockedSkins(address owner) external view returns (tuple(uint256 tokenId, uint256 bakedId)[])",
  "function lockedTokens(uint256 tokenId) external view returns (address)",
  "function unlockNFT(uint256 tokenId) external"
];

// -------------------- Environment Constants --------------------
const gameAddress = process.env.REACT_APP_GAMEOFDEATH_ADDRESS;
const bettingAddress = process.env.REACT_APP_BETTING_ADDRESS;
const mizonsAddress = process.env.REACT_APP_MIZONS_ADDRESS;
const chestMinterAddress = process.env.REACT_APP_CHEST_MINTER_ADDRESS;
const chestOpenerAddress = process.env.REACT_APP_CHEST_OPENER_ADDRESS;
const skinLockAddress = process.env.REACT_APP_SKIN_LOCK_ADDRESS;
const backendUrl = process.env.REACT_APP_BACKEND_URL || "http://localhost:3000";

// -------------------- Utility Functions --------------------
function toGatewayUrl(url) {
  if (!url) return "";
  if (url.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${url.slice(7)}`;
  }
  return url;
}

function convertToAugmentedBoard(numericalBoard) {
  return numericalBoard.map((val) => ({ value: val, skin: null }));
}

function formatMizons(balance) {
  const bal = Number(ethers.formatUnits(balance, 18));
  if (bal === 0) return "0";
  if (bal < 0.000001 || bal > 1_000_000) return bal.toExponential(6);
  return bal.toFixed(6);
}

// -------------------- Inventory Component --------------------
function Inventory({ inventory, backendUrl, onOpenChest }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      gap: "4px",
      justifyItems: "center"
    }}>
      {inventory.length === 0 ? (
        <p>No chests found.</p>
      ) : (
        inventory.map((chest) => (
          <div
            key={chest.tokenId}
            style={{ textAlign: "center", cursor: "pointer" }}
            onClick={() => onOpenChest(chest.tokenId)}
          >
            <img
              src={`${backendUrl}/chests/icons/chest${chest.type}/frame1.png`}
              alt={`Chest Type ${chest.type}`}
              style={{ width: "35px", height: "auto" }}
            />
          </div>
        ))
      )}
    </div>
  );
}

// -------------------- RecordsList Component --------------------
function RecordsList({ backendUrl, showMyGames, userAddress, onSelectRecord, refreshKey }) {
  const [records, setRecords] = useState([]);
  const [skip, setSkip] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const limit = 10;

  async function fetchRecords() {
    if (loading) return;
    setLoading(true);
    try {
      const endpoint =
        showMyGames && userAddress
          ? `${backendUrl}/api/records/${userAddress}?skip=${skip}&limit=${limit}`
          : `${backendUrl}/api/allRecords?skip=${skip}&limit=${limit}`;
      const res = await fetch(endpoint);
      const data = await res.json();
      setRecords((prev) => [...prev, ...data.records]);
      setSkip(skip + limit);
      if (data.records.length < limit) setHasMore(false);
    } catch (err) {
      console.error("Error fetching records:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async function refreshRecords() {
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
      } catch (err) {
        console.error("Error refreshing records:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [showMyGames, refreshKey, userAddress, backendUrl]);

  return (
    <div className="records-list-container">
      {records.length === 0 && !loading ? (
        <p>No records found.</p>
      ) : (
        <ul className="game-records-list">
          {records.map((rec, index) => {
            const dateString = rec.timestamp
              ? new Date(rec.timestamp).toLocaleString()
              : "N/A";
            return (
              <li
                key={`${rec.gameId}-${index}`}
                className="game-record-item"
                onClick={() => onSelectRecord(rec)}
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

// -------------------- LockedSkinSlots Component --------------------
function LockedSkinSlots({ userAddress, skinLockContract, backendUrl, refreshLockedSkins }) {
  const [lockedSkins, setLockedSkins] = useState([]);
  const [selectedLockedSkin, setSelectedLockedSkin] = useState(null);
  const MAX_SLOTS = 3;

  const fetchLockedSkins = useCallback(async () => {
    if (!skinLockContract || !userAddress) return;
    try {
      const result = await skinLockContract.getLockedSkins(userAddress);
      const parsed = result.map((item) => ({
        tokenId: Number(item.tokenId),
        bakedId: Number(item.bakedId),
      }));
      setLockedSkins(parsed.slice(0, MAX_SLOTS));
    } catch (err) {
      console.error("Error fetching locked skins:", err);
    }
  }, [skinLockContract, userAddress]);

  useEffect(() => {
    fetchLockedSkins();
    const interval = setInterval(fetchLockedSkins, 5000);
    return () => clearInterval(interval);
  }, [fetchLockedSkins]);

  const handleSlotClick = (item) => {
    if (item) setSelectedLockedSkin(item);
  };

  const confirmUnlock = async () => {
    if (!selectedLockedSkin) return;
    try {
      const { tokenId, bakedId } = selectedLockedSkin;
      const tx = await skinLockContract.unlockNFT(tokenId);
      await tx.wait();
      alert(`Unlocked skin: tokenId ${tokenId} (bakedId ${bakedId})!`);
      fetchLockedSkins();
      if (refreshLockedSkins) refreshLockedSkins();
    } catch (err) {
      console.error("Error unlocking skin:", err);
      alert("Error unlocking skin: " + err.message);
    } finally {
      setSelectedLockedSkin(null);
    }
  };

  const handleCloseUnlockModal = () => setSelectedLockedSkin(null);

  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
        {Array.from({ length: MAX_SLOTS }, (_, i) => {
          const item = lockedSkins[i];
          return (
            <div
              key={i}
              style={{
                width: "50px",
                height: "50px",
                border: "1px solid #ff00e2",
                borderRadius: "4px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: item ? "pointer" : "default",
                background: item ? "#222" : "transparent",
              }}
              onClick={() => handleSlotClick(item)}
              title={item ? `Locked Skin #${item.bakedId}` : "Empty slot"}
            >
              {item ? (
                <img
                  src={`${backendUrl}/skins/icons/${item.bakedId}.png`}
                  alt={`Locked Skin #${item.bakedId}`}
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                />
              ) : (
                <span style={{ color: "#ff00e2", fontSize: "0.8rem" }}>Empty</span>
              )}
            </div>
          );
        })}
      </div>
      {selectedLockedSkin && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
          onClick={handleCloseUnlockModal}
        >
          <div
            style={{
              background: "#333",
              color: "#fff",
              padding: "20px",
              borderRadius: "5px",
              minWidth: "300px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Unlock Skin #{selectedLockedSkin.bakedId}</h3>
            <img
              src={`${backendUrl}/skins/icons/${selectedLockedSkin.bakedId}.png`}
              alt={`Locked Skin #${selectedLockedSkin.bakedId}`}
              style={{
                width: "120px",
                height: "120px",
                objectFit: "contain",
                display: "block",
                margin: "10px auto",
              }}
            />
            <p>
              Unlock token #{selectedLockedSkin.tokenId} (baked ID{" "}
              {selectedLockedSkin.bakedId})?
            </p>
            <div
              style={{ display: "flex", gap: "8px", justifyContent: "center" }}
            >
              <button onClick={confirmUnlock}>Yes, Unlock</button>
              <button onClick={handleCloseUnlockModal}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// -------------------- WholeSkinsPanel Component --------------------
function WholeSkinsPanel({
  onClose,
  chestOpenerContract,
  skinLockAddress,
  userAddress,
  ownedSkins,
  fetchOwnedSkins,
  skinLockContract
}) {
  const bakedIdList = ownedSkins.map((item) => item.bakedId);
  const GRID_COLUMNS = 32;
  const CELL_SIZE = 18;
  const TOTAL_SKINS = 1024;
  const scale = 70 / (GRID_COLUMNS * CELL_SIZE);

  async function getUserLockedCount() {
    if (!skinLockContract || !userAddress) return 0;
    try {
      const locked = await skinLockContract.getLockedSkins(userAddress);
      return locked.length;
    } catch (err) {
      console.error("Error in getUserLockedCount:", err);
      return 0;
    }
  }

  async function lockSkin(bakedId) {
    if (!chestOpenerContract || !userAddress || !skinLockAddress) return;
    const matching = ownedSkins.filter((item) => item.bakedId === bakedId);
    if (!matching.length) {
      alert("No token found for this skin. Make sure you own it.");
      return;
    }
    const tokenId = matching[0].tokenId;
    try {
      const userLocked = await getUserLockedCount();
      if (userLocked >= 3) {
        alert("You already have 3 locked skins. Cannot lock more!");
        return;
      }
      const data = new ethers.AbiCoder().encode(["uint256"], [bakedId]);
      const tx =
        await chestOpenerContract["safeTransferFrom(address,address,uint256,bytes)"](
          userAddress,
          skinLockAddress,
          tokenId,
          data
        );
      await tx.wait();
      alert(`Locked Skin #${bakedId} successfully!`);
      fetchOwnedSkins();
    } catch (err) {
      console.error("Error locking skin:", err);
      alert("Error locking skin: " + err.message);
    }
  }

  function getSkinCoords(skinId) {
    return {
      x: (skinId % GRID_COLUMNS) * CELL_SIZE,
      y: Math.floor(skinId / GRID_COLUMNS) * CELL_SIZE
    };
  }

  return (
    <div className="whole-skins-overlay" onClick={onClose} style={{ cursor: "auto" }}>
      <div
        style={{
          position: "relative",
          width: "70vmin",
          height: "70vmin",
          margin: "0 auto",
          overflow: "hidden"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={`${backendUrl}/skins/whole.png`}
          alt="All Skins"
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
        {Array.from({ length: TOTAL_SKINS }, (_, i) => {
          const { x, y } = getSkinCoords(i);
          const isOwned = bakedIdList.includes(i);
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: `${x * scale}vmin`,
                top: `${y * scale}vmin`,
                width: `${CELL_SIZE * scale}vmin`,
                height: `${CELL_SIZE * scale}vmin`,
                backgroundColor: isOwned ? "transparent" : "rgba(128,128,128,0.5)",
                cursor: isOwned ? "pointer" : "not-allowed"
              }}
              onClick={() => {
                if (isOwned) lockSkin(i);
              }}
            />
          );
        })}
      </div>
      <button
        className="close-whole-skins-btn"
        onClick={onClose}
        style={{ position: "absolute", top: "20px", right: "20px" }}
      >
        Close
      </button>
    </div>
  );
}

// -------------------- LorePanel Component --------------------
function LorePanel({ onClose, ownedSkins }) {
  const [selectedLore, setSelectedLore] = useState(null);
  const bakedIdList = ownedSkins.map((item) => item.bakedId);
  const GRID_COLUMNS = 32;
  const CELL_SIZE = 18;
  const TOTAL_SKINS = 1024;
  const scale = 70 / (GRID_COLUMNS * CELL_SIZE);

  function getSkinCoords(skinId) {
    return {
      x: (skinId % GRID_COLUMNS) * CELL_SIZE,
      y: Math.floor(skinId / GRID_COLUMNS) * CELL_SIZE
    };
  }

  async function handleClick(skinId) {
    if (!bakedIdList.includes(skinId)) {
      alert("You do not own this skin");
      return;
    }
    try {
      const response = await fetch(`${backendUrl}/skins/text1/${skinId}.json`);
      if (!response.ok) throw new Error("Failed to fetch lore");
      const metadata = await response.json();
      setSelectedLore({ ...metadata, skinId });
    } catch (error) {
      console.error("Error fetching lore:", error);
      alert("Error fetching lore: " + error.message);
    }
  }

  function handleCloseLoreModal() {
    setSelectedLore(null);
  }

  return (
    <div className="whole-skins-overlay" onClick={onClose} style={{ cursor: "auto" }}>
      <div
        style={{
          position: "relative",
          width: "70vmin",
          height: "70vmin",
          margin: "0 auto",
          overflow: "hidden"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={`${backendUrl}/skins/whole.png`}
          alt="All Skins"
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
        {Array.from({ length: TOTAL_SKINS }, (_, i) => {
          const { x, y } = getSkinCoords(i);
          const isOwned = bakedIdList.includes(i);
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: `${x * scale}vmin`,
                top: `${y * scale}vmin`,
                width: `${CELL_SIZE * scale}vmin`,
                height: `${CELL_SIZE * scale}vmin`,
                backgroundColor: isOwned ? "transparent" : "rgba(128,128,128,0.5)",
                cursor: isOwned ? "pointer" : "not-allowed"
              }}
              onClick={() => handleClick(i)}
            />
          );
        })}
      </div>
      <button
        onClick={onClose}
        style={{
          position: "fixed",
          top: "20px",
          right: "20px",
          background: "none",
          border: "1px solid #ff00e2",
          color: "#ff00e2",
          padding: "8px",
          cursor: "pointer",
          borderRadius: "4px",
          zIndex: 1300
        }}
      >
        Close Lore
      </button>
      {selectedLore && (
        <div className="lore-modal-overlay" onClick={handleCloseLoreModal}>
          <div
            className="lore-modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ display: "flex", flexDirection: "row", gap: "20px", alignItems: "flex-start" }}
          >
            <img
              src={
                selectedLore.image
                  ? toGatewayUrl(selectedLore.image)
                  : `${backendUrl}/skins/icons/${selectedLore.skinId}.png`
              }
              alt={selectedLore.title || `Skin #${selectedLore.skinId}`}
              style={{ width: "250px", height: "auto", border: "1px solid #fff", borderRadius: "8px" }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <h2 style={{ color: "#ff00e2", margin: 0 }}>
                  {selectedLore.title || `Skin #${selectedLore.skinId}`}
                </h2>
              </div>
              {selectedLore.subtitle && (
                <h4 style={{ color: "#fff", marginTop: "0.5rem" }}>
                  {selectedLore.subtitle}
                </h4>
              )}
              <div
                style={{
                  color: "#fff",
                  background: "#222",
                  border: "1px solid #333",
                  borderRadius: "6px",
                  padding: "10px",
                  marginTop: "1rem",
                  maxHeight: "40vh",
                  overflowY: "auto"
                }}
              >
                {Object.entries(selectedLore).map(([key, value]) => {
                  if (key === "image" || key === "skinId") return null;
                  return (
                    <div key={key} style={{ marginBottom: "8px" }}>
                      <strong style={{ textTransform: "capitalize" }}>
                        {key}:
                      </strong>
                      <span style={{ marginLeft: "5px" }}>
                        {typeof value === "object" ? JSON.stringify(value, null, 2) : value.toString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// -------------------- Main App Component --------------------
function App() {
  const LEFT_PANEL_WIDTH = 300; // slightly narrower to squeeze more
  const RIGHT_PANEL_WIDTH = 300;
  const TOP_BAR_HEIGHT = 100;  // reduce top bar height a bit
  const MIN_BOARD_SIZE = 280;  // squeeze the board min size slightly

  const [boardSize, setBoardSize] = useState(MIN_BOARD_SIZE);

  const [userAddress, setUserAddress] = useState("");
  const [gameContract, setGameContract] = useState(null);
  const [bettingContract, setBettingContract] = useState(null);
  const [chestMinterContract, setChestMinterContract] = useState(null);
  const [chestOpenerContract, setChestOpenerContract] = useState(null);
  const [skinLockContract, setSkinLockContract] = useState(null);

  const [mizonsBalance, setMizonsBalance] = useState("0");
  const [phaseData, setPhaseData] = useState({ phase: "picking", timeLeft: 30, gameId: 1 });
  const [teamCounts, setTeamCounts] = useState({ red: 0, blue: 0 });
  const [userTeam, setUserTeam] = useState(0);
  const [status, setStatus] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const [liveBoard, setLiveBoard] = useState(Array(4096).fill({ value: 0, skin: null }));
  const [boardHistory, setBoardHistory] = useState([]);
  const [liveReplayIndex, setLiveReplayIndex] = useState(-1);
  const [liveAutoReplay, setLiveAutoReplay] = useState(false);

  const [showMyGames, setShowMyGames] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [selectedHistory, setSelectedHistory] = useState(null);
  const [selectedReplayIndex, setSelectedReplayIndex] = useState(-1);
  const [selectedAutoReplay, setSelectedAutoReplay] = useState(false);

  const [liveRedBets, setLiveRedBets] = useState(0);
  const [liveBlueBets, setLiveBlueBets] = useState(0);
  const [betAmount, setBetAmount] = useState(1);
  const [inventory, setInventory] = useState([]);

  const [chestAnimation, setChestAnimation] = useState({ active: false, step: null, data: null, chestType: null, frame: 1 });
  const [winnerOverlay, setWinnerOverlay] = useState(null);

  const [ownedSkins, setOwnedSkins] = useState([]);

  const [showWholeSkins, setShowWholeSkins] = useState(false);
  const [showLorePanel, setShowLorePanel] = useState(false);

  const socketRef = useRef(null);

  // Adjust board size on window resize
  useEffect(() => {
    function handleResize() {
      const availableWidth = window.innerWidth - (LEFT_PANEL_WIDTH + RIGHT_PANEL_WIDTH + 50);
      const availableHeight = window.innerHeight - (TOP_BAR_HEIGHT + 50);
      setBoardSize(Math.max(MIN_BOARD_SIZE, Math.min(availableWidth, availableHeight)));
    }
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Ensure the outer container uses full viewport height
  useEffect(() => {
    document.documentElement.style.height = "100%";
    document.body.style.height = "100%";
  }, []);

  // Connect/disconnect wallet
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
    setSkinLockContract(null);
    setErrorMsg("");
    setStatus("");
  }
  useEffect(() => {
    if (window.ethereum) {
      const handleAccountsChanged = (accounts) => {
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
    socketRef.current.on("phaseUpdated", (data) => setPhaseData(data));
    socketRef.current.on("boardUpdated", (augmentedBoard) => {
      if (liveReplayIndex < 0 && !selectedHistory) setLiveBoard(augmentedBoard);
    });
    socketRef.current.on("winner", ({ winner }) => {
      if (!chestAnimation.active) {
        setWinnerOverlay(winner);
        setTimeout(() => setWinnerOverlay(null), 3000);
      }
    });
    socketRef.current.on("newGameRecord", (record) => {
      setRefreshKey((prev) => prev + 1);
    });
    socketRef.current.on("disconnect", () => console.log("Socket disconnected"));
    return () => socketRef.current.disconnect();
  }, [chestAnimation.active, liveReplayIndex, selectedHistory]);

  // Phase polling
  useEffect(() => {
    const interval = setInterval(() => {
      fetch(`${backendUrl}/api/state`)
        .then((res) => res.json())
        .then((data) => setPhaseData(data))
        .catch((err) => console.error("Error fetching state:", err));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Contract setup
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

        if (skinLockAddress && skinLockAddress !== "0x0000000000000000000000000000000000000000") {
          const lockC = new ethers.Contract(skinLockAddress, skinLockABI, signer);
          setSkinLockContract(lockC);
        }
      } catch (err) {
        console.error("Error setting up contracts:", err);
        setErrorMsg("Error setting up contracts: " + err.message);
      }
    }
    setupContracts();
  }, [userAddress]);

  // Bets polling
  useEffect(() => {
    if (!phaseData.gameId) return;
    async function fetchBets() {
      try {
        const res = await fetch(`${backendUrl}/api/bets/${phaseData.gameId}`);
        const data = await res.json();
        if (data && data.bets) {
          const red = data.bets.filter((b) => b.team === 1).reduce((sum, b) => sum + Number(b.tickets), 0);
          const blue = data.bets.filter((b) => b.team === 2).reduce((sum, b) => sum + Number(b.tickets), 0);
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

  // Board history polling
  useEffect(() => {
    const interval = setInterval(() => {
      fetch(`${backendUrl}/api/history`)
        .then((res) => res.json())
        .then((data) => setBoardHistory(data.boardHistory || []))
        .catch((err) => console.error("loadHistory error:", err));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Live board polling (only during placing phase)
  useEffect(() => {
    if (phaseData.phase !== "placing") return;
    if (selectedHistory || liveReplayIndex >= 0) return;
    const interval = setInterval(() => {
      fetch(`${backendUrl}/api/board`)
        .then((res) => res.json())
        .then((data) => {
          if (data && data.board) setLiveBoard(data.board);
        })
        .catch((err) => console.error("Error polling board:", err));
    }, 1000);
    return () => clearInterval(interval);
  }, [phaseData.phase, selectedHistory, liveReplayIndex]);

  // Live auto-replay
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

  // Recorded auto-replay
  useEffect(() => {
    if (!selectedAutoReplay || !selectedHistory || selectedHistory.length === 0) return;
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

  // Team info polling
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
          console.error("Error fetching team info:", err);
        }
      })();
    }, 1000);
    return () => clearInterval(interval);
  }, [gameContract, userAddress, selectedHistory, liveReplayIndex, phaseData.gameId]);

  // MIZ balance polling
  useEffect(() => {
    if (!userAddress) return;
    const provider = new ethers.BrowserProvider(window.ethereum);
    const mizonsContract = new ethers.Contract(mizonsAddress, mizonsABI, provider);
    const interval = setInterval(() => {
      mizonsContract
        .balanceOf(userAddress)
        .then((bal) => setMizonsBalance(bal.toString()))
        .catch((err) => console.error("Error fetching MIZ balance:", err));
    }, 1000);
    return () => clearInterval(interval);
  }, [userAddress]);

  // Refresh chest inventory
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

  // Fetch owned skins from ChestOpener
  async function fetchOwnedSkinsFromOpener() {
    if (!chestOpenerContract || !userAddress) return;
    try {
      const itemBalanceBN = await chestOpenerContract.balanceOf(userAddress);
      const itemBalance = Number(itemBalanceBN);
      const skins = [];
      for (let i = 0; i < itemBalance; i++) {
        const tokenIdBN = await chestOpenerContract.tokenOfOwnerByIndex(userAddress, i);
        const tokenId = Number(tokenIdBN);
        const awardedItemBN = await chestOpenerContract.tokenAwardedItem(tokenId);
        const awardedItem = Number(awardedItemBN);
        console.log(`Mapping minted token ${tokenId} to bakedID ${awardedItem}`);
        skins.push({ tokenId, bakedId: awardedItem });
      }
      setOwnedSkins(skins);
    } catch (err) {
      console.error("Error fetching owned skins from ChestOpener:", err);
    }
  }
  useEffect(() => {
    fetchOwnedSkinsFromOpener();
  }, [chestOpenerContract, userAddress, status]);

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

  // joinTeam
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

  // handleMintChest
  // Now the chest image is clickable to mint a chest
  async function handleMintChest() {
    if (!userAddress) {
      alert("Connect your wallet first!");
      return;
    }
    if (!chestMinterContract) {
      alert("ChestMinter contract not connected.");
      return;
    }
    try {
      setChestAnimation({
        active: true,
        step: "brain",
        chestType: null,
        frame: 0,
        data: { image: `${backendUrl}/chests/brain.png` }
      });
      await new Promise((resolve) => setTimeout(resolve, 1500));

      setChestAnimation({
        active: true,
        step: "stir",
        chestType: null,
        frame: 0,
        data: { image: `${backendUrl}/chests/brain.png` }
      });
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const tx = await chestMinterContract.mintRandomChest({ gasLimit: 400000 });
      await tx.wait();
      await new Promise((resolve) => setTimeout(resolve, 800));
      refreshInventory();
      fetchOwnedSkinsFromOpener();

      const balanceBN = await chestMinterContract.balanceOf(userAddress);
      const balance = Number(balanceBN);
      const tokenIdBN = await chestMinterContract.tokenOfOwnerByIndex(userAddress, balance - 1);
      const tokenId = Number(tokenIdBN);
      const chestTypeBN = await chestMinterContract.tokenChestType(tokenId);
      const chestType = Number(chestTypeBN);
      const metadataUrl = `${backendUrl}/chests/var/${chestType}.json`;
      const imageUrl = `${backendUrl}/chests/icons/chest${chestType}/frame1.png`;
      const response = await fetch(metadataUrl);
      if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
      const metadata = await response.json();
      metadata.image = imageUrl;

      setChestAnimation({
        active: true,
        step: "revealed",
        data: metadata,
        chestType,
        frame: 0
      });
      await new Promise((resolve) => setTimeout(resolve, 1500));
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

  // handleOpenChest
  async function handleOpenChest(tokenId) {
    const chest = inventory.find((c) => c.tokenId === tokenId);
    if (!chest) {
      alert("Chest not found in inventory.");
      return;
    }
    setChestAnimation({
      active: true,
      step: "opening",
      chestType: chest.type,
      frame: 1,
      data: null
    });
    for (let i = 1; i <= 5; i++) {
      setChestAnimation((prev) => ({ ...prev, frame: i }));
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    try {
      const tx = await chestOpenerContract.openChest(tokenId, {
        value: ethers.parseEther("0.001")
      });
      await tx.wait();
      const newItemIdBN = await chestOpenerContract.itemCounter();
      const newItemId = Number(newItemIdBN) - 1;
      const awardedItemBN = await chestOpenerContract.tokenAwardedItem(newItemId);
      const awardedItem = Number(awardedItemBN);
      const imageUrl = `${backendUrl}/skins/icons/${awardedItem}.png`;
      const metadataUrl = `${backendUrl}/skins/text1/${awardedItem}.json`;
      const response = await fetch(metadataUrl);
      if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
      const metadata = await response.json();
      metadata.image = imageUrl;

      setChestAnimation({
        active: true,
        step: "revealed",
        data: metadata,
        chestType: chest.type,
        frame: 0
      });
      await new Promise((resolve) => setTimeout(resolve, 1500));
    } catch (err) {
      console.error("Error opening chest:", err);
      alert("Failed to open chest: " + err.message);
    } finally {
      setChestAnimation({
        active: false,
        step: null,
        data: null,
        chestType: null,
        frame: 0
      });
      refreshInventory();
      fetchOwnedSkinsFromOpener();
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
      const tx = await mizonsContract.approve(chestMinterAddress, "1000000000000", {
        gasLimit: 100000
      });
      await tx.wait();
      alert("Approval successful!");
    } catch (err) {
      console.error("Approval error:", err);
      alert("Approval failed: " + err.message);
    }
  }

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
        const tx = await bettingContract.placeBet(phaseData.gameId, teamId, 1, {
          value: ethers.parseEther("0.00005")
        });
        await tx.wait();
      }
      setStatus(`${betAmount} bet(s) placed on ${teamId === 1 ? "Red" : "Blue"}!`);
      setErrorMsg("");
    } catch (err) {
      console.error("Bet failed:", err);
      setErrorMsg("Bet failed: " + err.message);
    }
  }

  const livePrevBoard = () => {
    if (boardHistory.length === 0) return;
    setLiveReplayIndex((prev) => (prev < 0 ? boardHistory.length - 1 : Math.max(0, prev - 1)));
  };
  const liveNextBoard = () => {
    if (boardHistory.length === 0) return;
    setLiveReplayIndex((prev) => (prev < 0 ? 0 : Math.min(boardHistory.length - 1, prev + 1)));
  };
  const liveGoToLive = () => {
    setLiveAutoReplay(false);
    setLiveReplayIndex(-1);
  };
  const liveToggleAutoReplay = () => {
    if (boardHistory.length === 0) return;
    if (liveReplayIndex < 0) setLiveReplayIndex(0);
    setLiveAutoReplay((prev) => !prev);
  };

  const recordPrevBoard = () => {
    if (!selectedHistory || selectedHistory.length === 0) return;
    setSelectedReplayIndex((prev) => (prev < 0 ? selectedHistory.length - 1 : Math.max(0, prev - 1)));
  };
  const recordNextBoard = () => {
    if (!selectedHistory || selectedHistory.length === 0) return;
    setSelectedReplayIndex((prev) => (prev < 0 ? 0 : Math.min(selectedHistory.length - 1, prev + 1)));
  };
  const recordToggleAutoReplay = () => {
    if (!selectedHistory || selectedHistory.length === 0) return;
    if (!selectedAutoReplay) setSelectedReplayIndex(0);
    setSelectedAutoReplay((prev) => !prev);
  };
  const recordGoBackToLive = () => {
    setSelectedRecord(null);
    setSelectedHistory(null);
    setSelectedReplayIndex(-1);
    setSelectedAutoReplay(false);
  };

  let displayBoard;
  if (selectedHistory) {
    const replayIndex = selectedReplayIndex < 0 ? selectedHistory.length - 1 : selectedReplayIndex;
    displayBoard = convertToAugmentedBoard(selectedHistory[replayIndex]);
  } else if (liveReplayIndex >= 0 && boardHistory.length > 0) {
    const idx = Math.min(liveReplayIndex, boardHistory.length - 1);
    displayBoard = convertToAugmentedBoard(boardHistory[idx]);
  } else {
    displayBoard = liveBoard;
  }

  function computeOpposingStats(board) {
    let redOnBlue = 0;
    let blueOnRed = 0;
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

  return (
    <div className="app-container" style={{ margin: 0, padding: 0, height: "100vh" }}>
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
                alt={`Chest Frame ${chestAnimation.frame}`}
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

      {/* Title Bar */}
      <div className="title-bar" style={{ textAlign: "center", marginBottom: "2px" }}>
        <h1 style={{ margin: 0, fontSize: "3rem" }}>Game of Death</h1>
      </div>

      {/* Scoreboard */}
      <div className="scoreboard-bar-container" style={{ marginBottom: "4px" }}>
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

      {/* Main Content Layout */}
      <div className="main-content">
        <div
          className="left-panel"
          style={{
            width: LEFT_PANEL_WIDTH,
            padding: "5px",
            boxSizing: "border-box",
            minHeight: "600px", /* smaller minHeight to squeeze */
            overflowY: "auto",
          }}
        ><div className="red-panel"
        style={{
          width: LEFT_PANEL_WIDTH,
          padding: "10px",
          boxSizing: "border-box",
          minHeight: "80px", /* smaller minHeight to squeeze */
          overflowY: "auto",
          marginTop: "6px",
           width: "270px",
            height: "220px",
             overflowY: "auto" }}>
          <h2 className="section-title">Your MIZ</h2>
             <div className="miz-balance-container">
                        <img src={logo} alt="MIZ Logo" className="miz-logo" />
                      <p>{formatMizons(mizonsBalance)} MIZ</p>
                           </div>

                           {skinLockContract && (
  <div className="locked-skins-section">
    <h3>Locked Skins</h3>
    <LockedSkinSlots
      userAddress={userAddress}
      skinLockContract={skinLockContract}
      backendUrl={backendUrl}
      refreshLockedSkins={fetchOwnedSkinsFromOpener}
    />
  </div>
                                   )}</div>

          {/* Chest & Buttons around it */}
          <div className="chest-roll-section" style={{ width: "270px", position: "relative", marginTop: "10px" }}>
            <div
              style={{
                position: "relative",
                width: "100px", // narrower chest
                margin: "0 auto",
                cursor: "pointer"
              }}
              onClick={handleMintChest} // Make chest clickable to mint
            >
              <img
                src={`${backendUrl}/chests/brain.png`}
                alt="Brain Chest"
                style={{ width: "100px", height: "auto" }}
              />
              
              {/* Top-left: Lore */}
              <button
                className="chest-square-button lore-info"
                style={{ fontSize: "0.8rem" }}
                onClick={(e) => {
                  e.stopPropagation(); // don't trigger handleMintChest
                  fetchOwnedSkinsFromOpener().then(() => setShowLorePanel(true));
                }}
              >
                Lore
              </button>

              {/* Top-right: Skin */}
              <button
                className="chest-square-button skin"
                style={{ fontSize: "0.8rem" }}
                onClick={(e) => {
                  e.stopPropagation();
                  fetchOwnedSkinsFromOpener().then(() => setShowWholeSkins(true));
                }}
              >
                SKIN
              </button>

              {/* Bottom-left: mizontresh image */}
              <button
                className="chest-square-button stop"
                style={{ padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
                onClick={(e) => {
                  e.stopPropagation();
                  alert("This button uses a mizontresh image!");
                }}
              >
                <img
                  src={`${backendUrl}/skins/icons/mizontresh.png`}
                  alt="mizontresh"
                  style={{ width: "70%", height: "70%", objectFit: "contain" }}
                />
              </button>

              {/* Bottom-right: Info */}
              <button
                className="chest-square-button info"
                style={{ fontSize: "0.8rem" }}
                onClick={(e) => {
                  e.stopPropagation();
                  alert("Some Info about the game/chest!");
                }}
              >
                INFO
              </button>
            </div>

            {/* Approve & separate Mint Chest button, if user doesn't want to click chest */}
            <div style={{ textAlign: "center", marginTop: "10px" }}>
              <button onClick={approveTokens}>Approve Tokens</button>
              <button onClick={handleMintChest} style={{ display: "block", margin: "6px auto" }}>
                Mint Chest
              </button>
            </div>

            {/* Inventory */}
            <div className="inventory" style={{marginTop: "6px", width: "255px", height: "64px", overflowY: "auto" }}>
              <h3 style={{ fontSize: "1rem", textAlign: "center", margin: "0 0 4px 0" }}>Your Inventory</h3>
              <Inventory inventory={inventory} backendUrl={backendUrl} onOpenChest={handleOpenChest} />
            </div>
          </div>

          {/* Phase & Bet Info */}
          <div style={{ marginTop: "10px", width: "100%" }}>
            <div className="phase-info-card" style={{ marginBottom: "8px" }}>
              <p style={{ margin: 0 }}>Phase: {phaseData.phase}</p>
              <p style={{ margin: 0 }}>Time Left: {phaseData.timeLeft > 0 ? phaseData.timeLeft : 0}s</p>
              <p style={{ margin: 0 }}>Game ID: {phaseData.gameId}</p>
            </div>
            <p style={{ margin: "4px 0" }}>Your Team: {userTeam === 1 ? "Red" : userTeam === 2 ? "Blue" : "None"}</p>
            <div className="join-team-buttons" style={{ marginBottom: "6px" }}>
              <button className="join-red" onClick={() => joinTeam(1)} disabled={phaseData.phase !== "picking"}>
                Join Red
              </button>
              <button className="join-blue" onClick={() => joinTeam(2)} disabled={phaseData.phase !== "picking"}>
                Join Blue
              </button>
            </div>
            <p style={{ margin: 0 }}>Team Red: {teamCounts.red}</p>
            <p style={{ margin: 0 }}>Team Blue: {teamCounts.blue}</p>
            <h3 style={{ margin: "8px 0 4px 0" }}>Bet Panel</h3>
            <p style={{ margin: 0 }}>Red Bets: {liveRedBets}</p>
            <p style={{ margin: 0 }}>Blue Bets: {liveBlueBets}</p>
            <p style={{ margin: 0 }}>Tickets: {betAmount}</p>
            <input
              type="range"
              min="1"
              max="10"
              value={betAmount}
              onChange={(e) => setBetAmount(Number(e.target.value))}
            />
            <div className="bet-buttons" style={{ marginTop: "6px" }}>
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
          <div className="board-container" style={{ width: boardSize, height: boardSize, marginBottom: "6px" }}>
            <div className="board-border">
              {showVeil && userTeam === 1 && (
                <div
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    width: "100%",
                    height: "50%",
                    background: "rgba(0,0,0,0.3)",
                    pointerEvents: "none",
                    zIndex: 999
                  }}
                />
              )}
              {showVeil && userTeam === 2 && (
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "50%",
                    background: "rgba(0,0,0,0.3)",
                    pointerEvents: "none",
                    zIndex: 999
                  }}
                />
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
            <div className="replay-container" style={{ marginBottom: "4px" }}>
              <button onClick={livePrevBoard}>←</button>
              <button onClick={liveGoToLive}>Live</button>
              <button onClick={liveNextBoard}>→</button>
              <button className="auto-replay-btn" onClick={liveToggleAutoReplay}>
                {liveAutoReplay ? "Stop Replay" : "Auto Replay"}
              </button>
            </div>
          )}
          {!selectedHistory && liveReplayIndex >= 0 && (
            <p style={{ marginTop: "2px", marginBottom: "4px" }}>
              Viewing Board {liveReplayIndex + 1}/{boardHistory.length}
            </p>
          )}
          {!selectedHistory && liveReplayIndex < 0 && (
            <p style={{ marginTop: "2px", marginBottom: "4px" }}>Viewing Live Board</p>
          )}
        </div>

        {/* Right Panel */}
        <div className="right-panel" style={{ width: RIGHT_PANEL_WIDTH }}>
          <h2 style={{ margin: "0 0 8px 0" }}>Game Records</h2>
          <div style={{ display: "flex", gap: "8px", justifyContent: "center", marginBottom: "8px" }}>
            <button
              className="toggle-btn"
              onClick={() => {
                setShowMyGames(false);
                setRefreshKey((prev) => prev + 1);
              }}
            >
              All Games
            </button>
            <button
              className="toggle-btn"
              onClick={() => {
                setShowMyGames(true);
                setRefreshKey((prev) => prev + 1);
              }}
              disabled={!userAddress}
            >
              My Games
            </button>
          </div>
          <RecordsList
            backendUrl={backendUrl}
            showMyGames={showMyGames}
            userAddress={userAddress}
            onSelectRecord={selectRecord}
            refreshKey={refreshKey}
          />
          {selectedRecord && selectedHistory && (
            <div style={{ marginTop: "10px" }}>
              <h3>Game #{selectedRecord.gameId} Details</h3>
              <p>
                Played at:{" "}
                {selectedRecord.timestamp
                  ? new Date(selectedRecord.timestamp).toLocaleString()
                  : "N/A"}
              </p>
              <p>Winner: {selectedRecord.winner}</p>
              <p>Team Red: {selectedRecord.teamRedCount} | Team Blue: {selectedRecord.teamBlueCount}</p>
              {selectedRecord.thumbnail && (
                <img
                  src={selectedRecord.thumbnail}
                  alt={`Game #${selectedRecord.gameId}`}
                  style={{ width: "150px", height: "150px", objectFit: "cover" }}
                />
              )}
              <div style={{ marginTop: "6px" }}>
                <button
                  className="auto-replay-btn"
                  onClick={() => {
                    setSelectedAutoReplay(!selectedAutoReplay);
                    if (!selectedAutoReplay) setSelectedReplayIndex(0);
                  }}
                >
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
                <p>
                  Viewing Board {selectedReplayIndex + 1}/{selectedHistory.length}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Overlays for Whole Skins and Lore */}
      {showWholeSkins && chestOpenerContract && (
        <WholeSkinsPanel
          onClose={() => setShowWholeSkins(false)}
          chestOpenerContract={chestOpenerContract}
          skinLockAddress={skinLockAddress}
          userAddress={userAddress}
          ownedSkins={ownedSkins}
          fetchOwnedSkins={fetchOwnedSkinsFromOpener}
          skinLockContract={skinLockContract}
        />
      )}
      {showLorePanel && (
        <LorePanel
          onClose={() => setShowLorePanel(false)}
          ownedSkins={ownedSkins}
        />
      )}

      {errorMsg && (
        <div className="error-bar">
          {errorMsg}
          <button
            className="error-close"
            onClick={() => setErrorMsg("")}
          >
            x
          </button>
        </div>
      )}
    </div>
  );
}

export default App;

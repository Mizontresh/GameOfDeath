// App.js
/* global BigInt */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { io } from "socket.io-client";
import { ethers } from "ethers";
import "./App.css"; // <-- your big CSS file with all the styling
import logo from "./logo.png";


/* -------------------- Minimal ABIs -------------------- */
const gameABI = [
  "function joinTeam(uint256 gameId, uint8 teamId) external",
  "function placeSquare(uint256 x, uint256 y) external",
  "function getTeam(uint256 gameId, address user) external view returns (uint8)",
  "function getTeamCounts(uint256 gameId) external view returns (uint256 redCount, uint256 blueCount)",
  "function currentPhase() external view returns (uint8)",
  "function currentGameId() external view returns (uint256)"
];
const bettingABI = [
  "function placeBet(uint8 team, uint256 tickets) external payable",
  "function getBets() external view returns (tuple(address user,uint8 team,uint256 tickets)[])",
  "function openBetting() external",
  "function closeBetting() external",
  "function clearBet() external"
];



const mizonsABI = [
  "function balanceOf(address owner) external view returns (uint256)",
  "function mint(address to, uint256 amount) external",
  "function approve(address spender, uint256 amount) external returns (bool)"
];
const chestMinterABI = [
  "function mintRandomChest() external returns (uint256)",
  "function tokenFrame(uint256 tokenId) external view returns (uint8)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256)",
  "function balanceOf(address owner) external view returns (uint256)",
  "function tokenURI(uint256 tokenId) external view returns (string)",
  "function setChestOpener(address opener) external",
   "function approve(address to, uint256 tokenId) external",
  "function safeTransferFrom(address from, address to, uint256 tokenId, bytes data) external"
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
const mizontreshABI = [
  "function balanceOf(address owner) external view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256)",
  "function buyToken() external payable",
  "function TOKEN_PRICE() external view returns (uint256)",
  "function buyToken() external payable",
  "function getApproved(uint256 tokenId) external view returns (address)",
  "function approve(address to, uint256 tokenId) external",
  "function setApprovalForAll(address operator, bool approved) external",
  "function safeTransferFrom(address from, address to, uint256 tokenId, bytes data) external"
];

/* -------------------- Environment Constants -------------------- */
const gameAddress          = process.env.REACT_APP_GAMEOFDEATH_ADDRESS;
const bettingAddress       = process.env.REACT_APP_BETTING_ADDRESS;
const mizonsAddress        = process.env.REACT_APP_MIZONS_ADDRESS;
const chestMinterAddress   = process.env.REACT_APP_CHEST_MINTER_ADDRESS;
const chestOpenerAddress   = process.env.REACT_APP_CHEST_OPENER_ADDRESS;
const skinLockAddress      = process.env.REACT_APP_SKIN_LOCK_ADDRESS;
const mizontreshAddress    = process.env.REACT_APP_MIZONTRESH_ADDRESS;

// ensure we always have our HTTPS backend host (no trailing slash)
const rawBackend = process.env.REACT_APP_BACKEND_URL || "";
export const backendUrl = rawBackend.replace(/\/$/, "");

/**
 * Given any raw path or URL, point it at our backend over HTTPS.
 * - full URLs get their path re‑mapped
 * - relative paths get prefixed
 */
export function resolveAssetUrl(raw) {
  if (!raw) return "";
  try {
    const u = new URL(raw);
    return backendUrl + u.pathname;
  } catch {
    return backendUrl + (raw.startsWith("/") ? raw : "/" + raw);
  }
}


/* -------------------- Utility Functions -------------------- */
function toGatewayUrl(url) {
  if (!url) return "";
  if (url.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${url.slice(7)}`;
  }
  return url;
}

function convertToAugmentedBoard(numericalBoard) {
  return numericalBoard.map((val) => ({ value: val }));
}

function formatMizons(balance) {
  const bal = Number(ethers.formatUnits(balance, 18));
  if (bal === 0) return "0";
  if (bal < 0.000001 || bal > 1_000_000) return bal.toExponential(6);
  return bal.toFixed(6);
}

/* -------------------- AgeVerification Component -------------------- */
function AgeVerification({ onVerify }) {
  return (
    <div className="age-verification-overlay">
      <div className="age-verification-modal">
        <h2>Age Verification</h2>
        <p>Please confirm that you are 18 years of age or older to proceed.</p>
        <div className="age-verification-buttons">
          <button onClick={() => onVerify(true)}>Yes, I am 18 or older</button>
          <button onClick={() => onVerify(false)}>No, I am not 18</button>
        </div>
      </div>
    </div>
  );
}

/* -------------------- MusicPlayer Component -------------------- */
function MusicPlayer({ backendUrl }) {
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.5);
  const audioRef = useRef(null);

  const playRandomSong = useCallback(() => {
    if (!audioRef.current) return;
    const songNumber = Math.floor(Math.random() * 256);
    audioRef.current.src = `${backendUrl}/songs/${songNumber}.mp3`;
    audioRef.current.play().catch((err) => console.error("Error playing audio:", err));
  }, [backendUrl]);

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.loop = false;
      audioRef.current.volume = volume;
      audioRef.current.muted = muted;
      playRandomSong();
      audioRef.current.play().catch((err) => console.error("Autoplay error:", err));
    }
    const audio = audioRef.current;
    audio.addEventListener("ended", playRandomSong);
    return () => {
      audio.removeEventListener("ended", playRandomSong);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = muted;
    }
  }, [muted]);

  return (
    <div
      style={{
        position: "fixed",
        bottom: "10px",
        left: "10px",
        zIndex: 15000,
        background: "rgba(0,0,0,0.5)",
        padding: "6px 10px",
        borderRadius: "5px",
      }}
    >
      <button className="music-button" onClick={() => setMuted((prev) => !prev)}>
        {muted ? "Unmute" : "Mute"}
      </button>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={volume}
        onChange={(e) => setVolume(parseFloat(e.target.value))}
        style={{ marginLeft: "10px" }}
      />
    </div>
  );
}

/* -------------------- LockedSkinSlots -------------------- */
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
    if (item) {
      setSelectedLockedSkin(item);
    }
  };

  const confirmUnlock = async () => {
    if (!selectedLockedSkin) return;
    try {
      const { tokenId, bakedId } = selectedLockedSkin;
      const tx = await skinLockContract.unlockNFT(tokenId);
      await tx.wait();
      alert(`Unlocked Skin #${bakedId} (tokenId ${tokenId})!`);
      fetchLockedSkins();
      if (refreshLockedSkins) refreshLockedSkins();
    } catch (err) {
      console.error("Error unlocking skin:", err);
      alert("Error unlocking skin: " + err.message);
    } finally {
      setSelectedLockedSkin(null);
    }
  };

  const handleCloseUnlockModal = () => {
    setSelectedLockedSkin(null);
  };

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
            zIndex: 6000,
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
            <p>Unlock token #{selectedLockedSkin.tokenId} (baked ID {selectedLockedSkin.bakedId})?</p>
            <div style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
              <button onClick={confirmUnlock}>Yes, Unlock</button>
              <button onClick={handleCloseUnlockModal}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* 
  LoreSlidesOverlay: 
  For each lore #, loads 0.png / 0.txt, 1.png / 1.txt, etc.
  Then tries end.txt
*/
function LoreSlidesOverlay({ loreIndex, onClose }) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [currentImageUrl, setCurrentImageUrl] = useState("");
  const [currentText, setCurrentText] = useState("");
  const [isEnd, setIsEnd] = useState(false);

  async function fetchSlideData(index) {
    try {
      const imageUrl = `${backendUrl}/slides/${loreIndex}/${index}.png`;
      const textUrl = `${backendUrl}/slides/${loreIndex}/${index}.txt`;

      const imageResponse = await fetch(imageUrl);
      const textResponse = await fetch(textUrl);

      let foundSomething = false;

      if (imageResponse.ok) {
        setCurrentImageUrl(imageUrl);
        foundSomething = true;
      } else {
        setCurrentImageUrl("");
      }

      if (textResponse.ok) {
        const textContent = await textResponse.text();
        setCurrentText(textContent);
        foundSomething = true;
      } else {
        setCurrentText("");
      }

      if (!foundSomething) {
        // Attempt "end.txt"
        const endUrl = `${backendUrl}/slides/end.txt`;
        const endResp = await fetch(endUrl);
        if (endResp.ok) {
          const endText = await endResp.text();
          setCurrentText(endText);
          setCurrentImageUrl("");
          setIsEnd(true);
        } else {
          onClose();
        }
      }
    } catch (err) {
      console.error("Error loading slides:", err);
      onClose();
    }
  }

  useEffect(() => {
    fetchSlideData(currentSlide);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSlide]);

  const handleNext = () => {
    if (isEnd) {
      onClose();
    } else {
      setCurrentSlide((prev) => prev + 1);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 20000,
        background: "rgba(0,0,0,0.9)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "20px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#222",
          border: "2px solid #ff00e2",
          borderRadius: "8px",
          padding: "20px",
          maxWidth: "90vw",
          maxHeight: "90vh",
          overflowY: "auto",
          textAlign: "center",
          position: "relative",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Mizontresh Lore #{loreIndex + 1}</h2>
        {currentImageUrl && (
          <img
            src={currentImageUrl}
            alt="lore"
            style={{
              maxWidth: "80vw",
              maxHeight: "50vh",
              display: "block",
              margin: "10px auto",
            }}
          />
        )}
        {currentText && (
          <div
            style={{
              color: "#fff",
              background: "#333",
              borderRadius: "4px",
              padding: "10px",
              margin: "10px auto",
              maxWidth: "80vw",
            }}
          >
            <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{currentText}</p>
          </div>
        )}
        <button
          style={{
            marginTop: "10px",
            padding: "8px 16px",
            backgroundColor: "#ff00e2",
            color: "#000",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
          onClick={handleNext}
        >
          {isEnd ? "Close" : "Next"}
        </button>
      </div>
    </div>
  );
}

/* 
  MizontreshOverlay 
  with gating logic: [0, 8, 16, 24, 32, 40, 48, 56, 64]
*/
function MizontreshOverlay({
  onClose,
  mizontreshContract,
  skinLockAddress,
  skinLockContract,
  userAddress,
  refreshInventory,
  numUniqueSkins, // we'll pass in ownedSkins.length
}) {
  const [inventory, setInventory] = useState([]);
  const [buying] = useState(false);
  const [error, setError] = useState("");

  const [showLoreSlides, setShowLoreSlides] = useState(false);
  const [activeLoreIndex, setActiveLoreIndex] = useState(null);

  const loreRequirements = [0, 8, 16, 24, 32, 40, 48, 56, 64];

  useEffect(() => {
    async function fetchInventory() {
      if (!mizontreshContract || !userAddress) return;
      try {
        const balanceBN = await mizontreshContract.balanceOf(userAddress);
        const balance = Number(balanceBN);
        const tokens = [];
        for (let i = 0; i < balance; i++) {
          const tokenIdBN = await mizontreshContract.tokenOfOwnerByIndex(userAddress, i);
          tokens.push(Number(tokenIdBN));
        }
        setInventory(tokens);
      } catch (err) {
        console.error("Error fetching Mizontresh inventory:", err);
      }
    }
    fetchInventory();
  }, [mizontreshContract, userAddress, buying]);




  async function handleBuy() {
    // sanity check
    if (!window.ethereum || !mizontreshContract) {
      alert("Please connect your wallet and wait for the Mizontresh contract to load.");
      return;
    }
  
    try {
      // 1) build a signer‐backed contract instance
      const provider     = new ethers.BrowserProvider(window.ethereum);
      const signer       = await provider.getSigner();
      const contract     = mizontreshContract.connect(signer);
  
      // 2) fetch the on‐chain price
      //    (your Solidity public variable is called TOKEN_PRICE)
      const price = await contract.TOKEN_PRICE(); // BigInt
  
      // 3) fetch the user’s ETH balance
      const userAddr = await signer.getAddress();
      const balance  = await provider.getBalance(userAddr); // BigInt
  
      // 4) compare
      if (balance < price) {
        alert(
          `❌ Insufficient funds\n` +
          `Your balance: ${ethers.formatEther(balance)} ETH\n` +
          `Cost:          ${ethers.formatEther(price)} ETH`
        );
        return;
      }
  
      // 5) send the transaction
      const tx = await contract.buyToken({ value: price });
      await tx.wait();
  
      alert("🎉 Purchase succeeded!");
    } catch (err) {
      console.error("Purchase failed:", err);
      // try to extract a human‐readable revert reason
      const reason = err.reason || err.data?.message || err.message || "Unknown error";
      alert("❌ Purchase failed: " + reason);
    }
  }
  



  
  
  

  async function lockToken(tokenId) {
    if (!skinLockContract || !mizontreshContract || !userAddress || !skinLockAddress) return;
    try {
      const currentApproved = await mizontreshContract.getApproved(tokenId);
      if (currentApproved.toLowerCase() !== skinLockAddress.toLowerCase()) {
        const approveTx = await mizontreshContract.approve(skinLockAddress, tokenId);
        await approveTx.wait();
      }
      const data = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [1024]);
      const tx = await mizontreshContract["safeTransferFrom(address,address,uint256,bytes)"](
        userAddress,
        skinLockAddress,
        tokenId,
        data
      );
      await tx.wait();
      alert(`Locked token #${tokenId}`);
      if (refreshInventory) refreshInventory();
    } catch (err) {
      console.error("Error locking token:", err);
      setError("Lock failed: " + err.message);
    }
  }

  function handleLoreClick(index) {
    const requiredSkins = loreRequirements[index];
    if (numUniqueSkins < requiredSkins) {
      alert(
        `You need at least ${requiredSkins} unique skins to read Lore #${index + 1}. Currently you have ${numUniqueSkins}.`
      );
      return;
    }
    setActiveLoreIndex(index);
    setShowLoreSlides(true);
  }

  return (
    <div
      className="overlay"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        backgroundColor: "rgba(0,0,0,0.85)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        className="overlay-content"
        style={{
          background: "#222",
          border: "2px solid #ff00e2",
          borderRadius: "10px",
          padding: "20px",
          maxWidth: "500px",
          width: "90%",
          color: "#fff",
          textAlign: "center",
          position: "relative",
        }}
      >
        <h2>Mizontresh Shop</h2>
        <p style={{ color: "red" }}>Warning: You are wasting your money, this is useless!</p>
        <button
          onClick={handleBuy}
          disabled={buying}
          style={{
            margin: "10px",
            padding: "10px 20px",
            fontSize: "1rem",
            backgroundColor: "#ff00e2",
            color: "#fff",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          {buying ? "Purchasing..." : "Buy Mizontresh (0.5122018 ETH)"}
        </button>
        {error && <p style={{ color: "#ff8080" }}>{error}</p>}

        <h3>Your Mizontresh Inventory</h3>
        <div style={{ maxHeight: "200px", overflowY: "auto", marginBottom: "10px" }}>
          {inventory.length === 0 ? (
            <p>No tokens owned.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0 }}>
              {inventory.map((tokenId) => (
                <li key={tokenId} style={{ margin: "5px 0" }}>
                  Token #{tokenId}{" "}
                  <button
                    onClick={() => lockToken(tokenId)}
                    style={{
                      marginLeft: "10px",
                      padding: "5px 10px",
                      backgroundColor: "#333",
                      color: "#fff",
                      border: "1px solid #ff00e2",
                      borderRadius: "4px",
                      cursor: "pointer",
                    }}
                  >
                    Lock Token
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <h3>Lore</h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "10px",
            marginTop: "10px",
          }}
        >
          {Array.from({ length: 9 }).map((_, idx) => (
            <button
              key={idx}
              onClick={() => handleLoreClick(idx)}
              style={{
                border: "1px solid #fff",
                padding: "10px",
                textAlign: "center",
                background: "none",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              Lore {idx + 1}
            </button>
          ))}
        </div>

        <button
          onClick={onClose}
          style={{
            marginTop: "20px",
            padding: "8px 16px",
            backgroundColor: "#ff00e2",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Close
        </button>

        {/* Lore Slides Overlay (if active) */}
        {showLoreSlides && activeLoreIndex != null && (
          <LoreSlidesOverlay
            loreIndex={activeLoreIndex}
            onClose={() => {
              setShowLoreSlides(false);
              setActiveLoreIndex(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

/* -------------------- InfoPanel -------------------- */
function InfoPanel({ onClose }) {
  return (
    <div className="info-panel-overlay" onClick={onClose}>
      <div className="info-panel-content" onClick={(e) => e.stopPropagation()}>
        <h2>How to Play "Game of Death"</h2>
        <p>
          In <strong>Game of Death</strong> you must choose between two teams: Red and Blue.
          <br />
          <br />
          During the <em>picking phase</em>, players join a team. Once the phase ends, the game enters
          the <em>placing phase</em> where your objective is to strategically place squares on your
          designated half of a 64×64 board.
          <br />
          <br />
          In the subsequent evolution phase (inspired by Conway’s Game of Life), your squares
          interact according to survival and birth rules. The team that manages to capture more
          territory on the opponent's side wins the game.
          <br />
          <br />
          <strong>Tips:</strong>
          <ul>
            <li>Plan your moves carefully; every square affects the next evolution.</li>
            <li>You can secure limited special skins by locking them in your inventory.</li>
            <li>Bet on your team to gain extra rewards if they win.</li>
          </ul>
        </p>
        <button onClick={onClose}>Close Info</button>
      </div>
    </div>
  );
}

/* -------------------- Inventory Component -------------------- */
function Inventory({ inventory, backendUrl, onOpenChest }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: "4px",
        justifyItems: "center",
      }}
    >
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

/* -------------------- RecordsList -------------------- */
function RecordsList({
  backendUrl,
  showMyGames,
  userAddress,
  onSelectRecord,
  refreshKey,
}) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [skip, setSkip] = useState(0);
  const LIMIT = 10;

  const fetchRecords = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const endpoint = showMyGames
        ? `${backendUrl}/api/records/${userAddress}`
        : `${backendUrl}/api/allRecords`;
      const res = await fetch(`${endpoint}?skip=${skip}&limit=${LIMIT}`);
      const { records: newRecs = [] } = await res.json();
      setRecords(r => [...r, ...newRecs]);
      setHasMore(newRecs.length === LIMIT);
      setSkip(s => s + newRecs.length);
    } catch (err) {
      console.error("Error fetching records:", err);
    } finally {
      setLoading(false);
    }
  }, [backendUrl, showMyGames, userAddress, skip, hasMore, loading]);

  // reset when switching modes or refreshKey changes
  useEffect(() => {
    setRecords([]);
    setSkip(0);
    setHasMore(true);
  }, [showMyGames, refreshKey]);

  // initial & pagination load
  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  return (
    <div className="records-list-container">
      {records.length === 0 && !loading ? (
        <p>No records found.</p>
      ) : (
        <ul className="game-records-list">
          {records.map(rec => (
            <li
              key={rec.gameId}
              className="record-item"
              onClick={() => onSelectRecord(rec)}
              style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: "8px" }}
            >
              {rec.thumbnail && (
                <img
                  src={resolveAssetUrl(rec.thumbnail)}
                  alt={`Game #${rec.gameId}`}
                  style={{ width: 50, height: 50, objectFit: "cover", borderRadius: 4 }}
                 />
                )}

              <div>
                <div><strong>Game #{rec.gameId}</strong></div>
                <div>Winner: {rec.winner}</div>
                <div style={{ fontSize: "0.8em", color: "#aaa" }}>
                  {rec.timestamp && new Date(rec.timestamp).toLocaleString()}
                </div>
              </div>
            </li>
          ))}
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

/* -------------------- LorePanel -------------------- */
function LorePanel({ onClose, ownedSkins }) {
  const [panelSize, setPanelSize] = useState(400);
  useEffect(() => {
    function handleResize() {
      const size = Math.min(window.innerWidth, window.innerHeight);
      setPanelSize(size);
    }
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const [selectedLore, setSelectedLore] = useState(null);
  const bakedIdList = ownedSkins.map((item) => item.bakedId);
  const GRID_COLUMNS = 32;
  const TOTAL_SKINS = 1024;
  const CELL_SIZE = panelSize / GRID_COLUMNS;

  function getSkinCoords(skinId) {
    return {
      x: (skinId % GRID_COLUMNS) * CELL_SIZE,
      y: Math.floor(skinId / GRID_COLUMNS) * CELL_SIZE,
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
          width: panelSize,
          height: panelSize,
          margin: "0 auto",
          overflow: "hidden",
          backgroundColor: "#000",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* This is the "big" 1024-skin image: */}
        <img
          src={`${backendUrl}/skins/whole.png`}
          alt="All Skins"
          style={{ width: panelSize, height: panelSize, objectFit: "cover" }}
        />
        {Array.from({ length: TOTAL_SKINS }, (_, i) => {
          const { x, y } = getSkinCoords(i);
          const isOwned = bakedIdList.includes(i);
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: x,
                top: y,
                width: CELL_SIZE,
                height: CELL_SIZE,
                backgroundColor: isOwned ? "transparent" : "rgba(128,128,128,0.5)",
                cursor: isOwned ? "pointer" : "not-allowed",
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
          zIndex: 6000,
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
              style={{
                width: "250px",
                height: "auto",
                border: "1px solid #fff",
                borderRadius: "8px",
              }}
            />
            <div style={{ flex: 1 }}>
              <div
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
              >
                <h2 style={{ color: "#ff00e2", margin: 0 }}>
                  {selectedLore.title || `Skin #${selectedLore.skinId}`}
                </h2>
              </div>
              {selectedLore.subtitle && (
                <h4 style={{ color: "#fff", marginTop: "0.5rem" }}>{selectedLore.subtitle}</h4>
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
                  overflowY: "auto",
                }}
              >
                {Object.entries(selectedLore).map(([key, value]) => {
                  if (key === "image" || key === "skinId") return null;
                  return (
                    <div key={key} style={{ marginBottom: "8px" }}>
                      <strong style={{ textTransform: "capitalize" }}>{key}:</strong>
                      <span style={{ marginLeft: "5px" }}>
                        {typeof value === "object" ? JSON.stringify(value, null, 2) : value}
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

/* -------------------- WholeSkinsPanel -------------------- */
function WholeSkinsPanel({
  onClose,
  chestOpenerContract,
  skinLockAddress,
  userAddress,
  ownedSkins,
  fetchOwnedSkins,
  skinLockContract,
}) {
  const [panelSize, setPanelSize] = useState(400);
  useEffect(() => {
    function handleResize() {
      const size = Math.min(window.innerWidth, window.innerHeight);
      setPanelSize(size);
    }
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const bakedIdList = ownedSkins.map((item) => item.bakedId);
  const GRID_COLUMNS = 32;
  const TOTAL_SKINS = 1024;
  const CELL_SIZE = panelSize / GRID_COLUMNS;

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
      const tx = await chestOpenerContract["safeTransferFrom(address,address,uint256,bytes)"](
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
      y: Math.floor(skinId / GRID_COLUMNS) * CELL_SIZE,
    };
  }

  return (
    <div className="whole-skins-overlay" onClick={onClose} style={{ cursor: "auto" }}>
      <div
        style={{
          position: "relative",
          width: panelSize,
          height: panelSize,
          margin: "0 auto",
          overflow: "hidden",
          backgroundColor: "#000",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={`${backendUrl}/skins/whole.png`}
          alt="All Skins"
          style={{ width: panelSize, height: panelSize, objectFit: "cover" }}
        />
        {Array.from({ length: TOTAL_SKINS }, (_, i) => {
          const isOwned = bakedIdList.includes(i);
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
                backgroundColor: isOwned ? "transparent" : "rgba(128,128,128,0.5)",
                cursor: isOwned ? "pointer" : "not-allowed",
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

/* -------------------- Main App Component -------------------- */
function App() {
  const LEFT_PANEL_WIDTH = 300;
  const RIGHT_PANEL_WIDTH = 300;
  const TOP_BAR_HEIGHT = 100;
  const MIN_BOARD_SIZE = 280;

  // Age verification
  const [isVerified, setIsVerified] = useState(false);

  // Info panel
  const [showInfoPanel, setShowInfoPanel] = useState(false);

  // Mizontresh overlay
  const [showMizontreshOverlay, setShowMizontreshOverlay] = useState(false);

  // Contracts
  const [boardSize, setBoardSize] = useState(MIN_BOARD_SIZE);
  const [userAddress, setUserAddress] = useState("");
  const [gameContract, setGameContract] = useState(null);
  const [bettingContract, setBettingContract] = useState(null);
  const [chestMinterContract, setChestMinterContract] = useState(null);
  const [chestOpenerContract, setChestOpenerContract] = useState(null);
  const [skinLockContract, setSkinLockContract] = useState(null);
  const [mizontreshContract, setMizontreshContract] = useState(null);

  // General state
  const [mizonsBalance, setMizonsBalance] = useState("0");
  const [phaseData, setPhaseData] = useState({ phase: "picking", timeLeft: 30, gameId: 1 });
  const [teamCounts, setTeamCounts] = useState({ red: 0, blue: 0 });
  const [userTeam, setUserTeam] = useState(0);
  const [status, setStatus] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Board state
  const [liveBoard, setLiveBoard] = useState(Array(4096).fill({ value: 0 }));
  const [boardHistory, setBoardHistory] = useState([]);
  const [liveReplayIndex, setLiveReplayIndex] = useState(-1);
  const [liveAutoReplay, setLiveAutoReplay] = useState(false);

  // Records
  const [showMyGames, setShowMyGames] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [selectedHistory, setSelectedHistory] = useState(null);
  const [selectedReplayIndex, setSelectedReplayIndex] = useState(-1);
  const [selectedAutoReplay, setSelectedAutoReplay] = useState(false);

  // Bets
  const [liveRedBets, setLiveRedBets] = useState(0);
  const [liveBlueBets, setLiveBlueBets] = useState(0);
  const [betAmount, setBetAmount] = useState(1);

  // Chests
  const [inventory, setInventory] = useState([]);

  // Chest animation
  const [chestAnimation, setChestAnimation] = useState({
    active: false,
    step: null,
    data: null,
    chestType: null,
    frame: 1,
  });
  const [lastWinnerMsg, setLastWinnerMsg] = useState("");
  const [showWinOverlay, setShowWinOverlay] = useState(false);

  // Skins
  const [ownedSkins, setOwnedSkins] = useState([]); // each has { tokenId, bakedId }
  const [showWholeSkins, setShowWholeSkins] = useState(false);
  const [showLorePanel, setShowLorePanel] = useState(false);

  // Skin overlay
  const [skinOverlay, setSkinOverlay] = useState(Array(4096).fill(0));

  const socketRef = useRef(null);
   /**
 * Given either a full URL or a bare path,
 * rewrite it to always point at our `backendUrl`.
 */
function resolveAssetUrl(raw) {
  if (!raw) return "";
  try {
    // if it's a full URL, grab its pathname
    const u = new URL(raw);
    return `${backendUrl}${u.pathname}`;
  } catch {
    // otherwise it's already a path like "/images/..."
    return raw.startsWith("/")
      ? `${backendUrl}${raw}`
      : `${backendUrl}/${raw}`;
  }
}

  // Poll skin overlay
  useEffect(() => {
    async function fetchSkinOverlay() {
      try {
        const res = await fetch(`${backendUrl}/api/skinOverlay`);
        const data = await res.json();
        if (data.skinOverlay) setSkinOverlay(data.skinOverlay);
      } catch (err) {
        console.error("Error fetching skin overlay:", err);
      }
    }
    fetchSkinOverlay();
    const interval = setInterval(fetchSkinOverlay, 1000);
    return () => clearInterval(interval);
  }, []);

  // Handle board sizing
  useEffect(() => {
    function handleResize() {
      const availableWidth = window.innerWidth - (LEFT_PANEL_WIDTH + RIGHT_PANEL_WIDTH + 50);
      const availableHeight = window.innerHeight - (TOP_BAR_HEIGHT + 50);
      const baseSize = Math.min(availableWidth, availableHeight);
      setBoardSize(Math.max(MIN_BOARD_SIZE, baseSize));
    }
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Force the body to 100% height
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
    setMizontreshContract(null);
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

  // Socket setup
  useEffect(() => {
    socketRef.current = io(backendUrl, { transports: ["websocket"] });
    socketRef.current.on("connect", () => console.log("Socket connected:", socketRef.current.id));
    socketRef.current.on("phaseUpdated", (data) => setPhaseData(data));
    socketRef.current.on("boardUpdated", (augmentedBoard) => {
      if (liveReplayIndex < 0 && !selectedHistory) {
        setLiveBoard(augmentedBoard);
      }
    });
    socketRef.current.on("newGameRecord", async () => {
      setRefreshKey((prev) => prev + 1);
    
      try {
        // grab the latest record
        const res = await fetch(`${backendUrl}/api/allRecords?skip=0&limit=1`);
        const json = await res.json();
        const rec = json.records?.[0];
        let msg = "Nobody Won";
        if (rec?.winner === "Red")   msg = "Red Won";
        else if (rec?.winner === "Blue") msg = "Blue Won";
    
        setLastWinnerMsg(msg);
        setShowWinOverlay(true);
        // auto‑hide after 5s
        setTimeout(() => setShowWinOverlay(false), 5000);
      } catch (err) {
        console.error("Failed to fetch last winner:", err);
      }
    });
    socketRef.current.on("disconnect", () => console.log("Socket disconnected"));
    return () => socketRef.current.disconnect();
  }, [liveReplayIndex, selectedHistory]);

  // Periodically fetch phaseData
  useEffect(() => {
    const interval = setInterval(() => {
      fetch(`${backendUrl}/api/state`)
        .then((res) => res.json())
        .then((data) => setPhaseData(data))
        .catch((err) => console.error("Error fetching state:", err));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Setup contracts when wallet is connected
  useEffect(() => {
    if (!window.ethereum || !userAddress) return;
    if (
      !gameAddress ||
      !bettingAddress ||
      !mizonsAddress ||
      !chestMinterAddress ||
      !chestOpenerAddress ||
      !mizontreshAddress
    ) {
      setErrorMsg("Missing contract addresses in env variables.");
      return;
    }
    async function setup() {
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

        if (
          skinLockAddress &&
          skinLockAddress !== "0x0000000000000000000000000000000000000000"
        ) {
          const lockC = new ethers.Contract(skinLockAddress, skinLockABI, signer);
          setSkinLockContract(lockC);
        }
        const mizontreshC = new ethers.Contract(mizontreshAddress, mizontreshABI, signer);
        setMizontreshContract(mizontreshC);
      } catch (err) {
        console.error("Error setting up contracts:", err);
        setErrorMsg("Error setting up contracts: " + err.message);
      }
    }
    setup();
  }, [userAddress]);

  // Periodically fetch bets for current game
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

  // Periodically fetch board history
  useEffect(() => {
    const interval = setInterval(() => {
      fetch(`${backendUrl}/api/history`)
        .then((res) => res.json())
        .then((data) => setBoardHistory(data.boardHistory || []))
        .catch((err) => console.error("loadHistory error:", err));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Poll the live board if in "placing" and not replaying
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

  // Live board auto replay
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

  // Poll team counts
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
          console.error("Error fetching team info:", err);
        }
      })();
    }, 1000);
    return () => clearInterval(interval);
  }, [gameContract, userAddress, selectedHistory, liveReplayIndex, phaseData.gameId]);

  // Poll MIZ balance
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
        const chestTypeBN = await chestMinterContract.tokenFrame(tokenId);
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

  // Fetch Owned Skins from chestOpener
  // Fetch Owned Skins from ChestOpener
const fetchOwnedSkinsFromOpener = useCallback(async () => {
  if (!chestOpenerContract || !userAddress) return;
  try {
    const itemBalanceBN = await chestOpenerContract.balanceOf(userAddress);
    const itemBalance   = Number(itemBalanceBN);
    const skins = [];
    for (let i = 0; i < itemBalance; i++) {
      const tokenIdBN     = await chestOpenerContract.tokenOfOwnerByIndex(userAddress, i);
      const awardedItemBN = await chestOpenerContract.tokenAwardedItem(tokenIdBN);
      skins.push({
        tokenId: Number(tokenIdBN),
        bakedId: Number(awardedItemBN)
      });
    }
    setOwnedSkins(skins);
  } catch (err) {
    console.error("Error fetching owned skins:", err);
  }
}, [chestOpenerContract, userAddress, status]);

useEffect(() => {
  fetchOwnedSkinsFromOpener();
}, [chestOpenerContract, userAddress, status, fetchOwnedSkinsFromOpener]);

  // Select a record
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
  function WinOverlay({ message }) {
    return (
      <div className="victory-overlay"
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.7)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
          zIndex: 1000,           // lower than your menus/controls
        }}
      >
        <div className="victory-message"><h1 style={{ color: "#fff", fontSize: "4rem", textAlign: "center" }}>
          {message}
        </h1></div>
      </div>
    );
  }
  
  // Join a team
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

  // Place square
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
      const tx = await gameContract.placeSquare(x, y, {
           value: ethers.parseEther("0.00001")   // match your PLACE_FEE in the contract
         });
      await tx.wait();
      setStatus("Square placed!");
      setErrorMsg("");
    } catch (err) {
      console.error("placeSquare error:", err);
      setErrorMsg("placeSquare error: " + err.message);
    }
  }

  // Approve MIZ tokens for chest purchase
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
        gasLimit: 100000,
      });
      await tx.wait();
      alert("Approval successful!");
    } catch (err) {
      console.error("Approval error:", err);
      alert("Approval failed: " + err.message);
    }
  }

  // Place bet
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
      setStatus(`Placing ${betAmount} ticket${betAmount>1?"s":""} on ${teamId === 1 ? "Red" : "Blue"}...`);
  
      const pricePerTicket = ethers.parseEther("0.00005"); // your contract’s ticket price
  
      // loop N times, each with tickets=1
      for (let i = 0; i < betAmount; i++) {
        const tx = await bettingContract.placeBet(
          teamId,
          1,                      // always 1 ticket per call
          { value: pricePerTicket }
        );
        await tx.wait();
      }
  
      setStatus(`${betAmount} ticket${betAmount>1?"s":"" } placed on ${teamId === 1 ? "Red" : "Blue"}!`);
      setErrorMsg("");
    } catch (err) {
      console.error("Bet failed:", err);
      setErrorMsg("Bet failed: " + (err.reason||err.message));
    }
  }
   
  // Mint chest
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
      // Step 1: "brain"
      setChestAnimation({
        active: true,
        step: "brain",
        chestType: null,
        frame: 0,
        data: { image: `${backendUrl}/chests/brain.png` },
      });
      await new Promise((resolve) => setTimeout(resolve, 1500));
  
      // Step 2: "stir"
      setChestAnimation({
        active: true,
        step: "stir",
        chestType: null,
        frame: 0,
        data: { image: `${backendUrl}/chests/brain.png` },
      });
      await new Promise((resolve) => setTimeout(resolve, 1500));
  
      // Actual mint — now sending 0.0001 ETH!
      const mintPrice = ethers.parseEther("0.0001");
      const tx = await chestMinterContract.mintRandomChest({
        value: mintPrice,
        gasLimit: 400_000
      });
      await tx.wait();
      await new Promise((resolve) => setTimeout(resolve, 800));
  
      // Refresh inventories
      refreshInventory();
      fetchOwnedSkinsFromOpener();
  
      // Find newly minted chest
      const balanceBN   = await chestMinterContract.balanceOf(userAddress);
      const balance     = Number(balanceBN);
      const tokenIdBN   = await chestMinterContract.tokenOfOwnerByIndex(userAddress, balance - 1);
      const tokenId     = Number(tokenIdBN);
      const chestTypeBN = await chestMinterContract.tokenFrame(tokenId);
      const chestType   = Number(chestTypeBN);
  
      // Fetch metadata for reveal
      const metadataUrl = `${backendUrl}/chests/var/${chestType}.json`;
      const imageUrl    = `${backendUrl}/chests/icons/chest${chestType}/frame1.png`;
      const response    = await fetch(metadataUrl);
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      const metadata    = await response.json();
      metadata.image    = imageUrl;
  
      // "revealed"
      setChestAnimation({
        active: true,
        step: "revealed",
        data: metadata,
        chestType,
        frame: 0,
      });
      await new Promise((resolve) => setTimeout(resolve, 1500));
  
    } catch (err) {
      // try to unwrap nested JSON‑RPC revert reason
      const rpc = err.data ?? err.error?.data;
      const reason = rpc?.message || err.message;
      console.error("Error minting chest:", reason, rpc);
      alert("Chest minting failed: " + reason);
  
    } finally {
      setChestAnimation({
        active: false,
        step:    null,
        data:    null,
        chestType: null,
        frame:   0,
      });
    }
  }
  

  async function handleOpenChest(tokenId) {
    const chest = inventory.find((c) => c.tokenId === tokenId);
    if (!chest) {
      alert("Chest not found in inventory.");
      return;
    }
  
    // start the 5‑frame “opening” animation
    setChestAnimation({
      active: true,
      step: "opening",
      chestType: chest.type,
      frame: 1,
      data: null,
    });
    for (let i = 1; i <= 5; i++) {
      setChestAnimation((prev) => ({ ...prev, frame: i }));
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  
    try {
      // 1) allow the opener contract to pull your chest NFT
      const approveTx = await chestMinterContract.approve(chestOpenerAddress, tokenId);
      await approveTx.wait();
  
      // 2) actually transfer the chest into the opener (fires your burn hook)
      const transferTx = await chestMinterContract["safeTransferFrom(address,address,uint256,bytes)"](
        userAddress,
        chestOpenerAddress,
        tokenId,
        "0x"
      );
      await transferTx.wait();
  
      // 3) pay the ETH fee and mint the new item
      const openTx = await chestOpenerContract.openChest(tokenId, {
        value: ethers.parseEther("0.001"),
      });
      await openTx.wait();
  
      // now load the newly minted item
      const newItemIdBN = await chestOpenerContract.itemCounter();
      const newItemId = Number(newItemIdBN) - 1;
      const awardedItemBN = await chestOpenerContract.tokenAwardedItem(newItemId);
      const awardedItem = Number(awardedItemBN);
  
      // fetch its metadata
      const imageUrl = `${backendUrl}/skins/icons/${awardedItem}.png`;
      const metadataUrl = `${backendUrl}/skins/text1/${awardedItem}.json`;
      const response = await fetch(metadataUrl);
      if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
      const metadata = await response.json();
      metadata.image = imageUrl;
  
      // show the reveal
      setChestAnimation({
        active: true,
        step: "revealed",
        data: metadata,
        chestType: chest.type,
        frame: 0,
      });
      await new Promise((resolve) => setTimeout(resolve, 1500));
    } catch (err) {
      console.error("Error opening chest:", err);
      alert("Failed to open chest: " + err.message);
    } finally {
      // tear down animation and refresh state
      setChestAnimation({
        active: false,
        step: null,
        data: null,
        chestType: null,
        frame: 0,
      });
      refreshInventory();
      fetchOwnedSkinsFromOpener();
    }
  }
  
  function recordGoBackToLive() {
    setSelectedRecord(null);
    setSelectedHistory(null);
    setSelectedReplayIndex(-1);
    setSelectedAutoReplay(false);
  }

  if (!isVerified) {
    return (
      <AgeVerification
        onVerify={(answer) => {
          if (answer) setIsVerified(true);
          else window.location.href = "about:blank";
        }}
      />
    );
  }

  // Decide which board to show (live vs record)
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

  // Which skin overlay?
  const currentSkinGrid =
    selectedRecord && selectedRecord.skinHistory && selectedHistory
      ? selectedReplayIndex >= 0
        ? selectedRecord.skinHistory[selectedReplayIndex]
        : selectedRecord.skinHistory[selectedRecord.skinHistory.length - 1]
      : skinOverlay;

  // scoreboard stats
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

  const showVeil = phaseData.phase === "placing" && !selectedHistory && liveReplayIndex < 0;

  // For Mizontresh lore gating
  const uniqueSkinsCount = ownedSkins.length;

  return (
    <div className="app-container" style={{ margin: 0, padding: 0, height: "100vh" }}>
      <MusicPlayer backendUrl={backendUrl} />
      {showWinOverlay && <WinOverlay message={lastWinnerMsg} />}

      {showInfoPanel && <InfoPanel onClose={() => setShowInfoPanel(false)} />}
      {showMizontreshOverlay && mizontreshContract && (
        <MizontreshOverlay
          onClose={() => setShowMizontreshOverlay(false)}
          mizontreshContract={mizontreshContract}
          skinLockAddress={skinLockAddress}
          skinLockContract={skinLockContract}
          userAddress={userAddress}
          refreshInventory={refreshInventory}
          numUniqueSkins={uniqueSkinsCount}
        />
      )}

      {/* Chest Animation Overlay */}
      {chestAnimation.active && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.8)",
            zIndex: 9999,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
          onClick={() => {
            if (chestAnimation.step === "revealed") {
              setChestAnimation({
                active: false,
                step: null,
                data: null,
                chestType: null,
                frame: 0,
              });
            }
          }}
        >
          <div style={{ textAlign: "center", color: "#fff" }}>
            {chestAnimation.step === "brain" && (
              <div>
                <h2>Gathering Brain Matter...</h2>
                <img src={chestAnimation.data.image} alt="Brain" style={{ width: "200px" }} />
              </div>
            )}
            {chestAnimation.step === "stir" && (
              <div>
                <h2>Stirring Brain Soup...</h2>
                <img src={chestAnimation.data.image} alt="Brain" style={{ width: "200px" }} />
              </div>
            )}
            {chestAnimation.step === "opening" && (
              <div>
                <h2>Opening Chest (Frame {chestAnimation.frame} of 5)</h2>
                <img
                  src={`${backendUrl}/chests/icons/chest${chestAnimation.chestType}/frame${chestAnimation.frame}.png`}
                  alt="Opening Chest"
                  style={{ width: "200px" }}
                />
              </div>
            )}
            {chestAnimation.step === "revealed" && (
              <div>
                <h2>Revealed!</h2>
                {chestAnimation.data?.image && (
                  <img
                    src={chestAnimation.data.image}
                    alt="Chest Reveal"
                    style={{ width: "200px" }}
                  />
                )}
                {chestAnimation.data?.title && <h3>{chestAnimation.data.title}</h3>}
                <p style={{ maxWidth: "300px", margin: "10px auto" }}>
                  (Click anywhere to close)
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="title-bar" style={{ textAlign: "center", marginBottom: "2px" }}>
        <h1 style={{ margin: 0, fontSize: "3rem" }}>Game of Death</h1>
      </div>

      <div className="scoreboard-bar-container" style={{ marginBottom: "4px" }}>
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
        {/* LEFT PANEL */}
        <div
          className="left-panel"
          style={{
            width: "300px",
            padding: "5px",
            boxSizing: "border-box",
            minHeight: "600px",
            overflowY: "auto",
          }}
        >
          <div
            className="red-panel"
            style={{
              width: "270px",
              padding: "10px",
              boxSizing: "border-box",
              minHeight: "80px",
              marginTop: "6px",
              height: "220px",
            }}
          >
            <div className="miz"><h2 className="section-title">Your MIZ</h2></div>
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
            )}
          </div>

          <div
            className="chest-roll-section"
            style={{ width: "270px", position: "relative", marginTop: "10px" }}
          >
            <div
              style={{ position: "relative", width: "100px", margin: "0 auto", cursor: "pointer" }}
              onClick={handleMintChest}
            >
              <img
                src={`${backendUrl}/chests/brain.png`}
                alt="Brain Chest"
                style={{ width: "100px", height: "auto" }}
              />
              <button
                className="chest-square-button lore-info"
                style={{ fontSize: "0.8rem" }}
                onClick={(e) => {
                  e.stopPropagation();
                  fetchOwnedSkinsFromOpener().then(() => setShowLorePanel(true));
                }}
              >
                Lore
              </button>
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
              <button
                className="chest-square-button stop"
                style={{
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#222",
                  border: "1px solid #ff00e2",
                  borderRadius: "4px",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMizontreshOverlay(true);
                }}
              >
                <img
                  src={`${backendUrl}/skins/icons/1024.png`}
                  alt="1024"
                  style={{ width: "70%", height: "70%", objectFit: "contain" }}
                />
              </button>
              <button
                className="chest-square-button info"
                style={{ fontSize: "0.8rem" }}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowInfoPanel(true);
                }}
              >
                INFO
              </button>
            </div>
            <div style={{ textAlign: "center", marginTop: "10px" }}>
              <button onClick={approveTokens}>Approve</button>
              <button onClick={handleMintChest} style={{ display: "block", margin: "6px auto" }}>
                Mint Chest
              </button>
            </div>
            <div
              className="inventory"
              style={{ marginTop: "6px", width: "255px", height: "64px", overflowY: "auto" }}
            >
              <h3 style={{ fontSize: "1rem", textAlign: "center", margin: "0 0 4px 0" }}>
                Your Inventory
              </h3>
              <Inventory inventory={inventory} backendUrl={backendUrl} onOpenChest={handleOpenChest} />
            </div>
          </div>

          <div style={{ marginTop: "10px", width: "100%" }}>
            <div className="phase-info-card" style={{ marginBottom: "8px" }}>
              <p style={{ margin: 0 }}>Phase: {phaseData.phase}</p>
              <p style={{ margin: 0 }}>
                Time Left: {phaseData.timeLeft > 0 ? phaseData.timeLeft : 0}s
              </p>
              <p style={{ margin: 0 }}>Game ID: {phaseData.gameId}</p>
            </div>
            <div className="yourteam"><p style={{ margin: "4px 0" }}>
              Your Team: {userTeam === 1 ? "Red" : userTeam === 2 ? "Blue" : "None"}
            </p></div>
            <div className="join-team-buttons" style={{ marginBottom: "6px" }}>
              <button
                className="join-red"
                onClick={() => joinTeam(1)}
                disabled={phaseData.phase !== "picking"}
              >
                Join Red
              </button>
              <button
                className="join-blue"
                onClick={() => joinTeam(2)}
                disabled={phaseData.phase !== "picking"}
              >
                Join Blue
              </button>
            </div>
            <div className="teamred" ><p style={{ margin: 0 }}>Team Red: {teamCounts.red}</p></div>
            <div className="teamblue" ><p style={{ margin: 0 }}>Team Blue: {teamCounts.blue}</p></div>
            <div className="betpanel" ><h3 style={{ margin: "8px 0 4px 0" }}>Bet Panel</h3></div>
            <div className="redbets" ><p style={{ margin: 0 }}>Red Bets: {liveRedBets}</p></div>
            <div className="bluebets" ><p style={{ margin: 0 }}>Blue Bets: {liveBlueBets}</p></div>
            <div className="tickets" ><p style={{ margin: 0 }}>Tickets: {betAmount}</p></div>
            <input
              type="range"
              min="1"
              max="10"
              value={betAmount}
              onChange={(e) => setBetAmount(Number(e.target.value))}
            />
            <div className="bet-buttons" style={{ marginTop: "6px" }}>
              <button
                className="bet-red"
                onClick={() => placeBet(1)}
                disabled={phaseData.phase !== "picking"}
              >
                Bet Red
              </button>
              <button
                className="bet-blue"
                onClick={() => placeBet(2)}
                disabled={phaseData.phase !== "picking"}
              >
                Bet Blue
              </button>
            </div>
          </div>
        </div>

        {/* CENTER BOARD */}
        <div className="center-board" style={{ position: "relative" }}>
          <div
            className="board-container"
            style={{
              width: boardSize,
              height: boardSize,
              marginBottom: "6px",
              position: "relative",
            }}
          >
            <div className="board-border" style={{ position: "relative" }}>
              {/* Veil the opposite side if needed */}
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
                    zIndex: 10,
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
                    zIndex: 10,
                  }}
                />
              )}

              {/* Base Board (Red/Blue) */}
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

              {/* Skin Overlay (same 64×64 grid, absolutely placed) */}
              <div className="skinz"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: boardSize,
                  height: boardSize,
                  zIndex: 5000,
                  pointerEvents: "none",
                  display: "grid",
                  gridTemplateColumns: "repeat(64, 1fr)",
                  gridTemplateRows: "repeat(64, 1fr)",
                }}
              >
                {currentSkinGrid.map((skin, i) =>
                             skin ? (
                              <img
                                     key={i}
                                     src={resolveAssetUrl(`/skins/icons/${skin}.png`)}
                                     style={{ width: "100%", height: "100%", objectFit: "contain" }}
                                     alt={`Skin ${skin}`}
                        />
                      ) : (
                          <div key={i} style={{ width: "100%", height: "100%" }} />
                      )
                    )}

              </div>
            </div>
          </div>
          {!selectedHistory && (
            <div style={{ marginBottom: "4px", textAlign: "center" }}>
              <span style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#fff" }}>LIVE</span>
            </div>
          )}
        </div>

        {/* RIGHT PANEL */}
        <div className="right-panel" style={{ width: "300px" }}>
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
              <div className="gamedetails" ><h3>Game #{selectedRecord.gameId} Details</h3></div>
              <p>
                Played at:{" "}
                {selectedRecord.timestamp
                  ? new Date(selectedRecord.timestamp).toLocaleString()
                  : "N/A"}
              </p>
              <div className="winner" ><p>Winner: {selectedRecord.winner}</p></div>
              <p>
                Team Red: {selectedRecord.teamRedCount} | Team Blue: {selectedRecord.teamBlueCount}
              </p>
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
                <button
                  onClick={() => {
                    setSelectedReplayIndex((prev) => {
                      if (selectedHistory.length === 0) return -1;
                      if (prev < 0) return selectedHistory.length - 1;
                      return Math.max(0, prev - 1);
                    });
                  }}
                >
                  ←
                </button>
                <button onClick={recordGoBackToLive}>Exit</button>
                <button
                  onClick={() => {
                    setSelectedReplayIndex((prev) => {
                      if (selectedHistory.length === 0) return -1;
                      if (prev < 0) return 0;
                      return Math.min(selectedHistory.length - 1, prev + 1);
                    });
                  }}
                >
                  →
                </button>
              </div>
              {selectedReplayIndex < 0 ? (
                <p>Viewing final snapshot</p>
              ) : (
                <p>
                  Turn {selectedReplayIndex + 1}/{selectedHistory.length}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Whole Skins / Lore Panels */}
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
      {showLorePanel && <LorePanel onClose={() => setShowLorePanel(false)} ownedSkins={ownedSkins} />}

      {errorMsg && (
        <div className="error-bar">
          {errorMsg}
          <button className="error-close" onClick={() => setErrorMsg("")}>
            x
          </button>
        </div>
      )}
    </div>
  );
}

export default App;

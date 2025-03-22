 // SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract GameOfDeath {
enum Phase { Picking, Placing, Conway, Over }
Phase public currentPhase;
uint256 public gameId;
 
 // Mapping from user => team (0 = none, 1 = red, 2 = blue)
 mapping(address => uint8) public team;
 uint256 public teamACount;
 uint256 public teamBCount;
 
 // Packed board
 uint256 constant CELLS_PER_CHUNK = 161;
 uint256 constant NUM_CHUNKS = 26;
 uint256[NUM_CHUNKS] public packedBoard;
 
 address public owner;
 bool public gameOver;
 
 event TeamChanged(address indexed user, uint8 newTeam, uint256 gameId);
 event SquarePlaced(address indexed user, uint256 x, uint256 y, uint8 color, uint256 gameId);
 event BoardOverwritten(uint256[NUM_CHUNKS] newPackedBoard);
 event PhaseChanged(Phase newPhase, uint256 gameId);
 event GameOver(uint256 gameId);
 event GameReset(uint256 newGameId);
 
 constructor() {
     owner = msg.sender;
     currentPhase = Phase.Picking;
     gameOver = false;
     gameId = 1;
     for (uint i = 0; i < NUM_CHUNKS; i++) {
         packedBoard[i] = 0;
     }
 }
 
 modifier onlyOwner() {
     require(msg.sender == owner, "Only owner can call");
     _;
 }
 
 modifier notOver() {
     require(currentPhase != Phase.Over, "Game is over");
     _;
 }
 
 // Join a team during the Picking phase.
 function joinTeam(uint8 teamId) external notOver {
     require(currentPhase == Phase.Picking, "Not in picking phase");
     require(teamId == 1 || teamId == 2, "Invalid team");
     uint8 currentTeam = team[msg.sender];
     if (currentTeam == teamId) return;
     if (currentTeam == 1 && teamACount > 0) {
         teamACount--;
     } else if (currentTeam == 2 && teamBCount > 0) {
         teamBCount--;
     }
     team[msg.sender] = teamId;
     if (teamId == 1) teamACount++;
     else teamBCount++;
     emit TeamChanged(msg.sender, teamId, gameId);
 }
 
 function placeSquare(uint256 x, uint256 y) external notOver {
     require(currentPhase == Phase.Placing, "Not in placing phase");
     require(x < 64 && y < 64, "Coordinates out of range");
     uint8 t = team[msg.sender];
     require(t == 1 || t == 2, "Not on a valid team");
     if (t == 1) {
         require(y < 32, "Red: top half only");
     } else {
         require(y >= 32, "Blue: bottom half only");
     }
     uint256 index = y * 64 + x;
     setCell(index, t);
     emit SquarePlaced(msg.sender, x, y, t, gameId);
 }

 function power3(uint256 exponent) internal pure returns (uint256 result) {
     result = 1;
     for (uint256 i = 0; i < exponent; i++) {
         result *= 3;
     }
 }
 
 function getCell(uint256 index) public view returns (uint8) {
     require(index < 4096, "Index out of range");
     uint256 chunkIndex = index / CELLS_PER_CHUNK;
     uint256 pos = index % CELLS_PER_CHUNK;
     uint256 chunk = packedBoard[chunkIndex];
     for (uint256 i = 0; i < pos; i++) {
         chunk /= 3;
     }
     return uint8(chunk % 3);
 }
 
 function setCell(uint256 index, uint8 value) internal {
     require(index < 4096, "Index out of range");
     uint256 chunkIndex = index / CELLS_PER_CHUNK;
     uint256 pos = index % CELLS_PER_CHUNK;
     uint256 factor = power3(pos);
     uint256 chunk = packedBoard[chunkIndex];
     uint8 currentDigit = uint8((chunk / factor) % 3);
     require(currentDigit == 0, "Cell occupied");
     packedBoard[chunkIndex] = chunk + uint256(value) * factor;
 }
 
 function serverOverwriteBoard(uint256[NUM_CHUNKS] calldata newPackedBoard) external onlyOwner notOver {
     require(currentPhase == Phase.Conway, "Not in Conway phase");
     for (uint i = 0; i < NUM_CHUNKS; i++) {
         packedBoard[i] = newPackedBoard[i];
     }
     emit BoardOverwritten(newPackedBoard);
 }
 
 function setPhase(Phase newPhase) external onlyOwner notOver {
     currentPhase = newPhase;
     emit PhaseChanged(newPhase, gameId);
 }
 
 function endGame() external onlyOwner notOver {
     gameOver = true;
     currentPhase = Phase.Over;
     emit GameOver(gameId);
 }
 
 function newGame(uint256 _newGameId) external onlyOwner {
     for (uint i = 0; i < NUM_CHUNKS; i++) {
         packedBoard[i] = 0;
     }
     teamACount = 0;
     teamBCount = 0;
     gameOver = false;
     currentPhase = Phase.Picking;
     gameId = _newGameId;
     emit GameReset(_newGameId);
     emit PhaseChanged(currentPhase, gameId);
 }
 
 function getTeam(address user) external view returns (uint8) {
     return team[user];
 }
 
 function getBoard() external view returns (uint256[NUM_CHUNKS] memory) {
     return packedBoard;
 }
 }
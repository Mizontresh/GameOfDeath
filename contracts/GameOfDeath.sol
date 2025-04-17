// contracts/GameOfDeath.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract GameOfDeath {
    enum Phase { Picking, Placing, Conway, Final }
    Phase public currentPhase;
    uint256 public currentGameId;

    mapping(uint256 => mapping(address => uint8)) public gameTeams;
    mapping(uint256 => uint256) public redCountForGame;
    mapping(uint256 => uint256) public blueCountForGame;

    uint256 constant CELLS_PER_CHUNK = 161;
    uint256 constant NUM_CHUNKS = 26;
    uint256[NUM_CHUNKS] public packedBoard;

    address public owner;

    uint256 public constant PLACE_FEE = 0.00001 ether;
    address public constant feeRecipient = 0x1219819360136A93AC14E4df0A90125cf9927616;

    event TeamJoined(uint256 indexed gameId, address indexed user, uint8 teamId);
    event SquarePlaced(uint256 indexed gameId, address indexed user, uint256 x, uint256 y, uint8 color);
    event BoardOverwritten(uint256[NUM_CHUNKS] newPackedBoard);
    event PhaseChanged(Phase newPhase, uint256 gameId);
    event GameReset(uint256 newGameId);

    constructor() {
        owner = msg.sender;
        currentPhase = Phase.Picking;
        currentGameId = 1;
        for (uint i = 0; i < NUM_CHUNKS; i++) packedBoard[i] = 0;
    }

    modifier onlyOwner() { require(msg.sender == owner, "only owner"); _; }
    modifier inPhase(Phase p) { require(currentPhase == p, "phase"); _; }

    function joinTeam(uint256 gameId, uint8 teamId) external inPhase(Phase.Picking) {
        require(gameId == currentGameId, "wrong game");
        require(teamId == 1 || teamId == 2, "invalid");
        uint8 old = gameTeams[gameId][msg.sender];
        if (old == teamId) return;
        if (old == 1 && redCountForGame[gameId] > 0) redCountForGame[gameId]--;
        if (old == 2 && blueCountForGame[gameId] > 0) blueCountForGame[gameId]--;
        gameTeams[gameId][msg.sender] = teamId;
        if (teamId == 1) redCountForGame[gameId]++; else blueCountForGame[gameId]++;
        emit TeamJoined(gameId, msg.sender, teamId);
    }

    function placeSquare(uint256 x, uint256 y) external payable inPhase(Phase.Placing) {
        require(msg.value >= PLACE_FEE, "fee");
        (bool sent,) = payable(feeRecipient).call{value:PLACE_FEE}(""); require(sent,"fee fail");
        if (msg.value > PLACE_FEE) payable(msg.sender).call{value:msg.value-PLACE_FEE}("");

        require(x < 64 && y < 64, "oob");
        uint8 t = gameTeams[currentGameId][msg.sender];
        require(t == 1 || t == 2, "not on team");
        if (t == 1) require(y < 32, "top"); else require(y >= 32, "bot");
        uint256 idx = y * 64 + x;
        setCell(idx, t);
        emit SquarePlaced(currentGameId, msg.sender, x, y, t);
    }

    function power3(uint256 e) internal pure returns (uint256 r) {
        r = 1; for (uint i = 0; i < e; i++) r *= 3;
    }

    function serverOverwriteBoard(uint256[NUM_CHUNKS] calldata b) external onlyOwner inPhase(Phase.Conway) {
        for (uint i = 0; i < NUM_CHUNKS; i++) packedBoard[i] = b[i];
        emit BoardOverwritten(b);
    }

    function setPhase(Phase p) external onlyOwner {
        currentPhase = p;
        emit PhaseChanged(p, currentGameId);
    }

    function newGame(uint256 gid) external onlyOwner {
        for (uint i = 0; i < NUM_CHUNKS; i++) packedBoard[i] = 0;
        redCountForGame[gid] = 0; blueCountForGame[gid] = 0;
        currentGameId = gid; currentPhase = Phase.Picking;
        emit GameReset(gid); emit PhaseChanged(Phase.Picking, gid);
    }

    function getBoard() external view returns (uint256[NUM_CHUNKS] memory) {
        return packedBoard;
    }

    function getTeamCounts(uint256 gid) external view returns (uint256 r, uint256 b) {
        return (redCountForGame[gid], blueCountForGame[gid]);
    }

    function getTeam(uint256 gid, address u) external view returns (uint8) {
        return gameTeams[gid][u];
    }

    function setCell(uint256 idx, uint8 v) internal {
        require(idx < 4096, "oob");
        uint256 ci = idx / CELLS_PER_CHUNK;
        uint256 pos = idx % CELLS_PER_CHUNK;
        uint256 f   = power3(pos);
        uint256 c   = packedBoard[ci];
        require(uint8((c / f) % 3) == 0, "occupied");
        packedBoard[ci] = c + uint256(v) * f;
    }

    function getCell(uint256 idx) public view returns (uint8) {
        require(idx < 4096, "oob");
        uint256 ci  = idx / CELLS_PER_CHUNK;
        uint256 pos = idx % CELLS_PER_CHUNK;
        uint256 c   = packedBoard[ci];
        for (uint i = 0; i < pos; i++) c /= 3;
        return uint8(c % 3);
    }

    function withdrawEther(address payable to) external onlyOwner {
        uint256 bal = address(this).balance;
        (bool ok,) = to.call{value:bal}(""); require(ok,"fail");
    }
}

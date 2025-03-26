// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract GameOfDeath {
    enum Phase { Picking, Placing, Conway, Final }
    Phase public currentPhase;
    uint256 public currentGameId;

    // Mapping: for each game, map each player to their team (0 = none, 1 = red, 2 = blue)
    mapping(uint256 => mapping(address => uint8)) public gameTeams;

    // Keep track of how many players are on each team for each game
    mapping(uint256 => uint256) public redCountForGame;
    mapping(uint256 => uint256) public blueCountForGame;

    // Global board (for current game only)
    uint256 constant CELLS_PER_CHUNK = 161;
    uint256 constant NUM_CHUNKS = 26;
    uint256[NUM_CHUNKS] public packedBoard;

    address public owner;

    // Events
    event TeamJoined(uint256 indexed gameId, address indexed user, uint8 teamId);
    event SquarePlaced(uint256 indexed gameId, address indexed user, uint256 x, uint256 y, uint8 color);
    event BoardOverwritten(uint256[NUM_CHUNKS] newPackedBoard);
    event PhaseChanged(Phase newPhase, uint256 gameId);
    event GameReset(uint256 newGameId);

    constructor() {
        owner = msg.sender;
        currentPhase = Phase.Picking;
        currentGameId = 1;
        for (uint i = 0; i < NUM_CHUNKS; i++) {
            packedBoard[i] = 0;
        }
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call");
        _;
    }

    modifier inPhase(Phase p) {
        require(currentPhase == p, "Invalid phase");
        _;
    }

    // Join a team for the current game. (Only during Picking phase.)
    function joinTeam(uint256 gameId, uint8 teamId) external inPhase(Phase.Picking) {
        require(gameId == currentGameId, "Not the current game");
        require(teamId == 1 || teamId == 2, "Invalid team");
        if (gameTeams[gameId][msg.sender] == teamId) {
            return;
        }
        uint8 oldTeam = gameTeams[gameId][msg.sender];
        if (oldTeam == 1 && redCountForGame[gameId] > 0) {
            redCountForGame[gameId]--;
        } else if (oldTeam == 2 && blueCountForGame[gameId] > 0) {
            blueCountForGame[gameId]--;
        }
        gameTeams[gameId][msg.sender] = teamId;
        if (teamId == 1) {
            redCountForGame[gameId]++;
        } else {
            blueCountForGame[gameId]++;
        }
        emit TeamJoined(gameId, msg.sender, teamId);
    }

    // Place a square (only during Placing phase).
    function placeSquare(uint256 x, uint256 y) external inPhase(Phase.Placing) {
        require(x < 64 && y < 64, "Coordinates out of range");
        uint8 t = gameTeams[currentGameId][msg.sender];
        require(t == 1 || t == 2, "Not on a valid team for current game");
        if (t == 1) {
            require(y < 32, "Red: top half only");
        } else {
            require(y >= 32, "Blue: bottom half only");
        }
        uint256 index = y * 64 + x;
        setCell(index, t);
        emit SquarePlaced(currentGameId, msg.sender, x, y, t);
    }

    // Helper: computes 3^exponent.
    function power3(uint256 exponent) internal pure returns (uint256 result) {
        result = 1;
        for (uint i = 0; i < exponent; i++) {
            result *= 3;
        }
    }

    // Overwrite the board (only allowed in Conway phase).
    function serverOverwriteBoard(uint256[NUM_CHUNKS] calldata newPacked) external onlyOwner inPhase(Phase.Conway) {
        for (uint i = 0; i < NUM_CHUNKS; i++) {
            packedBoard[i] = newPacked[i];
        }
        emit BoardOverwritten(newPacked);
    }

    // Change phase (only owner).
    function setPhase(Phase p) external onlyOwner {
        currentPhase = p;
        emit PhaseChanged(p, currentGameId);
    }

    // Reset the game: clear the board, reset counts, and update the game id.
    function newGame(uint256 _newGameId) external onlyOwner {
        for (uint i = 0; i < NUM_CHUNKS; i++) {
            packedBoard[i] = 0;
        }
        redCountForGame[_newGameId] = 0;
        blueCountForGame[_newGameId] = 0;
        currentGameId = _newGameId;
        currentPhase = Phase.Picking;
        emit GameReset(_newGameId);
        emit PhaseChanged(Phase.Picking, _newGameId);
    }

    // Get the board.
    function getBoard() external view returns (uint256[NUM_CHUNKS] memory) {
        return packedBoard;
    }

    // Get team counts for a game.
    function getTeamCounts(uint256 gameId) external view returns (uint256 redCount, uint256 blueCount) {
        redCount = redCountForGame[gameId];
        blueCount = blueCountForGame[gameId];
    }

    // Get the team for a user in a given game.
    function getTeam(uint256 gameId, address user) external view returns (uint8) {
        return gameTeams[gameId][user];
    }

    // Internal function to set a cell.
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

    // Read a cell.
    function getCell(uint256 index) public view returns (uint8) {
        require(index < 4096, "Index out of range");
        uint256 chunkIndex = index / CELLS_PER_CHUNK;
        uint256 pos = index % CELLS_PER_CHUNK;
        uint256 chunk = packedBoard[chunkIndex];
        for (uint i = 0; i < pos; i++) {
            chunk /= 3;
        }
        return uint8(chunk % 3);
    }
}

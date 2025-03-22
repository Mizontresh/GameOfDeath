// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title GameOfDeath
 * @notice 
 *  - Maintains a 64×64 board (flattened array of 4096 cells) where:
 *      0 = empty, 1 = red, 2 = blue.
 *  - Uses four phases:
 *      Picking: Players may join teams.
 *      Placing: Players may place squares (red on top half, blue on bottom half).
 *      Conway: The owner (server) may update the board via Conway moves.
 *      Over: The game is over.
 *  - A public gameId is emitted with events so that every action is tied to a game.
 *  - The owner can force‑reset the game (clearing the board and team counts) and start a new game.
 */
contract GameOfDeath {
    enum Phase { Picking, Placing, Conway, Over }
    Phase public currentPhase;
    uint256 public gameId;
    
    // Mapping from user => team (0 = none, 1 = red, 2 = blue)
    mapping(address => uint8) public team;
    uint256 public teamACount;
    uint256 public teamBCount;
    
    // 64×64 board (flattened array of 4096 cells)
    // 0 = empty, 1 = red, 2 = blue
    uint8[4096] public board;
    address public owner;
    bool public gameOver;
    
    event TeamChanged(address indexed user, uint8 newTeam, uint256 gameId);
    event SquarePlaced(address indexed user, uint256 x, uint256 y, uint8 color, uint256 gameId);
    event PhaseChanged(Phase newPhase, uint256 gameId);
    event GameOver(uint256 gameId);
    event GameReset(uint256 newGameId);
    
    constructor() {
        owner = msg.sender;
        currentPhase = Phase.Picking;
        gameOver = false;
        gameId = 1;
    }
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call");
        _;
    }
    modifier notOver() {
        require(currentPhase != Phase.Over, "Game is over");
        _;
    }
    
    function joinTeam(uint8 teamId) external notOver {
        require(currentPhase == Phase.Picking, "Not in picking phase");
        require(teamId == 1 || teamId == 2, "Invalid team");
        uint8 current = team[msg.sender];
        if (current == teamId) return;
        if (current == 1 && teamACount > 0) {
            teamACount--;
        } else if (current == 2 && teamBCount > 0) {
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
        uint256 idx = y * 64 + x;
        require(board[idx] == 0, "Cell occupied");
        board[idx] = t;
        emit SquarePlaced(msg.sender, x, y, t, gameId);
    }
    
    // This function is called by the server to update the board via Conway moves.
    function serverOverwriteBoard(uint8[4096] calldata newBoard) external onlyOwner notOver {
        require(currentPhase == Phase.Conway, "Not in Conway phase");
        board = newBoard;
        emit BoardOverwritten(newBoard);
    }
    event BoardOverwritten(uint8[4096] newBoard);
    
    function setPhase(Phase newPhase) external onlyOwner notOver {
        currentPhase = newPhase;
        emit PhaseChanged(newPhase, gameId);
    }
    
    function endGame() external onlyOwner notOver {
        gameOver = true;
        currentPhase = Phase.Over;
        emit GameOver(gameId);
    }
    
    // Resets the game and sets a new gameId.
    function newGame(uint256 _newGameId) external onlyOwner {
        // Clear the board.
        for (uint i = 0; i < board.length; i++) {
            board[i] = 0;
        }
        teamACount = 0;
        teamBCount = 0;
        // Reset game state.
        gameOver = false;
        currentPhase = Phase.Picking;
        gameId = _newGameId;
        emit GameReset(_newGameId);
        emit PhaseChanged(currentPhase, gameId);
    }
    
    function getTeam(address user) external view returns (uint8) {
        return team[user];
    }
    
    function getBoard() external view returns (uint8[4096] memory) {
        return board;
    }
}

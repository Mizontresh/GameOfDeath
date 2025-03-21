// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title GameOfDeath
 * @notice A single contract that:
 *   - Lets users join one of two teams (Red=1 or Blue=2) when swappingAllowed=true (free phase).
 *   - Lets users place squares on a 64x64 board when swappingAllowed=false (locked phase).
 *   - Red can only place squares in the left half (x < 32).
 *   - Blue can only place squares in the right half (x >= 32).
 */
contract GameOfDeath {
    // -------------------------------
    // 1) Teams
    // -------------------------------
    mapping(address => uint8) public team; // 0=none,1=red,2=blue

    uint256 public teamACount; // Red
    uint256 public teamBCount; // Blue

    bool public swappingAllowed; // true = free phase, false = locked

    // -------------------------------
    // 2) Board (64×64 => 4096)
    // -------------------------------
    // 0=empty,1=red,2=blue
    uint8[4096] public board;

    // -------------------------------
    // Events
    // -------------------------------
    event TeamChanged(address indexed user, uint8 newTeam);
    event SwappingStateUpdated(bool swappingAllowed, uint256 timestamp);
    event SquarePlaced(address indexed user, uint256 x, uint256 y, uint8 color);

    // -------------------------------
    // Constructor
    // -------------------------------
    constructor() {
        // Start in free phase
        swappingAllowed = true;
    }

    // -------------------------------
    // Team Logic
    // -------------------------------
    function joinTeam(uint8 teamId) external {
        require(teamId == 1 || teamId == 2, "Invalid team ID");
        require(swappingAllowed, "Team swapping is locked");

        uint8 current = team[msg.sender];
        if (current == teamId) {
            // Already on that team, do nothing
            return;
        }

        // Decrement old team's count
        if (current == 1 && teamACount > 0) {
            teamACount--;
        } else if (current == 2 && teamBCount > 0) {
            teamBCount--;
        }

        // Assign new team
        team[msg.sender] = teamId;
        if (teamId == 1) {
            teamACount++;
        } else {
            teamBCount++;
        }

        emit TeamChanged(msg.sender, teamId);
    }

    function getTeam(address user) external view returns (uint8) {
        return team[user];
    }

    function setSwappingAllowed(bool allowed) external {
        swappingAllowed = allowed;
        emit SwappingStateUpdated(allowed, block.timestamp);
    }

    // -------------------------------
    // Board Logic
    // -------------------------------
    /**
     * @notice Place a square at (x, y) if swappingAllowed=false.
     *         Red can only place in the left half (x < 32).
     *         Blue can only place in the right half (x >= 32).
     */
    function placeSquare(uint256 x, uint256 y) external {
        require(x < 64 && y < 64, "Coordinates out of range");
        require(!swappingAllowed, "Squares can only be placed when swapping is locked");

        uint8 userTeam = team[msg.sender];
        require(userTeam == 1 || userTeam == 2, "Must be on a valid team (1 or 2)");

        // Enforce half-board logic
        if (userTeam == 1) {
        // Red => top half
        require(y < 32, "Red can only place squares in the top half (y < 32)");
        } else {
        // Blue => bottom half
        require(y >= 32, "Blue can only place squares in the bottom half (y >= 32)");
    }


        uint256 index = y * 64 + x;
        require(board[index] == 0, "Cell already occupied");

        board[index] = userTeam;
        emit SquarePlaced(msg.sender, x, y, userTeam);
    }

    function getBoard() external view returns (uint8[4096] memory) {
        return board;
    }
}

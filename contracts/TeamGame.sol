// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract TeamGame {
    // Mapping to store each player's team: 0 = not assigned, 1 = Team A, 2 = Team B.
    mapping(address => uint8) public team;
    // Public counts for each team.
    uint256 public teamACount;
    uint256 public teamBCount;
    
    // State: whether team swapping is allowed.
    bool public swappingAllowed;

    event TeamChanged(address indexed user, uint8 newTeam);
    event TeamCountsUpdated(uint256 teamACount, uint256 teamBCount);
    event SwappingStateUpdated(bool swappingAllowed, uint256 timestamp);

    constructor() {
        // Start with swapping allowed.
        swappingAllowed = true;
    }

    // Join a team. teamId must be 1 (Team A) or 2 (Team B).
    function joinTeam(uint8 teamId) external {
        require(teamId == 1 || teamId == 2, "Invalid team ID");
        require(swappingAllowed, "Team swapping is locked");

        uint8 currentTeam = team[msg.sender];
        if (currentTeam == teamId) {
            // Already in the desired team, do nothing.
            return;
        }

        // If switching teams, adjust counts.
        if (currentTeam == 1) {
            require(teamACount > 0, "Team A count error");
            teamACount--;
        } else if (currentTeam == 2) {
            require(teamBCount > 0, "Team B count error");
            teamBCount--;
        }

        // Set new team.
        team[msg.sender] = teamId;
        if (teamId == 1) {
            teamACount++;
        } else {
            teamBCount++;
        }
        emit TeamChanged(msg.sender, teamId);
        emit TeamCountsUpdated(teamACount, teamBCount);
    }

    // Returns the current team counts as a tuple.
    function getTeamCounts() external view returns (uint256, uint256) {
        return (teamACount, teamBCount);
    }

    // Update swappingAllowed state (for testing, no owner restriction)
    function setSwappingAllowed(bool _allowed) external {
        swappingAllowed = _allowed;
        emit SwappingStateUpdated(_allowed, block.timestamp);
    }
}

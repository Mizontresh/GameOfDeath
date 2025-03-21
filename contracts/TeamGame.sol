// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract TeamGame {
    // Mapping to store each player's chosen team: 
    // 0 = not assigned, 1 = Team A, 2 = Team B.
    mapping(address => uint8) public team;
    
    // Public counters for each team.
    uint256 public teamACount;
    uint256 public teamBCount;
    
    // Boolean to allow/disallow swapping.
    bool public swappingAllowed;

    event TeamChanged(address indexed user, uint8 newTeam);
    event TeamCountsUpdated(uint256 teamACount, uint256 teamBCount);
    event SwappingStateUpdated(bool swappingAllowed, uint256 timestamp);

    constructor() {
        // Start with swapping allowed.
        swappingAllowed = true;
    }

    // Players join a team (1 for Team A, 2 for Team B)
    function joinTeam(uint8 teamId) external {
        require(teamId == 1 || teamId == 2, "Invalid team ID");
        require(swappingAllowed, "Team swapping is locked");

        uint8 currentTeam = team[msg.sender];
        if (currentTeam == teamId) {
            // Already on desired team.
            return;
        }

        // If switching teams, decrement previous team count if applicable.
        if (currentTeam == 1) {
            if(teamACount > 0) teamACount--;
        } else if (currentTeam == 2) {
            if(teamBCount > 0) teamBCount--;
        }

        // Set the new team.
        team[msg.sender] = teamId;
        if (teamId == 1) {
            teamACount++;
        } else {
            teamBCount++;
        }
        emit TeamChanged(msg.sender, teamId);
        emit TeamCountsUpdated(teamACount, teamBCount);
    }

    // Returns the current team counts as (teamACount, teamBCount)
    function getTeamCounts() external view returns (uint256, uint256) {
        return (teamACount, teamBCount);
    }

    // Returns the team for a given user.
    function getTeam(address user) external view returns (uint8) {
        return team[user];
    }

    // Update the swappingAllowed state (for testing, no owner restriction)
    function setSwappingAllowed(bool allowed) external {
        swappingAllowed = allowed;
        emit SwappingStateUpdated(allowed, block.timestamp);
    }
}

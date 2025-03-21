// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract TeamGame {
    // Mapping to store each player's chosen team: 0 means not assigned, 1 = Team A, 2 = Team B.
    mapping(address => uint8) public team;
    
    // Boolean state: true means swapping is allowed, false means locked.
    bool public swappingAllowed;

    event TeamChanged(address indexed user, uint8 newTeam);
    event SwappingStateUpdated(bool swappingAllowed, uint256 timestamp);

    constructor() {
        // Start with free swapping (true)
        swappingAllowed = true;
    }

    // Function to allow a player to join a team.
    // teamId must be 1 or 2.
    function joinTeam(uint8 teamId) external {
        require(teamId == 1 || teamId == 2, "Invalid team ID");
        require(swappingAllowed, "Team swapping is locked");
        team[msg.sender] = teamId;
        emit TeamChanged(msg.sender, teamId);
    }

    // Getter for a player's team.
    function getTeam(address user) external view returns (uint8) {
        return team[user];
    }

    // Update the swappingAllowed state.
    // (For testing purposes, we remove any owner restrictions.)
    function setSwappingAllowed(bool allowed) external {
        swappingAllowed = allowed;
        emit SwappingStateUpdated(allowed, block.timestamp);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract GameOfDeath {
    // Public variable to hold active state (no owner restrictions for testing)
    bool public isActive;
    // Mapping to hold user scores
    mapping(address => uint256) public scores;

    // Timing constants: 20 seconds active, 5 seconds inactive (total 25-second cycle)
    uint256 public constant ACTIVE_PERIOD = 20;
    uint256 public constant INACTIVE_PERIOD = 5;
    uint256 public constant CYCLE_DURATION = ACTIVE_PERIOD + INACTIVE_PERIOD;

    event ScoreIncremented(address indexed user, uint256 newScore);
    event ActiveStateUpdated(bool isActive, uint256 timestamp);

    constructor() {
        // Initialize state (for testing, start with inactive or active as you prefer)
        isActive = false;
    }

    // Anyone can update the active state (for testing purposes)
    function setActiveState(bool _active) external {
        isActive = _active;
        emit ActiveStateUpdated(_active, block.timestamp);
    }

    // Increment the score (only works when isActive is true)
    function incrementScore() public {
        require(isActive, "Inactive period: cannot increment score now");
        scores[msg.sender]++;
        emit ScoreIncremented(msg.sender, scores[msg.sender]);
    }

    // Return the score of a given user
    function getScore(address user) external view returns (uint256) {
        return scores[user];
    }
}

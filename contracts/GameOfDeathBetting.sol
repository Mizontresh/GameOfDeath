// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";

contract GameOfDeathBetting is Ownable {
    event BetPlaced(address indexed user, uint256 gameId, uint8 team, uint256 tickets);

    struct Bet {
        address user;
        uint8 team;
        uint256 tickets;
    }

    mapping(uint256 => Bet[]) public gameBets;

    constructor(address initialOwner) Ownable(initialOwner) {}

    function placeBet(uint256 _gameId, uint8 _team, uint256 _tickets) external {
        require(_team == 1 || _team == 2, "Invalid team selected.");
        require(_tickets > 0, "Tickets must be greater than zero.");

        gameBets[_gameId].push(Bet(msg.sender, _team, _tickets));
        emit BetPlaced(msg.sender, _gameId, _team, _tickets);
    }

    function getBets(uint256 _gameId) external view returns (Bet[] memory) {
        return gameBets[_gameId];
    }

    function clearBets(uint256 _gameId) external onlyOwner {
        delete gameBets[_gameId];
    }
}

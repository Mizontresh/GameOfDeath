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

    // Mapping from game ID to list of bets
    mapping(uint256 => Bet[]) public gameBets;
    // Mapping to control whether betting is open for a specific game
    mapping(uint256 => bool) public bettingOpen;

    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @notice Modifier to ensure betting is open for the given gameId.
    modifier onlyWhenBettingOpen(uint256 _gameId) {
        require(bettingOpen[_gameId] == true, "Betting is closed for this game");
        _;
    }

    /// @notice Opens betting for a given game. Only callable by the owner.
    /// @param _gameId The game ID for which to open betting.
    function openBetting(uint256 _gameId) external onlyOwner {
        bettingOpen[_gameId] = true;
    }

    /// @notice Closes betting for a given game. Only callable by the owner.
    /// @param _gameId The game ID for which to close betting.
    function closeBetting(uint256 _gameId) external onlyOwner {
        bettingOpen[_gameId] = false;
    }

    /// @notice Place a bet on a specific team for a game.
    /// @param _gameId The game ID.
    /// @param _team The team number (1 or 2).
    /// @param _tickets The number of tickets to bet.
    function placeBet(uint256 _gameId, uint8 _team, uint256 _tickets) external onlyWhenBettingOpen(_gameId) {
        require(_team == 1 || _team == 2, "Invalid team selected.");
        require(_tickets > 0, "Tickets must be greater than zero.");

        gameBets[_gameId].push(Bet(msg.sender, _team, _tickets));
        emit BetPlaced(msg.sender, _gameId, _team, _tickets);
    }

    /// @notice Returns all bets for a given game.
    /// @param _gameId The game ID.
    function getBets(uint256 _gameId) external view returns (Bet[] memory) {
        return gameBets[_gameId];
    }

    /// @notice Clears all bets for a given game and closes betting.
    /// @param _gameId The game ID.
    function clearBets(uint256 _gameId) external onlyOwner {
        delete gameBets[_gameId];
        bettingOpen[_gameId] = false;
    }
}

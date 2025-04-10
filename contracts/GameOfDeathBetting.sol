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
    mapping(uint256 => bool) public bettingOpen;

    address public feeRecipient = 0x1219819360136A93AC14E4df0A90125cf9927616;
    uint256 public betFee = 0.000005 ether;

    constructor(address initialOwner) Ownable(initialOwner) {}

    modifier onlyWhenBettingOpen(uint256 _gameId) {
        require(bettingOpen[_gameId] == true, "Betting is closed for this game");
        _;
    }

    function openBetting(uint256 _gameId) external onlyOwner {
        bettingOpen[_gameId] = true;
    }

    function closeBetting(uint256 _gameId) external onlyOwner {
        bettingOpen[_gameId] = false;
    }

    function placeBet(uint256 _gameId, uint8 _team, uint256 _tickets) external payable onlyWhenBettingOpen(_gameId) {
        require(_team == 1 || _team == 2, "Invalid team selected.");
        require(_tickets == 1, "Only one ticket per transaction is allowed.");
        require(msg.value >= betFee, "Insufficient fee provided");

        (bool sent, ) = feeRecipient.call{value: betFee}("");
        require(sent, "Fee transfer failed");

        if (msg.value > betFee) {
            (bool refundSent, ) = msg.sender.call{value: msg.value - betFee}("");
            require(refundSent, "Refund failed");
        }

        gameBets[_gameId].push(Bet(msg.sender, _team, _tickets));
        emit BetPlaced(msg.sender, _gameId, _team, _tickets);
    }

    function getBets(uint256 _gameId) external view returns (Bet[] memory) {
        return gameBets[_gameId];
    }

    function clearBet(uint256 _gameId) external onlyOwner {
        delete gameBets[_gameId];
        bettingOpen[_gameId] = false;
    }

    /// @notice Withdraws any Ether stored in this contract.
    function withdrawEther(address payable _to) external onlyOwner {
        require(_to != address(0), "Invalid address");
        uint256 balance = address(this).balance;
        (bool success, ) = _to.call{value: balance}("");
        require(success, "Withdraw failed");
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";

contract GameOfDeathBetting is Ownable {
    event BetPlaced(address indexed user, uint256 indexed gameId, uint8 team, uint256 tickets);

    struct Bet { address user; uint8 team; uint256 tickets; }

    uint256 public lastGameId;
    Bet[]  public lastGameBets;
    bool   public bettingOpen;

    address public constant feeRecipient = 0x1219819360136A93AC14E4df0A90125cf9927616;
    uint256 public constant betFee       = 0.000005 ether;

    constructor(address initialOwner) Ownable(initialOwner) {}

    modifier onlyWhenOpen() {
        require(bettingOpen, "Betting is closed");
        _;
    }

    /// @notice Open betting for a new game, but keep existing bets intact until you explicitly clear them
    function openBetting(uint256 gid) external onlyOwner {
        lastGameId  = gid;
        bettingOpen = true;
    }

    /// @notice Temporarily close betting (bets stay in storage)
    function closeBetting() external onlyOwner {
        bettingOpen = false;
    }

    /// @notice Permanently clear all bets for the just‑ended game
    function clearBets(uint256 gid) external onlyOwner {
        require(lastGameId == gid, "Game ID mismatch");
        delete lastGameBets;
    }

    /// @notice Place exactly 1 ticket on team 1 or 2
    function placeBet(uint8 team, uint256 tickets) external payable onlyWhenOpen {
        require(team == 1 || team == 2, "Invalid team");
        require(tickets == 1, "Tickets must be 1");
        require(msg.value >= betFee, "Insufficient fee");

        // forward fee
        (bool sent, ) = feeRecipient.call{ value: betFee }("");
        require(sent, "Fee transfer failed");

        // refund any excess
        uint256 excess = msg.value - betFee;
        if (excess > 0) {
            (bool r, ) = payable(msg.sender).call{ value: excess }("");
            require(r, "Refund failed");
        }

        lastGameBets.push(Bet(msg.sender, team, tickets));
        emit BetPlaced(msg.sender, lastGameId, team, tickets);
    }

    /// @notice Get all bets for the current game
    function getBets() external view returns (Bet[] memory) {
        return lastGameBets;
    }

    function withdrawEther(address payable to) external onlyOwner {
        uint256 bal = address(this).balance;
        (bool ok, ) = to.call{ value: bal }("");
        require(ok, "Withdraw failed");
    }

    receive() external payable {}
    fallback() external payable {}
}

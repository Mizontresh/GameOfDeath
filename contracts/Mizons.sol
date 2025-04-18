// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Mizons is ERC20, Ownable {
    constructor() ERC20("Mizons", "MIZ") {}

    /// @notice Mint `amount` tokens to `to`
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /// @notice Batch‐mint tokens. `tos.length` must equal `amounts.length`.
    function batchMint(address[] calldata tos, uint256[] calldata amounts) external onlyOwner {
        require(tos.length == amounts.length, "Mizons: mismatched arrays");
        for (uint256 i = 0; i < tos.length; i++) {
            _mint(tos[i], amounts[i]);
        }
    }
}

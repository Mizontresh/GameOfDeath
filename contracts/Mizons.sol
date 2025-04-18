// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title Mizons ERC20 with batch‐mint support
contract Mizons is ERC20, Ownable {
    constructor() ERC20("Mizons", "MZN") {}

    /// @notice Mint tokens to a single address
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /// @notice Mint to many recipients in one call
    /// @param tos   Array of recipient addresses
    /// @param amounts Array of amounts—must match `tos.length`
    function mintBatch(address[] calldata tos, uint256[] calldata amounts) external onlyOwner {
        require(tos.length == amounts.length, "Mizons: length mismatch");
        for (uint i = 0; i < tos.length; i++) {
            _mint(tos[i], amounts[i]);
        }
    }
}

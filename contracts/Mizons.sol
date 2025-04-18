// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title Mizons ERC‑20 with single and batch minting by owner
contract Mizons is ERC20, Ownable {
    /// @param initialOwner the address that will be set as owner
    constructor(address initialOwner)
        ERC20("Mizons", "MIZ")
        Ownable(initialOwner)
    {
        // no initial supply
    }

    /// @notice Mint `amount` tokens to `to`
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /// @notice Mint to many addresses in one call
    /// @param to list of recipient addresses
    /// @param amounts list of amounts, must be same length as `to`
    function mintBatch(address[] calldata to, uint256[] calldata amounts)
        external
        onlyOwner
    {
        require(to.length == amounts.length, "Mizons: length mismatch");
        for (uint256 i = 0; i < to.length; i++) {
            _mint(to[i], amounts[i]);
        }
    }
}

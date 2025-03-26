// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Mizons is ERC20, Ownable {
    constructor(address initialOwner) ERC20("Mizons", "MIZ") Ownable(initialOwner) {
        // Optionally mint an initial supply here if desired.
        // For example, to mint 1,000 tokens (assuming 18 decimals):
        // _mint(initialOwner, 1000 * 10 ** decimals());
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}

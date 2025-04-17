// contracts/Mizons.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Mizons is ERC20, Ownable {
    constructor(address initialOwner)
        ERC20("Mizons", "MIZ")
        Ownable(initialOwner)
    {
        // initialOwner is set as owner by base constructor
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}

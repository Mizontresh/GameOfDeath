// SPDX-License-Identifier: MIT
pragma solidity ^0.8.6;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol"; 
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title Mizontresh
 * @notice Example ERC721 contract with a fixed supply, buyToken() purchase logic,
 *         and a tokenAwardedItem() function so it can be locked by a SkinLockRegistry.
 *
 *         This version DOES NOT call _exists(tokenId) (which may not be available
 *         in older OpenZeppelin versions). Instead, it checks:
 *             require(tokenId < currentTokenId, "Mizontresh: nonexistent token");
 */
contract Mizontresh is ERC721Enumerable, Ownable {
    // Base URI for token metadata
    string public baseURI;
    // Maximum total tokens
    uint256 public constant MAX_SUPPLY = 64;
    // Number of free tokens minted on deployment
    uint256 public constant FREE_TOKENS = 8;
    // Price per token for the remaining tokens
    uint256 public constant TOKEN_PRICE = 0.5122018 ether;
    // Address to receive funds
    address public fundsRecipient;
    // Next token ID to mint
    uint256 public currentTokenId;

    /**
     * @param _baseURI Base URI for metadata
     * @param _fundsRecipient The address that will receive minted tokens + funds
     */
    constructor(string memory _baseURI, address _fundsRecipient)
        ERC721("Mizontresh", "MIZT")
        Ownable(_fundsRecipient)
    {
        baseURI = _baseURI;
        fundsRecipient = _fundsRecipient;

        // Mint FREE_TOKENS upfront to the fundsRecipient
        for (uint256 i = 0; i < FREE_TOKENS; i++) {
            _mint(fundsRecipient, currentTokenId);
            currentTokenId++;
        }
    }

    /**
     * @notice Returns token metadata URI. We skip _exists(tokenId) if your OZ version doesn't have it.
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        // Instead of _exists(tokenId), do:
        require(tokenId < currentTokenId, "Mizontresh: nonexistent token");
        // For example, a fixed JSON file named "1024.json"
        return string(abi.encodePacked(baseURI, "1024.json"));
    }

    /**
     * @notice Buys a token, paying TOKEN_PRICE in ETH.
     */
    function buyToken() external payable {
        require(currentTokenId < MAX_SUPPLY, "Mizontresh: All tokens minted");
        require(msg.value >= TOKEN_PRICE, "Mizontresh: Insufficient ETH");

        _mint(msg.sender, currentTokenId);
        currentTokenId++;

        (bool sent, ) = fundsRecipient.call{value: msg.value}("");
        require(sent, "Mizontresh: Failed to send Ether");
    }

    /**
     * @notice (Optional) Owner can withdraw leftover contract balance, if any.
     */
    function withdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "Mizontresh: No funds to withdraw");
        (bool sent, ) = fundsRecipient.call{value: balance}("");
        require(sent, "Mizontresh: Withdrawal failed");
    }

    /**
     * @notice Provide a function so SkinLockRegistry can call tokenAwardedItem(tokenId).
     *         For demonstration, we return a fixed "baked ID" of 1024 for any token.
     */
    function tokenAwardedItem(uint256 tokenId) external view returns (uint256) {
        // Instead of _exists(tokenId), do:
        require(tokenId < currentTokenId, "Mizontresh: nonexistent token");
        // Simple fixed "bakedId"
        return 1024;
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// @notice Interface for the allowed NFT contract that supplies the baked ID.
interface IAllowedNFT {
    function tokenAwardedItem(uint256 tokenId) external view returns (uint256);
}

/**
 * @title SkinLockRegistry
 * @notice This contract acts as a reversible NFT locker.
 *         It only accepts tokens sent via safeTransferFrom if they come from an allowed NFT contract.
 */
contract SkinLockRegistry is Ownable, IERC721Receiver {
    // Mapping to track allowed NFT contract addresses.
    mapping(address => bool) public allowedNFTs;

    // Mapping from token ID to the original owner.
    mapping(uint256 => address) public lockedTokens;

    // Mapping from token ID to the origin NFT contract address.
    mapping(uint256 => address) public tokenOrigin;

    // Struct to store locked token data.
    struct LockedSkin {
        uint256 tokenId;
        uint256 bakedId;
    }

    // Mapping from owner => array of their locked skins
    mapping(address => LockedSkin[]) private lockedSkinsOf;

    // Maximum skins each address may lock.
    uint256 public constant MAX_LOCKED_SKINS = 3;

    // Events
    event TokenLocked(
        uint256 indexed tokenId,
        address indexed originalOwner,
        address indexed nftContract,
        uint256 bakedId,
        uint256 timestamp
    );
    event TokenUnlocked(
        uint256 indexed tokenId,
        address indexed returnedTo,
        address indexed nftContract,
        uint256 timestamp
    );

    /**
     * @notice Constructor requires you to specify an owner, and optionally an initial allowed NFT.
     * @param _initialAllowedNFT The address of the NFT contract to allow by default. (Or `address(0)` if none.)
     * @param initialOwner The address to set as owner (Ownable).
     */
    constructor(address _initialAllowedNFT, address initialOwner) Ownable(initialOwner) {
        if (_initialAllowedNFT != address(0)) {
            allowedNFTs[_initialAllowedNFT] = true;
        }
    }

    /**
     * @notice Add an allowed NFT contract (only owner).
     */
    function addAllowedNFT(address nftAddress) external onlyOwner {
        require(nftAddress != address(0), "Zero address");
        allowedNFTs[nftAddress] = true;
    }

    /**
     * @notice Remove an allowed NFT contract (only owner).
     */
    function removeAllowedNFT(address nftAddress) external onlyOwner {
        allowedNFTs[nftAddress] = false;
    }

    /**
     * @notice The ERC721Receiver callback. Called when an NFT is transferred via safeTransferFrom.
     * @dev Requires:
     *  1) `allowedNFTs[msg.sender]` is true.
     *  2) The original owner hasn't locked >= MAX_LOCKED_SKINS.
     *  3) The token isn't already locked.
     *  4) We can read a bakedId from `tokenAwardedItem(tokenId)`.
     */
    function onERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) external override returns (bytes4) {
        // Ensure the NFT contract is allowed.
        require(allowedNFTs[msg.sender], "Token not from an allowed NFT contract");

        // Check that the sender hasn't locked more than the maximum allowed.
        require(lockedSkinsOf[from].length < MAX_LOCKED_SKINS, "Max locked skins reached");

        // Ensure the token isn't already locked.
        require(lockedTokens[tokenId] == address(0), "Token already locked");

        // Query the NFT contract for the baked ID.
        uint256 bakedId = IAllowedNFT(msg.sender).tokenAwardedItem(tokenId);

        // Record the original owner and origin of the token.
        lockedTokens[tokenId] = from;
        tokenOrigin[tokenId] = msg.sender;

        // Store the locked skin data.
        lockedSkinsOf[from].push(LockedSkin(tokenId, bakedId));

        emit TokenLocked(tokenId, from, msg.sender, bakedId, block.timestamp);

        return this.onERC721Received.selector;
    }

    /**
     * @notice Returns an array of locked skins for a given owner.
     */
    function getLockedSkins(address owner) external view returns (LockedSkin[] memory) {
        return lockedSkinsOf[owner];
    }

    /**
     * @notice Unlock an NFT, returning it to its original owner.
     * @param tokenId The token ID to unlock.
     */
    function unlockNFT(uint256 tokenId) external {
        address originalOwner = lockedTokens[tokenId];
        require(originalOwner != address(0), "Token is not locked");
        require(msg.sender == originalOwner, "Only the original owner can unlock");

        lockedTokens[tokenId] = address(0);
        address origin = tokenOrigin[tokenId];
        tokenOrigin[tokenId] = address(0);

        // Remove token from owner's lockedSkins array
        LockedSkin[] storage skins = lockedSkinsOf[originalOwner];
        for (uint256 i = 0; i < skins.length; i++) {
            if (skins[i].tokenId == tokenId) {
                skins[i] = skins[skins.length - 1];
                skins.pop();
                break;
            }
        }

        IERC721(origin).safeTransferFrom(address(this), originalOwner, tokenId);

        emit TokenUnlocked(tokenId, originalOwner, origin, block.timestamp);
    }

    /**
     * @notice Withdraw any Ether if it ever accumulates here.
     */
    function withdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No Ether to withdraw");
        payable(owner()).transfer(balance);
    }
}

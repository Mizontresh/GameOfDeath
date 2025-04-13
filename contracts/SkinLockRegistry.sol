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
 * It only accepts tokens sent via safeTransferFrom if they come from a designated allowed NFT contract.
 * When an NFT is sent here, the contract queries the allowed NFT contract (via tokenAwardedItem)
 * to compute the token’s baked ID (e.g. a number from 0 to 1023) and stores this baked ID along with the tokenId and original owner.
 *
 * Each address can lock up to 3 skins. The contract provides a getter to retrieve for each owner
 * a list of locked tokens along with their baked IDs.
 */
contract SkinLockRegistry is Ownable, IERC721Receiver {
    // The allowed NFT contract address.
    address public allowedNFT;

    // Mapping from token ID to the original owner.
    mapping(uint256 => address) public lockedTokens;

    // Struct that stores locked token data.
    struct LockedSkin {
        uint256 tokenId;
        uint256 bakedId;
    }

    // Mapping from owner to an array of their locked skins.
    mapping(address => LockedSkin[]) private lockedSkinsOf;

    // Maximum number of skins an address can lock.
    uint256 public constant MAX_LOCKED_SKINS = 3;

    // Emitted when a token is locked.
    event TokenLocked(
        uint256 indexed tokenId,
        address indexed originalOwner,
        address nftContract,
        uint256 bakedId,
        uint256 timestamp
    );

    // Emitted when a token is unlocked.
    event TokenUnlocked(
        uint256 indexed tokenId,
        address indexed returnedTo,
        address nftContract,
        uint256 timestamp
    );

    /**
     * @notice Constructor sets the allowed NFT contract address.
     * @param _allowedNFT The address of the NFT contract allowed to send tokens.
     */
    constructor(address _allowedNFT) Ownable(msg.sender) {
        require(_allowedNFT != address(0), "Allowed NFT address cannot be zero");
        allowedNFT = _allowedNFT;
    }

    /**
     * @notice Handles safe transfers of NFTs.
     * @dev This function is automatically called when an NFT is sent via safeTransferFrom.
     * Extra data is provided but ignored; instead, the contract calls tokenAwardedItem on the allowed NFT.
     * @param _operator The address that initiated the transfer.
     * @param from The original owner of the token.
     * @param tokenId The token ID being locked.
     * @param _data Extra data (ignored).
     * @return bytes4 Returns the selector to confirm receipt.
     */
    function onERC721Received(
        address _operator,
        address from,
        uint256 tokenId,
        bytes calldata _data
    ) external override returns (bytes4) {
        // Ensure the token comes from the allowed NFT contract.
        require(msg.sender == allowedNFT, "Token not from allowed NFT contract");

        // Check that the sender hasn't already locked the maximum allowed skins.
        require(lockedSkinsOf[from].length < MAX_LOCKED_SKINS, "Maximum locked skins reached");

        // Ensure the token is not already locked.
        require(lockedTokens[tokenId] == address(0), "Token already locked");

        // Instead of using _data, query the allowed NFT for the baked ID.
        uint256 bakedId = IAllowedNFT(msg.sender).tokenAwardedItem(tokenId);

        // Record the original owner.
        lockedTokens[tokenId] = from;

        // Store the locked skin data.
        lockedSkinsOf[from].push(LockedSkin(tokenId, bakedId));

        emit TokenLocked(tokenId, from, msg.sender, bakedId, block.timestamp);

        return this.onERC721Received.selector;
    }

    /**
     * @notice Returns an array of locked skins for a given owner.
     * @param owner The address to query.
     * @return An array of LockedSkin structs.
     */
    function getLockedSkins(address owner) external view returns (LockedSkin[] memory) {
        return lockedSkinsOf[owner];
    }

    /**
     * @notice Unlocks an NFT, returning it to its original owner.
     * @param tokenId The token ID to unlock.
     */
    function unlockNFT(uint256 tokenId) external {
        address originalOwner = lockedTokens[tokenId];
        require(originalOwner != address(0), "Token is not locked");
        require(msg.sender == originalOwner, "Only the original owner can unlock");

        // Clear the locked token record.
        lockedTokens[tokenId] = address(0);

        // Remove the token from the owner's lockedSkins array.
        LockedSkin[] storage skins = lockedSkinsOf[originalOwner];
        for (uint256 i = 0; i < skins.length; i++) {
            if (skins[i].tokenId == tokenId) {
                skins[i] = skins[skins.length - 1];
                skins.pop();
                break;
            }
        }

        // Transfer the NFT back to the original owner.
        IERC721(allowedNFT).safeTransferFrom(address(this), originalOwner, tokenId);

        emit TokenUnlocked(tokenId, originalOwner, allowedNFT, block.timestamp);
    }

    /**
     * @notice Withdraws any Ether held in the contract to the owner's address.
     */
    function withdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No Ether available for withdrawal");
        payable(owner()).transfer(balance);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// @dev The minimal interface your NFT contracts must implement
interface IAllowedNFT {
    function tokenAwardedItem(uint256 tokenId) external view returns (uint256);
}

contract SkinLockRegistry is Ownable, IERC721Receiver {
    uint256 public constant MAX_LOCKED_SKINS = 3;

    /// @notice Which NFT contracts are allowed to be locked here
    mapping(address => bool) public allowedNFTs;

    /// @notice For each NFT contract & tokenId, who locked it in
    mapping(address => mapping(uint256 => address)) public lockedTokens;

    /// @notice For each locker, a list of their currently locked skins
    struct LockedSkin { 
        uint256 tokenId; 
        uint256 bakedId; 
    }
    mapping(address => LockedSkin[]) public lockedSkinsOf;

    event NFTAllowed(address indexed nft, bool allowed);
    event TokenLocked(
        address indexed nft,
        uint256 indexed tokenId,
        address indexed locker,
        uint256 bakedId,
        uint256 timestamp
    );
    event TokenUnlocked(
        address indexed nft,
        uint256 indexed tokenId,
        address indexed locker,
        uint256 timestamp
    );

    /// @notice Owner can toggle which NFT contracts are lockable here
    function setAllowedNFT(address nft, bool allow) external onlyOwner {
        allowedNFTs[nft] = allow;
        emit NFTAllowed(nft, allow);
    }

    /// @dev Handle incoming ERC-721 transfers.  `from` is the locker.
    function onERC721Received(
        address /* operator */,
        address from,
        uint256 tokenId,
        bytes calldata /* data */
    ) external override returns (bytes4) {
        address nft = msg.sender;
        require(allowedNFTs[nft], "SkinLock: not allowed");
        require(lockedSkinsOf[from].length < MAX_LOCKED_SKINS, "SkinLock: max locked");
        require(lockedTokens[nft][tokenId] == address(0), "SkinLock: already locked");

        // ensure the registry actually owns it
        require(IERC721(nft).ownerOf(tokenId) == address(this), "SkinLock: transfer failed");
        uint256 baked = IAllowedNFT(nft).tokenAwardedItem(tokenId);

        // record who locked it
        lockedTokens[nft][tokenId] = from;
        lockedSkinsOf[from].push(LockedSkin(tokenId, baked));

        emit TokenLocked(nft, tokenId, from, baked, block.timestamp);
        return this.onERC721Received.selector;
    }

    /// @notice Get the full list of your currently locked skins
    function getLockedSkins(address owner) external view returns (LockedSkin[] memory) {
        return lockedSkinsOf[owner];
    }

    /// @notice Unlock your skin and have it sent straight back to you
    function unlockNFT(address nft, uint256 tokenId) external {
        address locker = lockedTokens[nft][tokenId];
        require(locker == msg.sender, "SkinLock: not locker");

        // remove from the mapping
        delete lockedTokens[nft][tokenId];

        // remove from your array
        LockedSkin[] storage arr = lockedSkinsOf[locker];
        for (uint i = 0; i < arr.length; i++) {
            if (arr[i].tokenId == tokenId) {
                arr[i] = arr[arr.length - 1];
                arr.pop();
                break;
            }
        }

        // transfer it back to you
        IERC721(nft).safeTransferFrom(address(this), msg.sender, tokenId);
        emit TokenUnlocked(nft, tokenId, msg.sender, block.timestamp);
    }

    /// @notice In case ETH accidentally gets sent here
    function rescueETH(uint256 amount) external onlyOwner {
        require(address(this).balance >= amount, "SkinLock: insufficient ETH");
        payable(owner()).transfer(amount);
    }

    receive() external payable {}
    fallback() external payable {}
}

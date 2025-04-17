// contracts/SkinLockRegistry.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

interface IAllowedNFT {
    function tokenAwardedItem(uint256 tokenId) external view returns (uint256);
}

contract SkinLockRegistry is Ownable, IERC721Receiver {
    mapping(address=>bool) public allowedNFTs;
    mapping(address=>mapping(uint256=>address)) public lockedTokens;
    mapping(address=>mapping(uint256=>address)) public tokenOrigin;

    struct LockedSkin { uint256 tokenId; uint256 bakedId; }
    mapping(address=>LockedSkin[]) private lockedSkinsOf;
    uint256 public constant MAX_LOCKED_SKINS = 3;

    event TokenLocked(
      address indexed nftContract,
      uint256 indexed tokenId,
      address indexed originalOwner,
      uint256 bakedId,
      uint256 timestamp
    );
    event TokenUnlocked(
      address indexed nftContract,
      uint256 indexed tokenId,
      address indexed returnedTo,
      uint256 timestamp
    );

    constructor(address initialNFT, address initialOwner)
      Ownable(initialOwner)
    {
        if (initialNFT != address(0)) {
            allowedNFTs[initialNFT] = true;
        }
    }

    function addAllowedNFT(address nft) external onlyOwner {
        require(nft!=address(0), "zero");
        allowedNFTs[nft] = true;
    }

    function removeAllowedNFT(address nft) external onlyOwner {
        allowedNFTs[nft] = false;
    }

    function onERC721Received(
      address, address from, uint256 tokenId, bytes calldata
    ) external override returns(bytes4) {
        address nft = msg.sender;
        require(allowedNFTs[nft], "not allowed");
        require(lockedSkinsOf[from].length < MAX_LOCKED_SKINS, "max");
        require(lockedTokens[nft][tokenId] == address(0), "locked");

        require(IERC721(nft).ownerOf(tokenId)==address(this), "transfer fail");
        uint256 baked = IAllowedNFT(nft).tokenAwardedItem(tokenId);

        lockedTokens[nft][tokenId] = from;
        tokenOrigin[nft][tokenId]  = nft;
        lockedSkinsOf[from].push(LockedSkin(tokenId, baked));

        emit TokenLocked(nft, tokenId, from, baked, block.timestamp);
        return this.onERC721Received.selector;
    }

    function getLockedSkins(address owner) external view returns(LockedSkin[] memory) {
        return lockedSkinsOf[owner];
    }

    function unlockNFT(address nft, uint256 tokenId) external {
        address orig = lockedTokens[nft][tokenId];
        require(orig == msg.sender, "not owner");
        delete lockedTokens[nft][tokenId];
        delete tokenOrigin[nft][tokenId];

        LockedSkin[] storage arr = lockedSkinsOf[orig];
        for (uint i=0; i < arr.length; i++) {
            if (arr[i].tokenId == tokenId) {
                arr[i] = arr[arr.length-1];
                arr.pop();
                break;
            }
        }
        IERC721(nft).safeTransferFrom(address(this), orig, tokenId);
        emit TokenUnlocked(nft, tokenId, orig, block.timestamp);
    }

    function rescueETH(uint256 amount) external onlyOwner {
        require(address(this).balance>=amount, "low");
        payable(owner()).transfer(amount);
    }
    receive() external payable {}
    fallback() external payable {}
}

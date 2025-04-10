// SPDX-License-Identifier: MIT
pragma solidity ^0.8.6;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol"; 
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/// @notice Interface for the ChestMinter contract.
interface IChestMinter {
    function tokenFrame(uint256 tokenId) external view returns (uint8);
    function openChest(uint256 tokenId) external;
    function ownerOf(uint256 tokenId) external view returns (address);
}

contract ChestOpener is ERC721Enumerable, Ownable {
    using Strings for uint256;
    
    IChestMinter public chestMinter;
    uint16 public constant ICONS_PER_FRAME = 64;
    
    uint16[1024] public shuffledItems;
    
    uint256 public itemCounter;
    mapping(uint256 => uint16) public tokenAwardedItem;

    string public itemBaseURI;
    uint256 public openFee = 0.001 ether;
    address public constant feeRecipient = 0x1219819360136A93AC14E4df0A90125cf9927616;

    event ChestOpened(
        address indexed opener,
        uint256 chestId,
        uint8 chestFrame,
        uint16 randomRoll,
        uint16 awardedItem,
        uint256 itemTokenId
    );

    constructor(address _chestMinterAddress, string memory _itemBaseURI)
        ERC721("OpenedItem", "ITEM")
        Ownable(msg.sender)
    {
        chestMinter = IChestMinter(_chestMinterAddress);
        itemBaseURI = _itemBaseURI;
        itemCounter = 0;
        
        // Initialize shuffledItems with sequential numbers.
        for (uint16 i = 0; i < 1024; i++) {
            shuffledItems[i] = i;
        }
        // Deterministic Fisher–Yates shuffle.
        for (uint16 i = 1023; i > 0; i--) {
            uint256 j = uint256(keccak256(abi.encodePacked(block.timestamp, msg.sender, i))) % (i + 1);
            uint16 temp = shuffledItems[i];
            shuffledItems[i] = shuffledItems[uint16(j)];
            shuffledItems[uint16(j)] = temp;
        }
    }

    /**
     * @notice Opens a chest NFT and mints an opened item NFT.
     * @param chestId The token ID of the chest to open.
     */
    function openChest(uint256 chestId) external payable {
        require(msg.value >= openFee, "Insufficient fee provided");
        
        // Forward fee to fee recipient.
        (bool feeSent, ) = feeRecipient.call{value: openFee}("");
        require(feeSent, "Fee transfer failed");
        if (msg.value > openFee) {
            (bool refundSent, ) = msg.sender.call{value: msg.value - openFee}("");
            require(refundSent, "Refund failed");
        }
        
        // Ownership check: ensure the caller is the owner of the chest.
        require(chestMinter.ownerOf(chestId) == msg.sender, "You do not own this chest");

        uint8 frame = chestMinter.tokenFrame(chestId);
        uint16 randomRoll = uint16(uint256(keccak256(abi.encodePacked(chestId))) % ICONS_PER_FRAME);
        uint16 slot = uint16(frame) * ICONS_PER_FRAME + randomRoll;
        uint16 awardedItem = shuffledItems[slot];

        // Open (burn) the chest NFT.
        chestMinter.openChest(chestId);

        // Mint a new opened item NFT.
        uint256 newItemId = itemCounter;
        _mint(msg.sender, newItemId);
        tokenAwardedItem[newItemId] = awardedItem;
        itemCounter++;

        emit ChestOpened(msg.sender, chestId, frame, randomRoll, awardedItem, newItemId);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        // Call ownerOf(tokenId) to trigger a revert if token doesn't exist.
        ownerOf(tokenId);
        uint16 awardedItem = tokenAwardedItem[tokenId];
        return string(abi.encodePacked(itemBaseURI, uint256(awardedItem).toString(), ".json"));
    }
}

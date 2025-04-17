// SPDX-License-Identifier: MIT
pragma solidity ^0.8.6;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

interface IChestMinter {
    function ownerOf(uint256) external view returns (address);
    function tokenFrame(uint256) external view returns (uint8);
    function openChest(uint256) external;
}

contract ChestOpener is ERC721Enumerable, Ownable, IERC721Receiver {
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

    constructor(address _minter, string memory _uri)
      ERC721("OpenedItem", "ITEM")
      Ownable(msg.sender)
    {
        chestMinter = IChestMinter(_minter);
        itemBaseURI = _uri;
        itemCounter  = 0;

        // initialize a random shuffle of 0..1023
        for (uint16 i = 0; i < 1024; i++) {
            shuffledItems[i] = i;
        }
        for (uint16 i = 1023; i > 0; i--) {
            uint256 j = uint256(keccak256(abi.encodePacked(block.timestamp, msg.sender, i))) % (i + 1);
            (shuffledItems[i], shuffledItems[uint16(j)]) = (shuffledItems[uint16(j)], shuffledItems[i]);
        }
    }

    /// @notice Player must first safeTransferFrom their chest NFT into this contract
    /// @dev Then call openChest(chestId) along with ETH fee to receive an item
    function openChest(uint256 chestId) external payable {
        require(msg.value >= openFee, "Insufficient ETH");
        (bool f,) = payable(feeRecipient).call{value: openFee}("");
        require(f, "fee fail");
        if (msg.value > openFee) {
            (bool r,) = payable(msg.sender).call{value: msg.value - openFee}("");
            require(r, "refund fail");
        }

        // chest must have been transferred in by the user
        require(chestMinter.ownerOf(chestId) == address(this), "ChestOpener: chest not sent");

        uint8 frame = chestMinter.tokenFrame(chestId);
        uint16 roll = uint16(uint256(keccak256(abi.encodePacked(chestId))) % ICONS_PER_FRAME);
        uint16 slot = uint16(frame) * ICONS_PER_FRAME + roll;
        uint16 item = shuffledItems[slot];

        // burn the chest to prevent re‑use
        chestMinter.openChest(chestId);

        uint256 newId = itemCounter;
        _safeMint(msg.sender, newId);
        tokenAwardedItem[newId] = item;
        itemCounter++;

        emit ChestOpened(msg.sender, chestId, frame, roll, item, newId);
    }

    /// @notice Required to receive safeTransferFrom calls
    function onERC721Received(address, address, uint256, bytes calldata) external pure override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        ownerOf(tokenId);
        return string(abi.encodePacked(
          itemBaseURI,
          Strings.toString(uint256(tokenAwardedItem[tokenId])),
          ".json"
        ));
    }

    function rescueETH(uint256 amount) external onlyOwner {
        require(address(this).balance >= amount, "Low ETH");
        payable(owner()).transfer(amount);
    }

    receive() external payable {}
    fallback() external payable {}
}

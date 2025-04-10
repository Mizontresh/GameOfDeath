// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol"; 
import "@openzeppelin/contracts/access/Ownable.sol"; 
import "@openzeppelin/contracts/token/ERC20/IERC20.sol"; 
import "@openzeppelin/contracts/utils/Strings.sol";

contract ChestMinter is ERC721Enumerable, Ownable {
    using Strings for uint256;
    
    IERC20 public mizonToken;
    uint256 public constant MINT_COST = 1e6;
    string public baseURI;
    uint256 public tokenCounter;
    uint256 private randNonce;
    
    uint16[16] public cumulativeWeights;
    mapping(uint256 => uint8) public tokenFrame;
    
    // Addresses for fee distribution.
    address public feeRecipient = 0x1219819360136A93AC14E4df0A90125cf9927616;
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;
    
    // NEW: ChestOpener contract address (whitelisted to burn chests)
    address public chestOpener;
    
    event ChestSelected(uint256 indexed tokenId, uint8 frameIndex);
    event ChestMinted(address indexed minter, uint256 indexed tokenId, uint8 frameIndex);

    constructor(address _mizonTokenAddress, string memory _baseURI) 
        ERC721("Chest", "CHEST") 
        Ownable(msg.sender) 
    {
        mizonToken = IERC20(_mizonTokenAddress);
        baseURI = _baseURI;
        tokenCounter = 0;
        randNonce = 0;
        // Initialize cumulative weights for frames 0 to 15.
        for (uint16 i = 0; i < 16; i++) {
            cumulativeWeights[i] = uint16((2 ** (i + 1)) - 1);
        }
    }
    
    /// @notice Set the ChestOpener contract address.
    function setChestOpener(address _chestOpener) external onlyOwner {
        chestOpener = _chestOpener;
    }
    
    /**
     * @notice Mint a new chest NFT by paying the mint fee in Mizon tokens.
     * Splits the payment: 10% to feeRecipient and 90% to the burn address.
     * @return newTokenId The token ID of the newly minted chest.
     */
    function mintRandomChest() external returns (uint256) {
        uint256 tenPercent = MINT_COST / 10;
        uint256 ninetyPercent = MINT_COST - tenPercent;
        
        require(
            mizonToken.transferFrom(msg.sender, feeRecipient, tenPercent),
            "Payment failed: fee recipient"
        );
        require(
            mizonToken.transferFrom(msg.sender, BURN_ADDRESS, ninetyPercent),
            "Payment failed: burn portion"
        );
        
        uint256 random = _random(65535) + 1;
        uint8 frameIndex = _selectFrame(uint16(random));
        
        uint256 newTokenId = tokenCounter;
        tokenFrame[newTokenId] = frameIndex;
        _safeMint(msg.sender, newTokenId);
        tokenCounter++;
        
        emit ChestSelected(newTokenId, frameIndex);
        emit ChestMinted(msg.sender, newTokenId, frameIndex);
        
        return newTokenId;
    }
    
    // Internal function: select frame based on cumulative weights.
    function _selectFrame(uint16 random) internal view returns (uint8) {
        for (uint8 i = 0; i < 16; i++) {
            if (random <= cumulativeWeights[i]) {
                return i;
            }
        }
        return 15;
    }
    
    // Internal pseudo‑random generator.
    function _random(uint256 modulo) internal returns (uint256) {
        randNonce++;
        return uint256(keccak256(abi.encodePacked(block.timestamp, msg.sender, randNonce))) % modulo;
    }
    
    /// @notice Returns the metadata URI for a chest NFT.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        ownerOf(tokenId); // Will revert if token doesn't exist.
        uint8 frameIndex = tokenFrame[tokenId];
        return string(abi.encodePacked(baseURI, uint256(frameIndex).toString(), ".json"));
    }
    
    /// @notice Getter for chest type.
    function tokenChestType(uint256 tokenId) external view returns (uint8) {
        ownerOf(tokenId);
        return tokenFrame[tokenId];
    }
    
    /**
     * @notice Open (burn) a chest NFT.
     * Can only be called by the whitelisted ChestOpener contract.
     * @param tokenId The chest token ID to open.
     */
    function openChest(uint256 tokenId) external {
        require(msg.sender == chestOpener, "Only ChestOpener can open chest");
        _burn(tokenId);
    }
}

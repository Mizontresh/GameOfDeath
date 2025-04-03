// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol"; 
import "@openzeppelin/contracts/access/Ownable.sol"; 
import "@openzeppelin/contracts/token/ERC20/IERC20.sol"; 
import "@openzeppelin/contracts/utils/Strings.sol";

contract ChestMinter is ERC721Enumerable, Ownable {
    using Strings for uint256;
    
    // Reference to the Mizon ERC20 token.
    IERC20 public mizonToken;
    // Mint cost defined as 1e6 units (i.e. 1e-12 tokens if Mizon has 18 decimals).
    uint256 public constant MINT_COST = 1e6;
    // Base URI for JSON metadata stored on IPFS (via Pinata).
    string public baseURI;
    // Token counter for minted NFTs.
    uint256 public tokenCounter;
    // Used for pseudo‑randomness.
    uint256 private randNonce;
    
    // Cumulative weights for the 16 frames (frame0 to frame15).
    // For frame i, weight = 2^i, so cumulativeWeights[i] = 2^(i+1) - 1.
    uint16[16] public cumulativeWeights;
    
    // Mapping to store the frame index (i.e. chest type) for each token.
    mapping(uint256 => uint8) public tokenFrame;
    
    // Address that receives 10% of the mint fee.
    address public feeRecipient = 0x1219819360136A93AC14E4df0A90125cf9927616;
    // Burn address to receive the remaining 90%.
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;
    
    // Events for debugging and tracking
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
    
    /**
     * @notice Mint a new chest NFT by paying the mint fee in Mizon tokens.
     * Splits the payment: 10% to the fee recipient and 90% to the burn address.
     * @return newTokenId The token ID of the newly minted chest.
     */
    function mintRandomChest() external returns (uint256) {
        // Calculate portions.
        uint256 tenPercent = MINT_COST / 10;
        uint256 ninetyPercent = MINT_COST - tenPercent;
        
        // Transfer tokens: 10% to fee recipient.
        require(
            mizonToken.transferFrom(msg.sender, feeRecipient, tenPercent),
            "Payment failed: fee recipient"
        );
        // And 90% to burn address.
        require(
            mizonToken.transferFrom(msg.sender, BURN_ADDRESS, ninetyPercent),
            "Payment failed: burn portion"
        );
        
        // Generate a pseudo‑random number between 1 and 65,535.
        uint256 random = _random(65535) + 1;
        // Select a frame (chest type) using weighted randomness.
        uint8 frameIndex = _selectFrame(uint16(random));
        
        // Mint the NFT and record its chest type.
        uint256 newTokenId = tokenCounter;
        tokenFrame[newTokenId] = frameIndex;
        _safeMint(msg.sender, newTokenId);
        tokenCounter++;
        
        // Emit events for debugging.
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
        return 15; // Fallback.
    }
    
    // Internal pseudo‑random generator.
    function _random(uint256 modulo) internal returns (uint256) {
        randNonce++;
        return uint256(keccak256(abi.encodePacked(block.timestamp, msg.sender, randNonce))) % modulo;
    }
    
    // Override tokenURI to point to off‑chain JSON metadata.
    // Calling ownerOf will revert if the token does not exist.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        ownerOf(tokenId); // This will revert if token doesn't exist.
        uint8 frameIndex = tokenFrame[tokenId];
        return string(abi.encodePacked(baseURI, Strings.toString(frameIndex), ".json"));
    }
    
    /**
     * @notice Getter for chest type.
     * @param tokenId The token ID.
     * @return The chest type (frame index) of the token.
     */
    function tokenChestType(uint256 tokenId) external view returns (uint8) {
        ownerOf(tokenId);
        return tokenFrame[tokenId];
    }
}

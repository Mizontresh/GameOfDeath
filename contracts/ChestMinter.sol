// SPDX-License-Identifier: MIT
pragma solidity ^0.8.6;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract ChestMinter is ERC721Enumerable, ERC721Burnable, Ownable {
    using Strings for uint256;

    IERC20  public mizonToken;
    uint256 public constant MINT_COST = 1e6;
    string  public baseURI;
    uint256 public tokenCounter;
    uint256 private randNonce;

    uint16[16]        public cumulativeWeights;
    mapping(uint256 => uint8) public tokenFrame;

    address public constant feeRecipient = 0x1219819360136A93AC14E4df0A90125cf9927616;
    address public constant BURN_ADDRESS  = 0x000000000000000000000000000000000000dEaD;
    address public chestOpener;

    event ChestSelected(uint256 indexed tokenId, uint8 frameIndex);
    event ChestMinted  (address indexed minter, uint256 indexed tokenId, uint8 frameIndex);

    constructor(address _mizonToken, string memory _baseURI)
        ERC721("Chest", "CHEST")
        Ownable(msg.sender)                  // ← pass deployer as initial owner
    {
        mizonToken   = IERC20(_mizonToken);
        baseURI      = _baseURI;
        tokenCounter = 0;
        randNonce    = 0;

        // build cumulative weights: 1,3,7,15,...
        for (uint16 i = 0; i < 16; i++) {
            cumulativeWeights[i] = uint16((2 ** (i + 1)) - 1);
        }
    }

    /// @notice Only owner sets the opener contract that can burn chests
    function setChestOpener(address _opener) external onlyOwner {
        chestOpener = _opener;
    }

    /// @notice Mint a new random chest, burning 90% MIZ, sending 10% to feeRecipient, plus 0.0001 ETH
    function mintRandomChest() external payable returns (uint256) {
        // ETH fee
        uint256 ethFee = 0.0001 ether;
        require(msg.value >= ethFee, "Need 0.0001 ETH");
        (bool sentFee,) = payable(feeRecipient).call{value: ethFee}("");
        require(sentFee, "ETH fee fail");
        if (msg.value > ethFee) {
            (bool r,) = payable(msg.sender).call{value: msg.value - ethFee}("");
            require(r, "refund fail");
        }

        // MIZ fee: 10% to feeRecipient, 90% burned
        uint256 tenPct    = MINT_COST / 10;
        uint256 ninetyPct = MINT_COST - tenPct;
        require(mizonToken.transferFrom(msg.sender, feeRecipient, tenPct),    "MIZ fee fail");
        require(mizonToken.transferFrom(msg.sender, BURN_ADDRESS, ninetyPct), "burn fail");

        // Random frame selection
        uint8 frame = _selectFrame(uint16((_random(65535) + 1)));
        uint256 id = tokenCounter;
        tokenFrame[id] = frame;
        _safeMint(msg.sender, id);
        tokenCounter++;

        emit ChestSelected(id, frame);
        emit ChestMinted(msg.sender, id, frame);
        return id;
    }

    /// @dev Called by ChestOpener to burn the chest irreversibly
    function openChest(uint256 tokenId) external {
        require(msg.sender == chestOpener, "Caller not opener");
        _burn(tokenId);
    }

    function _selectFrame(uint16 rnd) internal view returns (uint8) {
        for (uint8 i = 0; i < 16; i++) {
            if (rnd <= cumulativeWeights[i]) {
                return i;
            }
        }
        return 15;
    }

    function _random(uint256 mod) internal returns (uint256) {
        randNonce++;
        return uint256(keccak256(abi.encodePacked(block.timestamp, msg.sender, randNonce))) % mod;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        ownerOf(tokenId); // ensure it exists
        return string(abi.encodePacked(
            baseURI,
            Strings.toString(uint256(tokenFrame[tokenId])),
            ".json"
        ));
    }

    function rescueETH(uint256 amount) external onlyOwner {
        require(address(this).balance >= amount, "Low ETH");
        payable(owner()).transfer(amount);
    }

    receive() external payable {}
    fallback() external payable {}

    // ────────────────────────────────────────────────
    // Overrides for Solidity’s multiple inheritance
    // ────────────────────────────────────────────────

    function _increaseBalance(address account, uint128 amount)
        internal
        virtual
        override(ERC721, ERC721Enumerable)
    {
        super._increaseBalance(account, amount);
    }

    function _update(address to, uint256 tokenId, address auth)
        internal
        virtual
        override(ERC721, ERC721Enumerable)
        returns (address)
    {
        return super._update(to, tokenId, auth);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC721, ERC721Enumerable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}

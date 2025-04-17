// contracts/Mizontresh.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.6;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Mizontresh is ERC721Enumerable, Ownable {
    string public baseURI;
    uint256 public constant MAX_SUPPLY  = 64;
    uint256 public constant FREE_TOKENS = 8;
    uint256 public constant TOKEN_PRICE = 0.5122018 ether;
    address public fundsRecipient;
    uint256 public currentTokenId;

    constructor(string memory _baseURI, address _fundsRecipient)
        ERC721("Mizontresh", "MIZT")
        Ownable(_fundsRecipient)
    {
        baseURI        = _baseURI;
        fundsRecipient = _fundsRecipient;

        for (uint256 i = 0; i < FREE_TOKENS; i++) {
            _mint(fundsRecipient, currentTokenId++);
        }
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(tokenId < currentTokenId, "nonexistent");
        return string(abi.encodePacked(baseURI, "1024.json"));
    }

    function buyToken() external payable {
        require(currentTokenId < MAX_SUPPLY, "sold out");
        require(msg.value >= TOKEN_PRICE, "low ETH");

        _mint(msg.sender, currentTokenId++);
        uint256 paid   = TOKEN_PRICE;
        uint256 excess = msg.value - paid;
        (bool sent,) = payable(fundsRecipient).call{value:paid}(""); require(sent,"send fail");
        if (excess > 0) {
            (bool r,) = payable(msg.sender).call{value:excess}(""); require(r,"refund fail");
        }
    }

    function withdraw() external onlyOwner {
        uint256 bal = address(this).balance;
        require(bal > 0, "no funds");
        (bool s,) = payable(fundsRecipient).call{value:bal}(""); require(s,"fail");
    }

    function tokenAwardedItem(uint256 tokenId) external view returns (uint256) {
        require(tokenId < currentTokenId, "nonexistent");
        return 1024;
    }

    receive() external payable {}
    fallback() external payable {}
}

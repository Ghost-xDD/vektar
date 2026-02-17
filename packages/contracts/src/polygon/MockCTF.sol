// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

/// @title MockCTF
/// @notice Mock Polymarket CTF Exchange (ERC-1155) for testnet demos
/// @dev Allows anyone to mint tokens for testing collateral escrow
contract MockCTF is ERC1155 {
    /// @notice Token metadata (optional, for UI)
    mapping(uint256 => string) public tokenURIs;
    
    constructor() ERC1155("https://clob.polymarket.com/token/{id}") {}
    
    /// @notice Mint tokens for testing
    /// @param to Recipient address
    /// @param id Token ID (Polymarket uses large uint256 IDs)
    /// @param amount Amount to mint (in wei, e.g., 1e18 = 1 token)
    function mint(address to, uint256 id, uint256 amount) external {
        _mint(to, id, amount, "");
    }
    
    /// @notice Batch mint for efficiency
    /// @param to Recipient address
    /// @param ids Array of token IDs
    /// @param amounts Array of amounts
    function mintBatch(address to, uint256[] memory ids, uint256[] memory amounts) external {
        _mintBatch(to, ids, amounts, "");
    }
    
    /// @notice Set token URI (optional)
    function setTokenURI(uint256 id, string memory uri) external {
        tokenURIs[id] = uri;
    }
    
    /// @notice Override to use custom URIs if set
    function uri(uint256 id) public view override returns (string memory) {
        string memory tokenURI = tokenURIs[id];
        if (bytes(tokenURI).length > 0) {
            return tokenURI;
        }
        return super.uri(id);
    }
}

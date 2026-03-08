// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {IERC1155Receiver} from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/// @title CollateralEscrow
/// @notice Locks Polymarket CTF (ERC-1155) tokens as collateral for cross-chain lending
/// @dev Deployed on Polygon where Polymarket lives. Only CRE DON can authorize releases.
contract CollateralEscrow is IERC1155Receiver {
    // Report routing selectors (function selectors)
    bytes4 private constant RELEASE_COLLATERAL_SELECTOR = 0xb21477d1; // releaseCollateral(address,uint256,uint256)
    bytes4 private constant RELEASE_ON_SETTLEMENT_SELECTOR = 0x0ec32eb9; // releaseOnSettlement(address,uint256,uint8)

    /// @notice Polymarket CTF Exchange address (ERC-1155)
    address public immutable CTF_EXCHANGE;
    
    /// @notice CRE forwarder address - only this can authorize collateral releases
    address public immutable CRE_FORWARDER;
    
    /// @notice Locked balance per user per token
    /// @dev user => tokenId => locked amount
    mapping(address => mapping(uint256 => uint256)) public lockedBalance;
    
    /// @notice Total locked per token across all users
    mapping(uint256 => uint256) public totalLockedPerToken;
    
    // Events
    event CollateralDeposited(address indexed user, uint256 indexed tokenId, uint256 amount);
    event CollateralReleased(address indexed user, uint256 indexed tokenId, uint256 amount);
    event CollateralReleasedOnSettlement(
        address indexed user, 
        uint256 indexed tokenId, 
        uint256 amount, 
        uint8 outcome
    );
    
    // Errors
    error OnlyCREForwarder();
    error InsufficientLockedBalance();
    error InvalidAmount();
    error TransferFailed();
    
    constructor(address _ctfExchange, address _creForwarder) {
        CTF_EXCHANGE = _ctfExchange;
        CRE_FORWARDER = _creForwarder;
    }
    
    modifier onlyCREForwarder() {
        if (msg.sender != CRE_FORWARDER) revert OnlyCREForwarder();
        _;
    }

    /// @notice Entry point for Chainlink Forwarder - routes reports to appropriate function
    /// @param metadata Workflow metadata (unused)
    /// @param report ABI-encoded function selector + parameters
    function onReport(bytes calldata metadata, bytes calldata report) external onlyCREForwarder {
        bytes4 selector = bytes4(report[0:4]);

        if (selector == RELEASE_COLLATERAL_SELECTOR) {
            (address user, uint256 tokenId, uint256 amount) = abi.decode(report[4:], (address, uint256, uint256));
            _releaseCollateral(user, tokenId, amount);
        } else if (selector == RELEASE_ON_SETTLEMENT_SELECTOR) {
            (address user, uint256 tokenId, uint8 outcome) = abi.decode(report[4:], (address, uint256, uint8));
            _releaseOnSettlement(user, tokenId, outcome);
        } else {
            revert("Unknown function selector");
        }
    }
    
    /// @notice User deposits prediction market shares as collateral
    /// @param tokenId The CTF token ID (represents a specific prediction market outcome)
    /// @param amount Amount of shares to lock
    function depositCollateral(uint256 tokenId, uint256 amount) external {
        if (amount == 0) revert InvalidAmount();
        
        // Transfer CTF tokens from user to this contract
        IERC1155(CTF_EXCHANGE).safeTransferFrom(
            msg.sender,
            address(this),
            tokenId,
            amount,
            ""
        );
        
        lockedBalance[msg.sender][tokenId] += amount;
        totalLockedPerToken[tokenId] += amount;
        
        emit CollateralDeposited(msg.sender, tokenId, amount);
    }
    
    /// @notice Release collateral back to user (only callable by CRE DON after loan repayment)
    /// @param user The user to release collateral to
    /// @param tokenId The CTF token ID
    /// @param amount Amount to release
    function releaseCollateral(
        address user,
        uint256 tokenId,
        uint256 amount
    ) external onlyCREForwarder {
        _releaseCollateral(user, tokenId, amount);
    }

    function _releaseCollateral(address user, uint256 tokenId, uint256 amount) internal {
        if (amount == 0) revert InvalidAmount();
        if (lockedBalance[user][tokenId] < amount) revert InsufficientLockedBalance();
        
        lockedBalance[user][tokenId] -= amount;
        totalLockedPerToken[tokenId] -= amount;
        
        IERC1155(CTF_EXCHANGE).safeTransferFrom(
            address(this),
            user,
            tokenId,
            amount,
            ""
        );
        
        emit CollateralReleased(user, tokenId, amount);
    }
    
    /// @notice Release collateral on market settlement (called by CRE after event resolution)
    /// @param user The user to release collateral to
    /// @param tokenId The CTF token ID
    /// @param outcome The market outcome (0 = No, 1 = Yes)
    function releaseOnSettlement(
        address user,
        uint256 tokenId,
        uint8 outcome
    ) external onlyCREForwarder {
        _releaseOnSettlement(user, tokenId, outcome);
    }

    function _releaseOnSettlement(address user, uint256 tokenId, uint8 outcome) internal {
        uint256 amount = lockedBalance[user][tokenId];
        if (amount == 0) {
            // Emit even when no collateral is locked so indexers/UI can track settlement attempts.
            emit CollateralReleasedOnSettlement(user, tokenId, 0, outcome);
            return;
        }
        
        lockedBalance[user][tokenId] = 0;
        totalLockedPerToken[tokenId] -= amount;
        
        // Transfer winning/losing shares back to user
        // (They can redeem winning shares for $1.00 on Polymarket)
        IERC1155(CTF_EXCHANGE).safeTransferFrom(
            address(this),
            user,
            tokenId,
            amount,
            ""
        );
        
        emit CollateralReleasedOnSettlement(user, tokenId, amount, outcome);
    }
    
    /// @notice CRE reads this to verify locked collateral (not just balanceOf)
    /// @param user The user address
    /// @param tokenId The CTF token ID
    /// @return The locked balance for this user and token
    function getLockedBalance(address user, uint256 tokenId) 
        external 
        view 
        returns (uint256) 
    {
        return lockedBalance[user][tokenId];
    }
    
    /// @notice Get total locked collateral for a token across all users
    /// @param tokenId The CTF token ID
    /// @return The total locked amount
    function getTotalLocked(uint256 tokenId) external view returns (uint256) {
        return totalLockedPerToken[tokenId];
    }
    
    // ERC-1155 Receiver implementation
    function onERC1155Received(
        address,
        address,
        uint256,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        return this.onERC1155Received.selector;
    }
    
    function onERC1155BatchReceived(
        address,
        address,
        uint256[] calldata,
        uint256[] calldata,
        bytes calldata
    ) external pure override returns (bytes4) {
        return this.onERC1155BatchReceived.selector;
    }
    
    function supportsInterface(bytes4 interfaceId) 
        external 
        pure 
        override 
        returns (bool) 
    {
        return interfaceId == type(IERC1155Receiver).interfaceId ||
               interfaceId == type(IERC165).interfaceId;
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title HorizonVault
/// @notice Tracks user positions, manages Dynamic LTV, and handles liquidations
/// @dev Deployed on Base. Updated by CRE DON with real-time liquidity data from Polymarket
contract HorizonVault {
    /// @notice Function selectors for routing
    bytes4 private constant UPDATE_MARKET_LTV_SELECTOR = 0x2442fe4a; // updateMarketLTV(uint256,uint256,bytes)
    bytes4 private constant MARK_LIQUIDATABLE_SELECTOR = 0x9c26443c; // markLiquidatable(address,uint256,bytes)
    bytes4 private constant SETTLE_LOAN_SELECTOR = 0x008b0dd5; // settleLoan(address,uint256,uint8,int256,bytes)
    /// @notice CRE forwarder address - only this can update LTV and mark liquidations
    address public immutable CRE_FORWARDER;
    
    /// @notice Maximum LTV increase per CRE update (basis points)
    /// @dev Configurable via constructor. Recommended values:
    ///      - Demo: 10000 (100%, instant updates)
    ///      - Production: 200-1000 (2-10%, prevents spoofing attacks)
    uint256 public immutable MAX_LTV_INCREASE_PER_UPDATE;
    
    /// @notice Liquidation bonus for liquidators (basis points)
    uint256 public constant LIQUIDATION_BONUS = 500; // 5%
    
    /// @notice Grace period before liquidation can be executed (in seconds)
    uint256 public constant LIQUIDATION_GRACE_PERIOD = 24; // 2 CRE cycles
    
    /// @notice User position data
    struct Position {
        uint256 tokenId;              // Polymarket CTF token ID
        uint256 collateralAmount;     // Amount locked on Polygon (verified by CRE)
        uint256 debtAmount;           // USDC borrowed on Base
        uint256 lastLTVUpdate;        // Timestamp of last LTV update
        bool liquidatable;            // Set by CRE when healthFactor < 1.0
        uint256 liquidatableTimestamp; // When position was marked liquidatable
        address polygonAddress;       // User's address on Polygon (for collateral release)
    }
    
    /// @notice Market-level LTV data (same for all users in a market)
    struct MarketData {
        uint256 currentLTV;           // Current dynamic LTV (basis points, 0-10000)
        uint256 lastUpdate;           // Timestamp of last update
        uint256 totalCollateral;      // Total collateral locked across all users
        bool active;                  // Whether this market is actively monitored
    }
    
    /// @notice User positions: user => tokenId => Position
    mapping(address => mapping(uint256 => Position)) public positions;
    
    /// @notice Market LTV data: tokenId => MarketData
    mapping(uint256 => MarketData) public markets;
    
    /// @notice Active market IDs for CRE to iterate over
    uint256[] public activeMarketIds;
    mapping(uint256 => uint256) public marketIdIndex; // tokenId => index in activeMarketIds
    
    /// @notice Liquidation claims: liquidator => tokenId => amount
    mapping(address => mapping(uint256 => uint256)) public collateralClaims;
    
    // Events
    event MarketLTVUpdated(
        uint256 indexed tokenId,
        uint256 oldLTV,
        uint256 newLTV,
        uint256 timestamp
    );
    event PositionOpened(
        address indexed user,
        uint256 indexed tokenId,
        uint256 collateralAmount,
        uint256 debtAmount
    );
    event PositionMarkedLiquidatable(
        address indexed user,
        uint256 indexed tokenId,
        uint256 timestamp
    );
    event PositionLiquidated(
        address indexed user,
        address indexed liquidator,
        uint256 indexed tokenId,
        uint256 debtRepaid,
        uint256 collateralClaimed
    );
    event LoanSettled(
        address indexed user,
        uint256 indexed tokenId,
        uint8 outcome,
        int256 netSettlement
    );
    
    // Errors
    error OnlyCREForwarder();
    error MarketNotActive();
    error PositionNotLiquidatable();
    error GracePeriodNotElapsed();
    error InsufficientCollateral();
    
    /// @param _creForwarder Chainlink Forwarder address
    /// @param _maxLtvIncreasePerUpdate Max LTV increase per cycle in basis points (200 = 2%)
    constructor(address _creForwarder, uint256 _maxLtvIncreasePerUpdate) {
        require(_creForwarder != address(0), "Invalid forwarder");
        require(_maxLtvIncreasePerUpdate > 0 && _maxLtvIncreasePerUpdate <= 10000, "Invalid max LTV increase");
        
        CRE_FORWARDER = _creForwarder;
        MAX_LTV_INCREASE_PER_UPDATE = _maxLtvIncreasePerUpdate;
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
        
        if (selector == UPDATE_MARKET_LTV_SELECTOR) {
            // Decode: selector + uint256 tokenId + uint256 newLTV + bytes proof
            (uint256 tokenId, uint256 newLTV, bytes memory proof) = abi.decode(report[4:], (uint256, uint256, bytes));
            _updateMarketLTV(tokenId, newLTV, proof);
        } else if (selector == MARK_LIQUIDATABLE_SELECTOR) {
            // Decode: selector + address user + uint256 tokenId + bytes proof
            (address user, uint256 tokenId, bytes memory proof) = abi.decode(report[4:], (address, uint256, bytes));
            _markLiquidatable(user, tokenId, proof);
        } else if (selector == SETTLE_LOAN_SELECTOR) {
            // Decode: selector + address user + uint256 tokenId + uint8 outcome + int256 netSettlement + bytes proof
            (address user, uint256 tokenId, uint8 outcome, int256 netSettlement, bytes memory proof) =
                abi.decode(report[4:], (address, uint256, uint8, int256, bytes));
            _settleLoan(user, tokenId, outcome, netSettlement, proof);
        } else {
            revert("Unknown function selector");
        }
    }
    
    /// @notice Update market-level LTV (called by CRE every 12s)
    /// @param tokenId The Polymarket token ID
    /// @param newLTV New LTV in basis points (0-10000)
    /// @param proof Cryptographic proof from CRE DON
    function _updateMarketLTV(
        uint256 tokenId,
        uint256 newLTV,
        bytes memory proof
    ) internal {
        MarketData storage market = markets[tokenId];
        uint256 currentLTV = market.currentLTV;
        
        // Rate limiting: LTV can decrease freely (safety), but increases are rate-limited
        if (newLTV > currentLTV) {
            uint256 maxIncrease = currentLTV + MAX_LTV_INCREASE_PER_UPDATE;
            if (newLTV > maxIncrease) {
                newLTV = maxIncrease;
            }
        }
        
        market.currentLTV = newLTV;
        market.lastUpdate = block.timestamp;
        
        // Activate market if not already active
        if (!market.active) {
            market.active = true;
            marketIdIndex[tokenId] = activeMarketIds.length;
            activeMarketIds.push(tokenId);
        }
        
        emit MarketLTVUpdated(tokenId, currentLTV, newLTV, block.timestamp);
    }
    
    /// @notice Mark a position as liquidatable (called by CRE when healthFactor < 1.0)
    /// @param user The user address
    /// @param tokenId The token ID
    /// @param proof Cryptographic proof from CRE DON
    function _markLiquidatable(
        address user,
        uint256 tokenId,
        bytes memory proof
    ) internal {
        Position storage pos = positions[user][tokenId];
        
        if (!pos.liquidatable) {
            pos.liquidatable = true;
            pos.liquidatableTimestamp = block.timestamp;
            emit PositionMarkedLiquidatable(user, tokenId, block.timestamp);
        }
    }
    
    /// @notice Execute liquidation (callable by anyone after grace period)
    /// @param user The user to liquidate
    /// @param tokenId The token ID
    function liquidate(address user, uint256 tokenId) external {
        Position storage pos = positions[user][tokenId];
        
        if (!pos.liquidatable) revert PositionNotLiquidatable();
        if (block.timestamp < pos.liquidatableTimestamp + LIQUIDATION_GRACE_PERIOD) {
            revert GracePeriodNotElapsed();
        }
        
        uint256 debt = pos.debtAmount;
        uint256 collateral = pos.collateralAmount;
        
        // Liquidator receives claim on collateral + bonus
        uint256 bonus = (debt * LIQUIDATION_BONUS) / 10000;
        collateralClaims[msg.sender][tokenId] += collateral;
        
        // Clear position
        pos.debtAmount = 0;
        pos.liquidatable = false;
        
        emit PositionLiquidated(msg.sender, user, tokenId, debt, collateral);
        
        // Note: Actual collateral transfer happens on Polygon via CRE
        // Liquidator can claim by calling CRE which releases from escrow
    }
    
    /// @notice Settle loan on market resolution (called by CRE when UMA resolves)
    /// @param user The user address
    /// @param tokenId The token ID
    /// @param outcome Market outcome (0 = No, 1 = Yes)
    /// @param netSettlement Net settlement amount (can be negative)
    /// @param proof Cryptographic proof from CRE DON
    function settleLoan(
        address user,
        uint256 tokenId,
        uint8 outcome,
        int256 netSettlement,
        bytes calldata proof
    ) external onlyCREForwarder {
        _settleLoan(user, tokenId, outcome, netSettlement, proof);
    }

    function _settleLoan(
        address user,
        uint256 tokenId,
        uint8 outcome,
        int256 netSettlement,
        bytes memory proof
    ) internal {
        Position storage pos = positions[user][tokenId];
        
        // Clear position
        pos.debtAmount = 0;
        pos.liquidatable = false;
        
        emit LoanSettled(user, tokenId, outcome, netSettlement);
        
        // Note: Actual settlement payout happens via lending pool
        // Collateral release happens on Polygon via CRE
    }
    
    /// @notice Open a new position (called when user borrows)
    /// @param user The user address
    /// @param tokenId The token ID
    /// @param collateralAmount Amount of collateral locked on Polygon
    /// @param debtAmount Amount of USDC borrowed
    function openPosition(
        address user,
        uint256 tokenId,
        uint256 collateralAmount,
        uint256 debtAmount,
        address polygonAddress
    ) external {
        // TODO: Add access control (lending pool contract)
        Position storage pos = positions[user][tokenId];
        
        pos.tokenId = tokenId;
        pos.collateralAmount += collateralAmount;
        pos.debtAmount += debtAmount;
        pos.polygonAddress = polygonAddress;
        pos.lastLTVUpdate = block.timestamp;
        
        // Update market total collateral
        markets[tokenId].totalCollateral += collateralAmount;
        
        emit PositionOpened(user, tokenId, collateralAmount, debtAmount);
    }
    
    /// @notice Get active markets for CRE to iterate
    function getActiveMarkets() external view returns (uint256[] memory) {
        return activeMarketIds;
    }
    
    /// @notice Get underwater positions for a market (healthFactor < 1.0)
    /// @param tokenId The token ID
    /// @return Array of user addresses with underwater positions
    function getUnderwaterPositions(uint256 tokenId) 
        external 
        view 
        returns (address[] memory) 
    {
        // TODO: Implement efficient iteration over positions
        // For hackathon: Can maintain a separate array of position holders
        return new address[](0);
    }
    
    /// @notice Calculate health factor for a position
    /// @param user The user address
    /// @param tokenId The token ID
    /// @return Health factor in basis points (10000 = 1.0)
    function calculateHealthFactor(address user, uint256 tokenId) 
        public 
        view 
        returns (uint256) 
    {
        Position storage pos = positions[user][tokenId];
        if (pos.debtAmount == 0) return type(uint256).max;
        
        MarketData storage market = markets[tokenId];
        
        // healthFactor = (collateralValue * LTV) / debt
        uint256 collateralValue = pos.collateralAmount; // Assuming $1.00 per share (simplified)
        uint256 maxBorrow = (collateralValue * market.currentLTV) / 10000;
        
        if (pos.debtAmount > maxBorrow) return 0;
        
        return (maxBorrow * 10000) / pos.debtAmount;
    }
}

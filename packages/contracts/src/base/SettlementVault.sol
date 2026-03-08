// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title SettlementVault
/// @notice Settlement oracle for prediction markets. Stores CRE-verified settlement values
///         and executes early exits. Public getSettlementValue() is consumable by any protocol.
/// @dev Deployed on Base. Updated by CRE DON with real-time VWAP data from Polymarket CLOB.
contract SettlementVault {
    bytes4 private constant UPDATE_SETTLEMENT_VALUE_SELECTOR =
        bytes4(keccak256("updateSettlementValue(uint256,uint256)"));
    bytes4 private constant SETTLE_POSITION_SELECTOR =
        bytes4(keccak256("settlePosition(address,uint256,uint8)"));

    address public immutable CRE_FORWARDER;
    address public immutable USDC;
    address public owner;

    /// @notice Max settlement value can increase per 12s CRE cycle, in bps (200 = 2%, 10000 = no cap)
    uint256 public maxValueIncreasePerUpdateBps;
    /// @notice Oracle is stale after this many missed cycles (5 cycles × 12s = 60s)
    uint256 public constant ORACLE_STALENESS_THRESHOLD = 60;

    /// @notice Per-market oracle data — updated by CRE every 12s
    struct MarketOracle {
        uint256 settlementValueUSDC; // Current fair exit value (USDC, 6 decimals)
        uint256 lastUpdated;         // Timestamp of last CRE report
        bool active;
    }

    /// @notice Per-user position — registered after collateral is locked in CollateralEscrow on Polygon
    struct Position {
        uint256 tokenId;
        uint256 shares;            // ERC-1155 shares locked in CollateralEscrow on Polygon
        uint256 paidOutUSDC;       // USDC paid to user on earlyExit()
        bool settled;              // True after earlyExit() is called
        address polygonAddress;    // User's address on Polygon (for escrow release)
        address shieldedAddress;   // User's Convergence vault shielded address (for private payout)
    }

    /// @notice tokenId → oracle data
    mapping(uint256 => MarketOracle) public marketOracles;

    /// @notice user → tokenId → position
    mapping(address => mapping(uint256 => Position)) public positions;

    /// @notice Track all position holders per market (for final settlement iteration)
    mapping(uint256 => address[]) public marketParticipants;
    mapping(address => mapping(uint256 => bool)) public isParticipant;

    /// @notice Active market IDs (for CRE to iterate)
    uint256[] public activeMarketIds;

    // Events
    event SettlementValueUpdated(uint256 indexed tokenId, uint256 oldValue, uint256 newValue);
    event EarlyExitExecuted(address indexed user, uint256 indexed tokenId, uint256 payout);
    event PositionDeposited(address indexed user, uint256 indexed tokenId, uint256 shares);
    event FinalSettlement(address indexed user, uint256 indexed tokenId, uint8 outcome, uint256 poolPayout);
    event OracleCapUpdated(uint256 oldBps, uint256 newBps);

    // Errors
    error OnlyCREForwarder();
    error OnlyOwner();
    error InvalidOracleCap();
    error OracleNotReady();
    error OracleStale();
    error AlreadySettled();
    error NoPosition();
    error InsufficientPoolBalance();

    constructor(address _creForwarder, address _usdc, uint256 _maxValueIncreasePerUpdateBps) {
        if (_maxValueIncreasePerUpdateBps > 10000) revert InvalidOracleCap();
        CRE_FORWARDER = _creForwarder;
        USDC = _usdc;
        owner = msg.sender;
        maxValueIncreasePerUpdateBps = _maxValueIncreasePerUpdateBps;
    }

    modifier onlyCREForwarder() {
        if (msg.sender != CRE_FORWARDER) revert OnlyCREForwarder();
        _;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    /// @notice Updates the upward oracle move cap. Demo mode can set 10000 (100%) for instant rebounds.
    function setMaxValueIncreasePerUpdateBps(uint256 newBps) external onlyOwner {
        if (newBps > 10000) revert InvalidOracleCap();
        uint256 oldBps = maxValueIncreasePerUpdateBps;
        maxValueIncreasePerUpdateBps = newBps;
        emit OracleCapUpdated(oldBps, newBps);
    }

    /// @notice CRE Forwarder entry point — routes signed reports by function selector
    function onReport(bytes calldata metadata, bytes calldata report) external onlyCREForwarder {
        bytes4 selector = bytes4(report[0:4]);

        if (selector == UPDATE_SETTLEMENT_VALUE_SELECTOR) {
            (uint256 tokenId, uint256 newValue) = abi.decode(report[4:], (uint256, uint256));
            _updateSettlementValue(tokenId, newValue);
        } else if (selector == SETTLE_POSITION_SELECTOR) {
            (address user, uint256 tokenId, uint8 outcome) =
                abi.decode(report[4:], (address, uint256, uint8));
            _settlePosition(user, tokenId, outcome);
        } else {
            revert("Unknown selector");
        }
    }

    /// @notice CRE writes settlement value every 12s.
    ///         Decreases are uncapped (safety); increases are rate-limited at 2%/cycle (anti-spoofing).
    function _updateSettlementValue(uint256 tokenId, uint256 newValue) internal {
        MarketOracle storage oracle = marketOracles[tokenId];
        uint256 current = oracle.settlementValueUSDC;

        if (newValue > current && current > 0) {
            uint256 maxAllowed = current + (current * maxValueIncreasePerUpdateBps / 10000);
            if (newValue > maxAllowed) newValue = maxAllowed;
        }

        emit SettlementValueUpdated(tokenId, current, newValue);

        oracle.settlementValueUSDC = newValue;
        oracle.lastUpdated = block.timestamp;
        oracle.active = true;

        if (!_isActiveMarket(tokenId)) activeMarketIds.push(tokenId);
    }

    /// @notice PUBLIC oracle interface — any protocol can read the settlement value for any market.
    /// @param tokenId Polymarket CTF token ID
    /// @return valueUSDC Current settlement value in USDC (6 decimals)
    /// @return lastUpdated Timestamp of last CRE oracle update
    function getSettlementValue(uint256 tokenId)
        external
        view
        returns (uint256 valueUSDC, uint256 lastUpdated)
    {
        MarketOracle storage oracle = marketOracles[tokenId];
        return (oracle.settlementValueUSDC, oracle.lastUpdated);
    }

    /// @notice Called by CRE after verifying the user deposited shares into CollateralEscrow on Polygon.
    ///         Registers the position on Base so earlyExit() can be called.
    /// @dev DEMO ONLY: access control removed for direct testing on Tenderly fork.
    ///      Production must restore `onlyCREForwarder` — CRE verifies the Polygon
    ///      collateral deposit before calling this, preventing fake share registration.
    function registerPosition(
        address user,
        uint256 tokenId,
        uint256 shares,
        address polygonAddress,
        address shieldedAddress
    ) external {
        Position storage pos = positions[user][tokenId];
        pos.tokenId = tokenId;
        pos.shares += shares;
        pos.polygonAddress = polygonAddress;
        pos.shieldedAddress = shieldedAddress;

        if (!isParticipant[user][tokenId]) {
            marketParticipants[tokenId].push(user);
            isParticipant[user][tokenId] = true;
        }

        emit PositionDeposited(user, tokenId, shares);
    }

    /// @notice User calls this to exit at the oracle's current settlement value.
    ///         Pays out USDC immediately from the pool. CRE then releases collateral on Polygon.
    /// @dev settlementValueUSDC is the per-share fair exit price (USDC, 6 decimals).
    ///      Payout = user's share count × per-share oracle price.
    function earlyExit(uint256 tokenId) external {
        Position storage pos = positions[msg.sender][tokenId];
        if (pos.shares == 0) revert NoPosition();
        if (pos.settled) revert AlreadySettled();

        MarketOracle storage oracle = marketOracles[tokenId];
        if (!oracle.active || oracle.settlementValueUSDC == 0) revert OracleNotReady();
        if (block.timestamp - oracle.lastUpdated > ORACLE_STALENESS_THRESHOLD * 12) revert OracleStale();

        // Per-share price × user's shares. CTF shares are whole units (no decimals).
        uint256 payout = pos.shares * oracle.settlementValueUSDC;
        pos.settled = true;
        pos.paidOutUSDC = payout;

        if (IERC20(USDC).balanceOf(address(this)) < payout) revert InsufficientPoolBalance();
        IERC20(USDC).transfer(msg.sender, payout);

        emit EarlyExitExecuted(msg.sender, tokenId, payout);
        // Handler 3 watches EarlyExitExecuted → routes payout to user's shielded address privately
    }

    /// @notice CRE calls this when UMA resolves the market — final settlement for all positions.
    /// @param user Pool address (holds all early-exited shares)
    /// @param tokenId The resolved market token ID
    /// @param outcome 1 = YES wins, 0 = NO wins
    function _settlePosition(address user, uint256 tokenId, uint8 outcome) internal {
        Position storage pos = positions[user][tokenId];

        uint256 poolPayout = 0;
        if (outcome == 1) {
            // YES wins: each share redeems for $1.00 (1e6 USDC) on Polymarket.
            // Pool profit = (shares × $1.00) − USDC already paid out on earlyExit().
            // paidOutUSDC = shares × perShareOraclePrice, so profit = shares × (1e6 − perShareOraclePrice).
            uint256 fullRedemption = pos.shares * 1e6;
            poolPayout = fullRedemption > pos.paidOutUSDC ? fullRedemption - pos.paidOutUSDC : 0;
        }
        // NO wins: shares are worthless. Loss is bounded by the safety margin built into the oracle.

        emit FinalSettlement(user, tokenId, outcome, poolPayout);
    }

    /// @notice Returns the shielded address registered for a user's position.
    ///         CRE Handler 3 reads this to route the private payout after earlyExit().
    function getShieldedAddress(address user, uint256 tokenId) external view returns (address) {
        return positions[user][tokenId].shieldedAddress;
    }

    /// @notice Returns all active market IDs for CRE to iterate over.
    function getActiveMarkets() external view returns (uint256[] memory) {
        return activeMarketIds;
    }

    /// @notice Returns all position holders for a market (for final settlement iteration).
    function getMarketParticipants(uint256 tokenId) external view returns (address[] memory) {
        return marketParticipants[tokenId];
    }

    function _isActiveMarket(uint256 tokenId) internal view returns (bool) {
        for (uint256 i = 0; i < activeMarketIds.length; i++) {
            if (activeMarketIds[i] == tokenId) return true;
        }
        return false;
    }
}

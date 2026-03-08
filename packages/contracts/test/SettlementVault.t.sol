// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {SettlementVault} from "../src/base/SettlementVault.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}

contract SettlementVaultTest is Test {
    SettlementVault public vault;
    MockUSDC public usdc;

    address public owner;
    address public user1;
    address public user2;

    uint256 constant TOKEN_ID = 12345;
    uint256 constant SHARES = 20_000;
    uint256 constant ORACLE_CAP_BPS = 200; // 2%

    function setUp() public {
        owner = address(this);
        user1 = makeAddr("user1");
        user2 = makeAddr("user2");

        usdc = new MockUSDC();
        usdc.mint(owner, 1_000_000 * 1e6);

        // Use owner as CRE_FORWARDER for tests
        vault = new SettlementVault(owner, address(usdc), ORACLE_CAP_BPS);
        usdc.transfer(address(vault), 100_000 * 1e6);
    }

    function _updateSettlementValue(uint256 tokenId, uint256 newValue) internal {
        bytes memory report = abi.encodeWithSelector(
            bytes4(keccak256("updateSettlementValue(uint256,uint256)")),
            tokenId,
            newValue
        );
        vm.prank(owner);
        vault.onReport("", report);
    }

    function test_Constructor() public view {
        assertEq(vault.CRE_FORWARDER(), owner);
        assertEq(vault.USDC(), address(usdc));
        assertEq(vault.owner(), owner);
        assertEq(vault.maxValueIncreasePerUpdateBps(), ORACLE_CAP_BPS);
    }

    function test_UpdateSettlementValue_OnlyCREForwarder() public {
        vm.prank(user1);
        vm.expectRevert(SettlementVault.OnlyCREForwarder.selector);
        bytes memory report = abi.encodeWithSelector(
            bytes4(keccak256("updateSettlementValue(uint256,uint256)")),
            TOKEN_ID,
            uint256(1e6)
        );
        vault.onReport("", report);
    }

    function test_UpdateSettlementValue_Success() public {
        _updateSettlementValue(TOKEN_ID, 300_000); // $0.30 per share (6 decimals)

        (uint256 value, uint256 lastUpdated) = vault.getSettlementValue(TOKEN_ID);
        assertEq(value, 300_000);
        assertEq(lastUpdated, block.timestamp);
    }

    function test_UpdateSettlementValue_RateLimitIncrease() public {
        _updateSettlementValue(TOKEN_ID, 100_000); // $0.10

        // 2% cap: max increase = 100_000 * 1.02 = 102_000
        _updateSettlementValue(TOKEN_ID, 150_000); // Request $0.15, should cap to 102_000
        (uint256 value,) = vault.getSettlementValue(TOKEN_ID);
        assertEq(value, 102_000);
    }

    function test_UpdateSettlementValue_DecreaseUncapped() public {
        _updateSettlementValue(TOKEN_ID, 500_000);
        _updateSettlementValue(TOKEN_ID, 100_000); // Large decrease allowed
        (uint256 value,) = vault.getSettlementValue(TOKEN_ID);
        assertEq(value, 100_000);
    }

    function test_RegisterPosition() public {
        vm.prank(owner);
        vault.registerPosition(user1, TOKEN_ID, SHARES, user1, address(0x1));

        (uint256 tokenId, uint256 shares,, bool settled,,) = vault.positions(user1, TOKEN_ID);
        assertEq(tokenId, TOKEN_ID);
        assertEq(shares, SHARES);
        assertFalse(settled);

        address[] memory participants = vault.getMarketParticipants(TOKEN_ID);
        assertEq(participants.length, 1);
        assertEq(participants[0], user1);
    }

    function test_EarlyExit_Success() public {
        _updateSettlementValue(TOKEN_ID, 300_000); // $0.30/share
        vm.prank(owner);
        vault.registerPosition(user1, TOKEN_ID, SHARES, user1, address(0x1));

        uint256 expectedPayout = SHARES * 300_000; // 20_000 * 0.30 = 6000 USDC (6 decimals)
        uint256 balanceBefore = usdc.balanceOf(user1);

        vm.prank(user1);
        vault.earlyExit(TOKEN_ID);

        assertEq(usdc.balanceOf(user1) - balanceBefore, expectedPayout);
        (,, uint256 paidOut, bool settled,,) = vault.positions(user1, TOKEN_ID);
        assertEq(paidOut, expectedPayout);
        assertTrue(settled);
    }

    function test_EarlyExit_RevertNoPosition() public {
        _updateSettlementValue(TOKEN_ID, 300_000);
        vm.prank(user1);
        vm.expectRevert(SettlementVault.NoPosition.selector);
        vault.earlyExit(TOKEN_ID);
    }

    function test_EarlyExit_RevertAlreadySettled() public {
        _updateSettlementValue(TOKEN_ID, 300_000);
        vm.prank(owner);
        vault.registerPosition(user1, TOKEN_ID, SHARES, user1, address(0x1));
        vm.prank(user1);
        vault.earlyExit(TOKEN_ID);
        vm.prank(user1);
        vm.expectRevert(SettlementVault.AlreadySettled.selector);
        vault.earlyExit(TOKEN_ID);
    }

    function test_EarlyExit_RevertOracleNotReady() public {
        vm.prank(owner);
        vault.registerPosition(user1, TOKEN_ID, SHARES, user1, address(0x1));
        vm.prank(user1);
        vm.expectRevert(SettlementVault.OracleNotReady.selector);
        vault.earlyExit(TOKEN_ID);
    }

    function test_EarlyExit_RevertInsufficientPoolBalance() public {
        // Deploy vault with no USDC
        SettlementVault emptyVault = new SettlementVault(owner, address(usdc), ORACLE_CAP_BPS);
        bytes memory report = abi.encodeWithSelector(
            bytes4(keccak256("updateSettlementValue(uint256,uint256)")),
            TOKEN_ID,
            uint256(300_000)
        );
        vm.prank(owner);
        emptyVault.onReport("", report);
        vm.prank(owner);
        emptyVault.registerPosition(user1, TOKEN_ID, SHARES, user1, address(0x1));
        vm.prank(user1);
        vm.expectRevert(SettlementVault.InsufficientPoolBalance.selector);
        emptyVault.earlyExit(TOKEN_ID);
    }

    function test_SetMaxValueIncreasePerUpdateBps_OnlyOwner() public {
        vm.prank(user1);
        vm.expectRevert(SettlementVault.OnlyOwner.selector);
        vault.setMaxValueIncreasePerUpdateBps(500);
    }

    function test_SetMaxValueIncreasePerUpdateBps_InvalidCap() public {
        vm.expectRevert(SettlementVault.InvalidOracleCap.selector);
        vault.setMaxValueIncreasePerUpdateBps(10001);
    }

    function test_SetMaxValueIncreasePerUpdateBps_Success() public {
        vault.setMaxValueIncreasePerUpdateBps(500);
        assertEq(vault.maxValueIncreasePerUpdateBps(), 500);
    }

    function test_GetShieldedAddress() public {
        vm.prank(owner);
        vault.registerPosition(user1, TOKEN_ID, SHARES, user1, address(0xBEEF));
        assertEq(vault.getShieldedAddress(user1, TOKEN_ID), address(0xBEEF));
    }

    function test_SettlePosition_ViaOnReport() public {
        _updateSettlementValue(TOKEN_ID, 300_000);
        vm.prank(owner);
        vault.registerPosition(user1, TOKEN_ID, SHARES, user1, address(0x1));

        bytes memory report = abi.encodeWithSelector(
            bytes4(keccak256("settlePosition(address,uint256,uint8)")),
            user1,
            TOKEN_ID,
            uint8(1) // YES wins
        );
        vm.prank(owner);
        vault.onReport("", report);
        // Should emit FinalSettlement - no revert means success
    }

    function test_GetActiveMarkets() public {
        assertEq(vault.getActiveMarkets().length, 0);
        _updateSettlementValue(TOKEN_ID, 100_000);
        uint256[] memory markets = vault.getActiveMarkets();
        assertEq(markets.length, 1);
        assertEq(markets[0], TOKEN_ID);
    }
}

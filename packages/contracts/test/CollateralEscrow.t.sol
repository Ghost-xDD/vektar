// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {CollateralEscrow} from "../src/polygon/CollateralEscrow.sol";
import {MockCTF} from "../src/polygon/MockCTF.sol";

contract CollateralEscrowTest is Test {
    CollateralEscrow public escrow;
    MockCTF public ctf;

    address public creForwarder;
    address public user1;
    address public user2;

    uint256 constant TOKEN_ID = 12345;
    uint256 constant AMOUNT = 20_000;

    function setUp() public {
        creForwarder = address(this);
        user1 = makeAddr("user1");
        user2 = makeAddr("user2");

        ctf = new MockCTF();
        ctf.mint(user1, TOKEN_ID, AMOUNT);
        ctf.mint(user2, TOKEN_ID, AMOUNT * 2);

        escrow = new CollateralEscrow(address(ctf), creForwarder);
    }

    function test_Constructor() public view {
        assertEq(escrow.CTF_EXCHANGE(), address(ctf));
        assertEq(escrow.CRE_FORWARDER(), creForwarder);
    }

    function test_DepositCollateral() public {
        vm.startPrank(user1);
        ctf.setApprovalForAll(address(escrow), true);
        escrow.depositCollateral(TOKEN_ID, AMOUNT);
        vm.stopPrank();

        assertEq(escrow.getLockedBalance(user1, TOKEN_ID), AMOUNT);
        assertEq(escrow.getTotalLocked(TOKEN_ID), AMOUNT);
        assertEq(ctf.balanceOf(address(escrow), TOKEN_ID), AMOUNT);
        assertEq(ctf.balanceOf(user1, TOKEN_ID), 0);
    }

    function test_DepositCollateral_RevertInvalidAmount() public {
        vm.startPrank(user1);
        ctf.setApprovalForAll(address(escrow), true);
        vm.expectRevert(CollateralEscrow.InvalidAmount.selector);
        escrow.depositCollateral(TOKEN_ID, 0);
        vm.stopPrank();
    }

    function test_ReleaseCollateral_OnlyCREForwarder() public {
        vm.startPrank(user1);
        ctf.setApprovalForAll(address(escrow), true);
        escrow.depositCollateral(TOKEN_ID, AMOUNT);
        vm.stopPrank();

        vm.prank(user1);
        vm.expectRevert(CollateralEscrow.OnlyCREForwarder.selector);
        escrow.releaseCollateral(user1, TOKEN_ID, AMOUNT);
    }

    function test_ReleaseCollateral_Success() public {
        vm.startPrank(user1);
        ctf.setApprovalForAll(address(escrow), true);
        escrow.depositCollateral(TOKEN_ID, AMOUNT);
        vm.stopPrank();

        escrow.releaseCollateral(user1, TOKEN_ID, AMOUNT);

        assertEq(escrow.getLockedBalance(user1, TOKEN_ID), 0);
        assertEq(escrow.getTotalLocked(TOKEN_ID), 0);
        assertEq(ctf.balanceOf(user1, TOKEN_ID), AMOUNT);
        assertEq(ctf.balanceOf(address(escrow), TOKEN_ID), 0);
    }

    function test_ReleaseCollateral_RevertInsufficientBalance() public {
        vm.expectRevert(CollateralEscrow.InsufficientLockedBalance.selector);
        escrow.releaseCollateral(user1, TOKEN_ID, AMOUNT);
    }

    function test_ReleaseCollateral_RevertInvalidAmount() public {
        vm.startPrank(user1);
        ctf.setApprovalForAll(address(escrow), true);
        escrow.depositCollateral(TOKEN_ID, AMOUNT);
        vm.stopPrank();

        vm.expectRevert(CollateralEscrow.InvalidAmount.selector);
        escrow.releaseCollateral(user1, TOKEN_ID, 0);
    }

    function test_ReleaseOnSettlement_Success() public {
        vm.startPrank(user1);
        ctf.setApprovalForAll(address(escrow), true);
        escrow.depositCollateral(TOKEN_ID, AMOUNT);
        vm.stopPrank();

        escrow.releaseOnSettlement(user1, TOKEN_ID, 1); // YES wins

        assertEq(escrow.getLockedBalance(user1, TOKEN_ID), 0);
        assertEq(escrow.getTotalLocked(TOKEN_ID), 0);
        assertEq(ctf.balanceOf(user1, TOKEN_ID), AMOUNT);
    }

    function test_ReleaseOnSettlement_OnlyCREForwarder() public {
        vm.startPrank(user1);
        ctf.setApprovalForAll(address(escrow), true);
        escrow.depositCollateral(TOKEN_ID, AMOUNT);
        vm.stopPrank();

        vm.prank(user1);
        vm.expectRevert(CollateralEscrow.OnlyCREForwarder.selector);
        escrow.releaseOnSettlement(user1, TOKEN_ID, 1);
    }

    function test_OnReport_ReleaseCollateral() public {
        vm.startPrank(user1);
        ctf.setApprovalForAll(address(escrow), true);
        escrow.depositCollateral(TOKEN_ID, AMOUNT);
        vm.stopPrank();

        bytes memory report = abi.encodeWithSelector(
            bytes4(uint32(0xb21477d1)), // releaseCollateral(address,uint256,uint256)
            user1,
            TOKEN_ID,
            AMOUNT
        );
        escrow.onReport("", report);

        assertEq(escrow.getLockedBalance(user1, TOKEN_ID), 0);
        assertEq(ctf.balanceOf(user1, TOKEN_ID), AMOUNT);
    }

    function test_OnReport_ReleaseOnSettlement() public {
        vm.startPrank(user1);
        ctf.setApprovalForAll(address(escrow), true);
        escrow.depositCollateral(TOKEN_ID, AMOUNT);
        vm.stopPrank();

        bytes memory report = abi.encodeWithSelector(
            bytes4(uint32(0x0ec32eb9)), // releaseOnSettlement(address,uint256,uint8)
            user1,
            TOKEN_ID,
            uint8(0) // NO wins
        );
        escrow.onReport("", report);

        assertEq(escrow.getLockedBalance(user1, TOKEN_ID), 0);
        assertEq(ctf.balanceOf(user1, TOKEN_ID), AMOUNT);
    }

    function test_OnReport_OnlyCREForwarder() public {
        bytes memory report = abi.encodeWithSelector(
            bytes4(uint32(0xb21477d1)),
            user1,
            TOKEN_ID,
            AMOUNT
        );
        vm.prank(user1);
        vm.expectRevert(CollateralEscrow.OnlyCREForwarder.selector);
        escrow.onReport("", report);
    }

    function test_MultipleUsers_TotalLocked() public {
        vm.startPrank(user1);
        ctf.setApprovalForAll(address(escrow), true);
        escrow.depositCollateral(TOKEN_ID, AMOUNT);
        vm.stopPrank();

        vm.startPrank(user2);
        ctf.setApprovalForAll(address(escrow), true);
        escrow.depositCollateral(TOKEN_ID, AMOUNT * 2);
        vm.stopPrank();

        assertEq(escrow.getTotalLocked(TOKEN_ID), AMOUNT * 3);
        assertEq(escrow.getLockedBalance(user1, TOKEN_ID), AMOUNT);
        assertEq(escrow.getLockedBalance(user2, TOKEN_ID), AMOUNT * 2);
    }

    function test_ERC1155Receiver() public view {
        bytes4 selector = escrow.onERC1155Received(address(0), address(0), 0, 0, "");
        assertEq(selector, escrow.onERC1155Received.selector);
    }
}

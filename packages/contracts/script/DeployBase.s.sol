// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {SettlementVault} from "../src/base/SettlementVault.sol";

/// @title DeployBase
/// @notice Deployment script for SettlementVault on Tenderly Base mainnet fork (or Base Sepolia)
/// @dev Run with: forge script script/DeployBase.s.sol --rpc-url $BASE_TENDERLY_RPC --broadcast
contract DeployBase is Script {
    // Base mainnet USDC (also present on Tenderly Base mainnet fork)
    address constant USDC_BASE_MAINNET = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console2.log("=========================================");
        console2.log("Deploying SettlementVault");
        console2.log("=========================================");
        console2.log("Deployer:", deployer);

        // CRE Forwarder — same address on both testnets and mainnet forks
        address creForwarder;
        try vm.envAddress("CRE_FORWARDER_ADDRESS") returns (address addr) {
            creForwarder = addr;
        } catch {
            console2.log("WARNING: CRE_FORWARDER_ADDRESS not set, using deployer as placeholder");
            creForwarder = deployer;
        }
        console2.log("CRE Forwarder:", creForwarder);

        // USDC — use mainnet address (present on Tenderly fork), override for testnets
        address usdc;
        try vm.envAddress("USDC_ADDRESS") returns (address addr) {
            usdc = addr;
        } catch {
            usdc = USDC_BASE_MAINNET;
            console2.log("USDC_ADDRESS not set, using Base mainnet USDC");
        }
        console2.log("USDC:", usdc);
        console2.log("");

        vm.startBroadcast(deployerPrivateKey);

        SettlementVault vault = new SettlementVault(creForwarder, usdc);

        vm.stopBroadcast();

        console2.log("=========================================");
        console2.log("Deployment Complete!");
        console2.log("=========================================");
        console2.log("SettlementVault:", address(vault));
        console2.log("CRE_FORWARDER:  ", vault.CRE_FORWARDER());
        console2.log("USDC:           ", vault.USDC());
        console2.log("");
        console2.log("Next Steps:");
        console2.log("1. Update config.json: base.vaultAddress =", address(vault));
        console2.log("2. Set SETTLEMENT_VAULT_ADDRESS in .env");
        console2.log("3. Mint USDC to SettlementVault via Tenderly admin RPC:");
        console2.log("   See IMPLEMENTATION.md \u00a7Phase 3 for the full cast command");
    }
}

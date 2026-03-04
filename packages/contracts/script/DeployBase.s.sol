// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {HorizonVault} from "../src/base/HorizonVault.sol";

/**
 * @title DeployBase
 * @notice Deployment script for Base Sepolia testnet
 * @dev Run with: forge script script/DeployBase.s.sol --rpc-url base_sepolia --broadcast --verify
 */
contract DeployBase is Script {
    // CRE Forwarder address on Base Sepolia
    // TODO: Replace with actual CRE forwarder after workflow deployment
    // For testing, we'll use the deployer address initially
    address constant CRE_FORWARDER_PLACEHOLDER = address(0); // Will use deployer in run()
    
    function run() external {
        // Read deployer private key from environment
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console2.log("=========================================");
        console2.log("Deploying HorizonVault to Base Sepolia");
        console2.log("=========================================");
        console2.log("Deployer:", deployer);
        
        // Get CRE forwarder address (use deployer if not set)
        address creForwarder;
        try vm.envAddress("CRE_FORWARDER_ADDRESS") returns (address addr) {
            creForwarder = addr;
        } catch {
            console2.log("WARNING: CRE_FORWARDER_ADDRESS not set, using deployer as placeholder");
            creForwarder = deployer;
        }
        console2.log("CRE Forwarder:", creForwarder);
        
        // Get MAX_LTV_INCREASE_PER_UPDATE (default: 10000 for demo)
        uint256 maxLtvIncrease;
        try vm.envUint("MAX_LTV_INCREASE_PER_UPDATE") returns (uint256 val) {
            maxLtvIncrease = val;
        } catch {
            maxLtvIncrease = 10000; // Default: 100% (instant updates for demo)
            console2.log("MAX_LTV_INCREASE_PER_UPDATE not set, using default: 10000 bps (100%, DEMO MODE)");
        }
        console2.log("Max LTV Increase Per Update: %s bps", maxLtvIncrease);
        console2.log("");
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy HorizonVault
        HorizonVault vault = new HorizonVault(creForwarder, maxLtvIncrease);
        
        vm.stopBroadcast();
        
        console2.log("=========================================");
        console2.log("Deployment Complete!");
        console2.log("=========================================");
        console2.log("HorizonVault:", address(vault));
        console2.log("");
        console2.log("Contract Configuration:");
        console2.log("- MAX_LTV_INCREASE_PER_UPDATE: %s bps", vault.MAX_LTV_INCREASE_PER_UPDATE());
        if (vault.MAX_LTV_INCREASE_PER_UPDATE() == 10000) {
            console2.log("  (100%% - DEMO MODE: instant updates)");
        } else if (vault.MAX_LTV_INCREASE_PER_UPDATE() <= 1000) {
            console2.log("  (Production mode: gradual updates)");
        }
        console2.log("- LIQUIDATION_BONUS: %s bps (5%%)", vault.LIQUIDATION_BONUS());
        console2.log("- LIQUIDATION_GRACE_PERIOD: %s seconds", vault.LIQUIDATION_GRACE_PERIOD());
        console2.log("");
        console2.log("Next Steps:");
        console2.log("1. Update config.json with:");
        console2.log('   "base.vaultAddress": "%s"', address(vault));
        console2.log("2. If using deployer as CRE forwarder, update after workflow deployment");
        console2.log("3. Verify contract on BaseScan if --verify failed");
        console2.log("");
        console2.log("Verification command:");
        console2.log("forge verify-contract %s HorizonVault --chain base-sepolia --constructor-args $(cast abi-encode \"constructor(address,uint256)\" %s %s)", 
            address(vault),
            creForwarder,
            maxLtvIncrease
        );
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {CollateralEscrow} from "../src/polygon/CollateralEscrow.sol";

/**
 * @title DeployPolygon
 * @notice Deployment script for Polygon Amoy testnet
 * @dev Run with: forge script script/DeployPolygon.s.sol --rpc-url polygon_mumbai --broadcast --verify
 */
contract DeployPolygon is Script {
    // Polymarket CTF Exchange on Polygon Amoy
    // Source: https://docs.polymarket.com/#contract-addresses
    address constant CTF_EXCHANGE = 0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E;
    
    // CRE Forwarder address on Polygon Amoy
    // TODO: Replace with actual CRE forwarder after workflow deployment
    // For testing, we'll use the deployer address initially
    address constant CRE_FORWARDER_PLACEHOLDER = address(0); // Will use deployer in run()
    
    function run() external {
        // Read deployer private key from environment
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console2.log("===========================================");
        console2.log("Deploying CollateralEscrow to Polygon Amoy");
        console2.log("===========================================");
        console2.log("Deployer:", deployer);
        console2.log("CTF Exchange:", CTF_EXCHANGE);
        
        // Get CRE forwarder address (use deployer if not set)
        address creForwarder;
        try vm.envAddress("CRE_FORWARDER_ADDRESS") returns (address addr) {
            creForwarder = addr;
        } catch {
            console2.log("WARNING: CRE_FORWARDER_ADDRESS not set, using deployer as placeholder");
            creForwarder = deployer;
        }
        console2.log("CRE Forwarder:", creForwarder);
        console2.log("");
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy CollateralEscrow
        CollateralEscrow escrow = new CollateralEscrow(
            CTF_EXCHANGE,
            creForwarder
        );
        
        vm.stopBroadcast();
        
        console2.log("===========================================");
        console2.log("Deployment Complete!");
        console2.log("===========================================");
        console2.log("CollateralEscrow:", address(escrow));
        console2.log("");
        console2.log("Next Steps:");
        console2.log("1. Update config.json with:");
        console2.log('   "polygon.escrowAddress": "%s"', address(escrow));
        console2.log("2. If using deployer as CRE forwarder, update after workflow deployment");
        console2.log("3. Verify contract on PolygonScan if --verify failed");
        console2.log("");
        console2.log("Verification command:");
        console2.log("forge verify-contract %s CollateralEscrow --chain polygon-amoy --constructor-args $(cast abi-encode \"constructor(address,address)\" %s %s)", 
            address(escrow), 
            CTF_EXCHANGE,
            creForwarder
        );
    }
}

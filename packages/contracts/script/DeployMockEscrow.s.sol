// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {CollateralEscrow} from "../src/polygon/CollateralEscrow.sol";

/**
 * @title DeployMockEscrow
 * @notice Deployment script for CollateralEscrow using MockCTF on Polygon Amoy testnet
 * @dev Run with: forge script script/DeployMockEscrow.s.sol --rpc-url polygon_mumbai --broadcast
 */
contract DeployMockEscrow is Script {
    function run() external {
        // Read deployer private key from environment
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        // Get MockCTF address from env or argument
        address mockCTF;
        try vm.envAddress("MOCK_CTF_ADDRESS") returns (address addr) {
            mockCTF = addr;
        } catch {
            console2.log("ERROR: MOCK_CTF_ADDRESS not set in .env");
            console2.log("Please set MOCK_CTF_ADDRESS or pass it as an argument");
            revert("MOCK_CTF_ADDRESS required");
        }
        
        // Get CRE forwarder address
        address creForwarder;
        try vm.envAddress("CRE_FORWARDER_ADDRESS") returns (address addr) {
            creForwarder = addr;
        } catch {
            console2.log("WARNING: CRE_FORWARDER_ADDRESS not set, using deployer as placeholder");
            creForwarder = deployer;
        }
        
        console2.log("===========================================");
        console2.log("Deploying CollateralEscrow (MockCTF) to Polygon Amoy");
        console2.log("===========================================");
        console2.log("Deployer:", deployer);
        console2.log("MockCTF Exchange:", mockCTF);
        console2.log("CRE Forwarder:", creForwarder);
        console2.log("");
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy CollateralEscrow with MockCTF
        CollateralEscrow escrow = new CollateralEscrow(
            mockCTF,
            creForwarder
        );
        
        vm.stopBroadcast();
        
        console2.log("===========================================");
        console2.log("Deployment Complete!");
        console2.log("===========================================");
        console2.log("CollateralEscrow (MockCTF):", address(escrow));
        console2.log("");
        console2.log("Next Steps:");
        console2.log("1. Update .env with:");
        console2.log('   COLLATERAL_ESCROW_ADDRESS=%s', address(escrow));
        console2.log("2. Update config.json with:");
        console2.log('   "polygon.escrowAddress": "%s"', address(escrow));
        console2.log("3. Run SetupDemoCollateral.sh to mint and deposit tokens");
        console2.log("");
        console2.log("Verification command:");
        console2.log("forge verify-contract %s CollateralEscrow --chain polygon-amoy --constructor-args $(cast abi-encode \"constructor(address,address)\" %s %s)", 
            address(escrow), 
            mockCTF,
            creForwarder
        );
    }
}

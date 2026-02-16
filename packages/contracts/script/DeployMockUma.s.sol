// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MockUmaCtfAdapter} from "../src/polygon/MockUmaCtfAdapter.sol";

/**
 * @title DeployMockUma
 * @notice Deployment script for MockUmaCtfAdapter on Polygon Amoy
 * @dev Run with: forge script script/DeployMockUma.s.sol --rpc-url polygon_mumbai --broadcast --legacy
 */
contract DeployMockUma is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console2.log("===========================================");
        console2.log("Deploying MockUmaCtfAdapter to Polygon Amoy");
        console2.log("===========================================");
        console2.log("Deployer:", deployer);
        console2.log("");
        
        vm.startBroadcast(deployerPrivateKey);
        
        MockUmaCtfAdapter mockUma = new MockUmaCtfAdapter();
        
        vm.stopBroadcast();
        
        console2.log("===========================================");
        console2.log("Deployment Complete!");
        console2.log("===========================================");
        console2.log("MockUmaCtfAdapter:", address(mockUma));
        console2.log("");
        console2.log("Next Steps:");
        console2.log("1. Update config.json:");
        console2.log('   "polygon.umaCtfAdapterAddress": "%s"', address(mockUma));
        console2.log("");
        console2.log("2. Emit a test event:");
        console2.log("   cast send %s \\", address(mockUma));
        console2.log('     "mockResolve(bytes32,uint8)" \\');
        console2.log('     0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef \\');
        console2.log('     1 \\');
        console2.log('     --rpc-url $POLYGON_TESTNET_RPC_URL --private-key $PRIVATE_KEY --legacy');
        console2.log("");
        console2.log("3. Test CRE event trigger:");
        console2.log("   cre workflow simulate vektar-engine \\");
        console2.log("     --non-interactive --trigger-index 1 \\");
        console2.log("     --evm-tx-hash <TX_HASH> --evm-event-index 0 \\");
        console2.log("     --target local-simulation");
    }
}

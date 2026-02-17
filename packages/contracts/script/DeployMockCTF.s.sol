// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MockCTF} from "../src/polygon/MockCTF.sol";

/// @notice Deploy MockCTF (mock Polymarket ERC-1155) to Polygon Amoy
contract DeployMockCTF is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console2.log("==========================================");
        console2.log("Deploying MockCTF to Polygon Amoy");
        console2.log("==========================================");
        console2.log("Deployer:", deployer);
        console2.log("");
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy MockCTF
        MockCTF mockCTF = new MockCTF();
        console2.log("MockCTF deployed at:", address(mockCTF));
        
        vm.stopBroadcast();
        
        console2.log("");
        console2.log("==========================================");
        console2.log("Deployment Complete!");
        console2.log("==========================================");
        console2.log("");
        console2.log("MockCTF Address:", address(mockCTF));
        console2.log("");
        console2.log("Next: Run script/MintTestTokens.sh");
    }
}

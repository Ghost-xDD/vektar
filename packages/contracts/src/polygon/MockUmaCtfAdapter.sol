// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MockUmaCtfAdapter
/// @notice Mock contract for testing UMA CTF Adapter QuestionResolved events
/// @dev Emits the same event signature as the real UMA CTF Adapter for CRE testing
contract MockUmaCtfAdapter {
    /// @notice Emitted when a question is resolved
    /// @dev Same signature as real UMA CTF Adapter
    event QuestionResolved(
        bytes32 indexed questionID,
        int256 settledPrice,
        uint256[] payouts
    );
    
    /// @notice Mock resolve function to emit QuestionResolved event
    /// @param questionID The question ID (use keccak256 of market description)
    /// @param outcome The outcome: 0 = No, 1 = Yes, 2 = Invalid/50-50
    function mockResolve(bytes32 questionID, uint8 outcome) external {
        require(outcome <= 2, "Invalid outcome");
        
        int256 price;
        uint256[] memory payouts = new uint256[](2);
        
        if (outcome == 0) {
            // NO: price = 0, payouts = [0, 1]
            price = 0;
            payouts[0] = 0;
            payouts[1] = 1;
        } else if (outcome == 1) {
            // YES: price = 1 ether, payouts = [1, 0]
            price = 1 ether;
            payouts[0] = 1;
            payouts[1] = 0;
        } else {
            // INVALID: price = 0.5 ether, payouts = [1, 1]
            price = 0.5 ether;
            payouts[0] = 1;
            payouts[1] = 1;
        }
        
        emit QuestionResolved(questionID, price, payouts);
    }
    
    /// @notice Helper to generate questionID from a string
    /// @param question The question text
    /// @return The questionID (keccak256 hash)
    function generateQuestionID(string memory question) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(question));
    }
}

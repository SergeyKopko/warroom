// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MockPonsFeeEscrow {
    using SafeERC20 for IERC20;

    function balanceOfToken(address, address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    function claimToken(address token) external {
        IERC20 asset = IERC20(token);
        asset.safeTransfer(msg.sender, asset.balanceOf(address(this)));
    }
}

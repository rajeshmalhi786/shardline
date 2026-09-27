// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IShardPool {
    function swap(address tokenIn, uint256 amountIn, address recipient)
        external returns (uint256 amountOut);
    function getAmountOut(address tokenIn, uint256 amountIn)
        external view returns (uint256);
}

/// @notice Routes a single swap across multiple ShardPools in one transaction.
///         The optimal split is computed off-chain (in the JS frontend) and
///         passed in as `splits[]`. The router enforces minAmountOut as slippage
///         protection.
contract ShardRouter is ReentrancyGuard {
    using SafeERC20 for IERC20;

    event SwapExecuted(
        address indexed sender,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 poolCount
    );

    // ── Swap ─────────────────────────────────────────────────────────────────

    /// @param tokenIn       Address of input token
    /// @param tokenOut      Address of output token
    /// @param amountIn      Total input amount (must be approved by caller)
    /// @param minAmountOut  Slippage floor — reverts if output falls below this
    /// @param pools         Pool addresses to route through
    /// @param splits        Input amount allocated to each pool (must sum to amountIn)
    function swapExactIn(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        address[] calldata pools,
        uint256[] calldata splits
    ) external nonReentrant returns (uint256 totalOut) {
        require(pools.length > 0, "no pools");
        require(pools.length == splits.length, "length mismatch");

        // Pull full input from caller once
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        // Verify splits sum to amountIn (allow 1 wei rounding)
        uint256 splitSum;
        for (uint256 i; i < splits.length; i++) splitSum += splits[i];
        require(splitSum <= amountIn && splitSum >= amountIn - 1, "bad splits");

        // Approve each pool and execute
        for (uint256 i; i < pools.length; i++) {
            if (splits[i] == 0) continue;
            IERC20(tokenIn).forceApprove(pools[i], splits[i]);
            totalOut += IShardPool(pools[i]).swap(tokenIn, splits[i], msg.sender);
        }

        require(totalOut >= minAmountOut, "slippage exceeded");

        emit SwapExecuted(msg.sender, tokenIn, tokenOut, amountIn, totalOut, pools.length);
    }

    // ── Quote (view — no gas cost) ───────────────────────────────────────────

    /// Returns expected output for a given split without executing.
    function quoteExactIn(
        address tokenIn,
        address[] calldata pools,
        uint256[] calldata splits
    ) external view returns (uint256 totalOut) {
        require(pools.length == splits.length, "length mismatch");
        for (uint256 i; i < pools.length; i++) {
            if (splits[i] == 0) continue;
            totalOut += IShardPool(pools[i]).getAmountOut(tokenIn, splits[i]);
        }
    }
}

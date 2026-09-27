// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Single constant-product AMM pool (tokenA / tokenB).
///         reserveA * reserveB = k  (Uniswap v2 model)
contract ShardPool is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable tokenA;
    IERC20 public immutable tokenB;
    uint256 public immutable feeBps; // e.g. 30 = 0.30 %

    uint256 public reserveA;
    uint256 public reserveB;

    address public immutable router;

    event Swap(
        address indexed sender,
        address indexed tokenIn,
        uint256 amountIn,
        uint256 amountOut
    );
    event LiquidityAdded(uint256 amountA, uint256 amountB);

    constructor(address tokenA_, address tokenB_, uint256 feeBps_, address router_) {
        tokenA  = IERC20(tokenA_);
        tokenB  = IERC20(tokenB_);
        feeBps  = feeBps_;
        router  = router_;
    }

    modifier onlyRouter() {
        require(msg.sender == router, "only router");
        _;
    }

    // ── Liquidity ────────────────────────────────────────────────────────────

    /// Seed initial liquidity (owner / deploy script calls this once).
    function addLiquidity(uint256 amountA, uint256 amountB) external {
        tokenA.safeTransferFrom(msg.sender, address(this), amountA);
        tokenB.safeTransferFrom(msg.sender, address(this), amountB);
        reserveA += amountA;
        reserveB += amountB;
        emit LiquidityAdded(amountA, amountB);
    }

    // ── Swap ─────────────────────────────────────────────────────────────────

    /// Called by ShardRouter. Transfers tokenIn from router, returns amountOut.
    function swap(
        address tokenIn,
        uint256 amountIn,
        address recipient
    ) external onlyRouter nonReentrant returns (uint256 amountOut) {
        require(amountIn > 0, "zero input");

        bool aToB = tokenIn == address(tokenA);
        require(aToB || tokenIn == address(tokenB), "unknown token");

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        (uint256 rIn, uint256 rOut) = aToB
            ? (reserveA, reserveB)
            : (reserveB, reserveA);

        amountOut = _getAmountOut(amountIn, rIn, rOut);
        require(amountOut > 0, "zero output");

        if (aToB) {
            reserveA += amountIn;
            reserveB -= amountOut;
            tokenB.safeTransfer(recipient, amountOut);
        } else {
            reserveB += amountIn;
            reserveA -= amountOut;
            tokenA.safeTransfer(recipient, amountOut);
        }

        emit Swap(msg.sender, tokenIn, amountIn, amountOut);
    }

    // ── View ─────────────────────────────────────────────────────────────────

    function getAmountOut(address tokenIn, uint256 amountIn)
        external view returns (uint256)
    {
        bool aToB = tokenIn == address(tokenA);
        (uint256 rIn, uint256 rOut) = aToB
            ? (reserveA, reserveB)
            : (reserveB, reserveA);
        return _getAmountOut(amountIn, rIn, rOut);
    }

    // ── Internal ─────────────────────────────────────────────────────────────

    function _getAmountOut(uint256 amountIn, uint256 rIn, uint256 rOut)
        internal view returns (uint256)
    {
        uint256 amountInWithFee = amountIn * (10_000 - feeBps);
        return (amountInWithFee * rOut) / (rIn * 10_000 + amountInWithFee);
    }
}

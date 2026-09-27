// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

interface IMintable {
    function mint(address to, uint256 amount) external;
}

/// @notice Testnet faucet — drips tUSD and synthetic tokens once per cooldown.
contract Faucet is Ownable {
    uint256 public constant TUSD_DRIP    = 1_000_000e18;
    uint256 public constant TOKEN_DRIP   = 100e18;
    uint256 public constant COOLDOWN     = 1 days;

    mapping(address => mapping(address => uint256)) public lastClaim;

    event Claimed(address indexed user, address indexed token, uint256 amount);

    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @notice Claim DRIP amount of `token`. Subject to per-token cooldown.
    function claim(address token) external {
        require(
            block.timestamp >= lastClaim[msg.sender][token] + COOLDOWN,
            "cooldown active"
        );
        lastClaim[msg.sender][token] = block.timestamp;

        uint256 amount = _drip(token);
        IMintable(token).mint(msg.sender, amount);
        emit Claimed(msg.sender, token, amount);
    }

    /// @notice Owner can add a custom drip amount mapping if needed.
    mapping(address => uint256) public customDrip;
    function setCustomDrip(address token, uint256 amount) external onlyOwner {
        customDrip[token] = amount;
    }

    function _drip(address token) internal view returns (uint256) {
        if (customDrip[token] > 0) return customDrip[token];
        return TOKEN_DRIP;
    }

    function timeUntilNextClaim(address user, address token)
        external view returns (uint256)
    {
        uint256 next = lastClaim[user][token] + COOLDOWN;
        return block.timestamp >= next ? 0 : next - block.timestamp;
    }
}

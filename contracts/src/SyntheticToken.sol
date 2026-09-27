// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @notice ERC-20 for each synthetic asset (tSPY, tQQQ, tNVDA …) and tUSD.
contract SyntheticToken is ERC20, Ownable {
    uint8 private immutable _decimals;
    address public faucet;

    constructor(
        string memory name,
        string memory symbol,
        uint8 decimals_,
        address initialOwner
    ) ERC20(name, symbol) Ownable(initialOwner) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function setFaucet(address faucet_) external onlyOwner {
        faucet = faucet_;
    }

    /// Called by Faucet or Router during initial liquidity seeding.
    function mint(address to, uint256 amount) external {
        require(msg.sender == faucet || msg.sender == owner(), "not authorised");
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        require(msg.sender == faucet || msg.sender == owner(), "not authorised");
        _burn(from, amount);
    }
}

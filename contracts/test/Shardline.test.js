const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Shardline", function () {
  let deployer, user;
  let tSPY, tUSD, pool, router, faucet;
  const FEE = 30; // 0.30%

  beforeEach(async () => {
    [deployer, user] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("SyntheticToken");
    tSPY = await Token.deploy("SPDR S&P 500", "tSPY", 18, deployer.address);
    tUSD = await Token.deploy("Test USD", "tUSD", 18, deployer.address);

    const Router = await ethers.getContractFactory("ShardRouter");
    router = await Router.deploy();

    const Pool = await ethers.getContractFactory("ShardPool");
    pool = await Pool.deploy(
      await tSPY.getAddress(),
      await tUSD.getAddress(),
      FEE,
      await router.getAddress()
    );

    // Seed pool: 1000 tSPY @ $770 each
    const seedA = ethers.parseEther("1000");
    const seedB = ethers.parseEther("770000");
    await tSPY.mint(deployer.address, seedA);
    await tUSD.mint(deployer.address, seedB);
    await tSPY.approve(await pool.getAddress(), seedA);
    await tUSD.approve(await pool.getAddress(), seedB);
    await pool.addLiquidity(seedA, seedB);

    // Faucet
    const Faucet = await ethers.getContractFactory("Faucet");
    faucet = await Faucet.deploy(deployer.address);
    await tUSD.setFaucet(await faucet.getAddress());
    await tSPY.setFaucet(await faucet.getAddress());
    await faucet.setCustomDrip(await tUSD.getAddress(), ethers.parseEther("1000000"));
  });

  describe("ShardPool", () => {
    it("quotes correct output for tUSD → tSPY swap", async () => {
      const amtIn = ethers.parseEther("1000"); // 1000 tUSD in
      const out = await pool.getAmountOut(await tUSD.getAddress(), amtIn);
      // At 770 tUSD/tSPY, 1000 tUSD ≈ 1.295 tSPY after fee
      expect(out).to.be.gt(ethers.parseEther("1.2"));
      expect(out).to.be.lt(ethers.parseEther("1.4"));
    });

    it("reverts if called directly (not via router)", async () => {
      const amtIn = ethers.parseEther("100");
      await tUSD.mint(user.address, amtIn);
      await tUSD.connect(user).approve(await pool.getAddress(), amtIn);
      await expect(
        pool.connect(user).swap(await tUSD.getAddress(), amtIn, user.address)
      ).to.be.revertedWith("only router");
    });
  });

  describe("ShardRouter", () => {
    it("executes a single-pool swap tUSD → tSPY", async () => {
      const amtIn = ethers.parseEther("7700"); // 7700 tUSD → ~10 tSPY
      await tUSD.mint(user.address, amtIn);
      await tUSD.connect(user).approve(await router.getAddress(), amtIn);

      const minOut = ethers.parseEther("9.5");
      await router.connect(user).swapExactIn(
        await tUSD.getAddress(),
        await tSPY.getAddress(),
        amtIn,
        minOut,
        [await pool.getAddress()],
        [amtIn]
      );

      const bal = await tSPY.balanceOf(user.address);
      expect(bal).to.be.gte(minOut);
    });

    it("reverts when slippage floor not met", async () => {
      const amtIn = ethers.parseEther("7700");
      await tUSD.mint(user.address, amtIn);
      await tUSD.connect(user).approve(await router.getAddress(), amtIn);

      // Set an unreachably high minAmountOut
      const unreachable = ethers.parseEther("9999");
      await expect(
        router.connect(user).swapExactIn(
          await tUSD.getAddress(),
          await tSPY.getAddress(),
          amtIn,
          unreachable,
          [await pool.getAddress()],
          [amtIn]
        )
      ).to.be.revertedWith("slippage exceeded");
    });
  });

  describe("Faucet", () => {
    it("mints tUSD drip to caller", async () => {
      await faucet.connect(user).claim(await tUSD.getAddress());
      const bal = await tUSD.balanceOf(user.address);
      expect(bal).to.equal(ethers.parseEther("1000000"));
    });

    it("enforces cooldown on second claim", async () => {
      await faucet.connect(user).claim(await tUSD.getAddress());
      await expect(
        faucet.connect(user).claim(await tUSD.getAddress())
      ).to.be.revertedWith("cooldown active");
    });
  });
});

const { ethers } = require("hardhat");

// Mirror of server.js pool reserves (scaled to 18 decimals for tokens, 6 for tUSD)
const POOLS = [
  { id: "SPY-A",  sym: "tSPY",  reserveA: "1815",    reserveB: "1401780", feeBps: 30 },
  { id: "SPY-B",  sym: "tSPY",  reserveA: "1300",    reserveB: "1003560", feeBps: 30 },
  { id: "SPY-C",  sym: "tSPY",  reserveA: "520",     reserveB: "401440",  feeBps: 50 },
  { id: "QQQ-A",  sym: "tQQQ",  reserveA: "360",     reserveB: "259354",  feeBps: 30 },
  { id: "QQQ-B",  sym: "tQQQ",  reserveA: "168",     reserveB: "121032",  feeBps: 50 },
  { id: "NVDA-A", sym: "tNVDA", reserveA: "3890",    reserveB: "900535",  feeBps: 30 },
  { id: "NVDA-B", sym: "tNVDA", reserveA: "2900",    reserveB: "671350",  feeBps: 30 },
  { id: "NVDA-C", sym: "tNVDA", reserveA: "980",     reserveB: "226870",  feeBps: 50 },
  { id: "AAPL-A", sym: "tAAPL", reserveA: "2500",    reserveB: "535500",  feeBps: 30 },
  { id: "AAPL-B", sym: "tAAPL", reserveA: "1900",    reserveB: "406980",  feeBps: 50 },
  { id: "TSLA-A", sym: "tTSLA", reserveA: "2200",    reserveB: "547580",  feeBps: 30 },
  { id: "TSLA-B", sym: "tTSLA", reserveA: "1600",    reserveB: "398240",  feeBps: 30 },
  { id: "TSLA-C", sym: "tTSLA", reserveA: "620",     reserveB: "154318",  feeBps: 50 },
  { id: "MSFT-A", sym: "tMSFT", reserveA: "1100",    reserveB: "460625",  feeBps: 30 },
  { id: "MSFT-B", sym: "tMSFT", reserveA: "720",     reserveB: "301500",  feeBps: 50 },
  { id: "AMZN-A", sym: "tAMZN", reserveA: "1900",    reserveB: "367460",  feeBps: 30 },
  { id: "AMZN-B", sym: "tAMZN", reserveA: "1300",    reserveB: "251420",  feeBps: 50 },
  { id: "COIN-A", sym: "tCOIN", reserveA: "900",     reserveB: "240435",  feeBps: 30 },
  { id: "COIN-B", sym: "tCOIN", reserveA: "640",     reserveB: "170976",  feeBps: 50 },
];

const TOKENS = [
  { sym: "tSPY",  name: "SPDR S&P 500 ETF Trust",   decimals: 18 },
  { sym: "tQQQ",  name: "Invesco QQQ Trust",          decimals: 18 },
  { sym: "tNVDA", name: "NVIDIA Corporation",         decimals: 18 },
  { sym: "tAAPL", name: "Apple Inc.",                 decimals: 18 },
  { sym: "tTSLA", name: "Tesla Inc.",                 decimals: 18 },
  { sym: "tMSFT", name: "Microsoft Corporation",      decimals: 18 },
  { sym: "tAMZN", name: "Amazon.com Inc.",            decimals: 18 },
  { sym: "tCOIN", name: "Coinbase Global Inc.",       decimals: 18 },
  { sym: "tUSD",  name: "Test USD",                   decimals: 18 },
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  // ── 1. Deploy tokens ────────────────────────────────────────────────────
  console.log("\n── Deploying tokens ──");
  const TokenFactory = await ethers.getContractFactory("SyntheticToken");
  const tokenMap = {};

  for (const t of TOKENS) {
    const contract = await TokenFactory.deploy(t.name, t.sym, t.decimals, deployer.address);
    await contract.waitForDeployment();
    tokenMap[t.sym] = contract;
    console.log(`  ${t.sym}: ${await contract.getAddress()}`);
  }

  // ── 2. Deploy router ────────────────────────────────────────────────────
  console.log("\n── Deploying ShardRouter ──");
  const RouterFactory = await ethers.getContractFactory("ShardRouter");
  const router = await RouterFactory.deploy();
  await router.waitForDeployment();
  const routerAddress = await router.getAddress();
  console.log("  ShardRouter:", routerAddress);

  // ── 3. Deploy pools & seed liquidity ───────────────────────────────────
  console.log("\n── Deploying pools ──");
  const PoolFactory = await ethers.getContractFactory("ShardPool");
  const poolAddresses = {};
  const tUSD = tokenMap["tUSD"];

  for (const p of POOLS) {
    const tokenA = tokenMap[p.sym];
    const pool = await PoolFactory.deploy(
      await tokenA.getAddress(),
      await tUSD.getAddress(),
      p.feeBps,
      routerAddress
    );
    await pool.waitForDeployment();
    const poolAddr = await pool.getAddress();
    poolAddresses[p.id] = poolAddr;

    // Mint seed liquidity to deployer then add to pool
    const amtA = ethers.parseUnits(p.reserveA, 18);
    const amtB = ethers.parseUnits(p.reserveB, 18);
    await tokenA.mint(deployer.address, amtA);
    await tUSD.mint(deployer.address, amtB);
    await tokenA.approve(poolAddr, amtA);
    await tUSD.approve(poolAddr, amtB);
    await pool.addLiquidity(amtA, amtB);

    console.log(`  ${p.id}: ${poolAddr}`);
  }

  // ── 4. Deploy faucet ────────────────────────────────────────────────────
  console.log("\n── Deploying Faucet ──");
  const FaucetFactory = await ethers.getContractFactory("Faucet");
  const faucet = await FaucetFactory.deploy(deployer.address);
  await faucet.waitForDeployment();
  const faucetAddress = await faucet.getAddress();
  console.log("  Faucet:", faucetAddress);

  // Give faucet mint rights on all tokens
  for (const t of TOKENS) {
    await tokenMap[t.sym].setFaucet(faucetAddress);
  }
  // tUSD gets a custom drip of 1,000,000
  await faucet.setCustomDrip(
    await tUSD.getAddress(),
    ethers.parseUnits("1000000", 18)
  );

  // ── 5. Write addresses JSON ─────────────────────────────────────────────
  const fs = require("fs");
  const addresses = {
    network: (await ethers.provider.getNetwork()).name,
    router: routerAddress,
    faucet: faucetAddress,
    tokens: Object.fromEntries(
      await Promise.all(
        Object.entries(tokenMap).map(async ([sym, c]) => [sym, await c.getAddress()])
      )
    ),
    pools: poolAddresses,
  };

  fs.writeFileSync("deployed.json", JSON.stringify(addresses, null, 2));
  console.log("\nAddresses written to deployed.json");

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log("\n✓ Deployment complete");
  console.log("  Tokens:  ", Object.keys(tokenMap).length);
  console.log("  Pools:   ", Object.keys(poolAddresses).length);
  console.log("  Router:  ", routerAddress);
  console.log("  Faucet:  ", faucetAddress);
}

main().catch((err) => { console.error(err); process.exit(1); });

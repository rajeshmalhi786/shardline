const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// Serve frontend static files from the project root
app.use(express.static(path.join(__dirname, '..')));

// ─── State ──────────────────────────────────────────────────────────────────
// Pools hold AMM reserves: reserveA (token), reserveB (tUSD)
// Invariant: reserveA * reserveB = k (constant product)

const tokens = {
  tSPY:  { symbol: 'tSPY',  name: 'SPDR S&P 500 ETF Trust',   decimals: 18 },
  tQQQ:  { symbol: 'tQQQ',  name: 'Invesco QQQ Trust',          decimals: 18 },
  tNVDA: { symbol: 'tNVDA', name: 'NVIDIA Corporation',         decimals: 18 },
  tAAPL: { symbol: 'tAAPL', name: 'Apple Inc.',                 decimals: 18 },
  tTSLA: { symbol: 'tTSLA', name: 'Tesla Inc.',                 decimals: 18 },
  tMSFT: { symbol: 'tMSFT', name: 'Microsoft Corporation',      decimals: 18 },
  tAMZN: { symbol: 'tAMZN', name: 'Amazon.com Inc.',            decimals: 18 },
  tCOIN: { symbol: 'tCOIN', name: 'Coinbase Global Inc.',       decimals: 18 },
  tUSD:  { symbol: 'tUSD',  name: 'Test USD',                   decimals: 6  },
  USDC:  { symbol: 'USDC',  name: 'USD Coin (Circle)',          decimals: 6  },
};

// Mutable pool state — swaps update reserves in real time
const pools = {
  'SPY-A':  { id: 'SPY-A',  tokenA: 'tSPY',  tokenB: 'tUSD', reserveA: 1815.0,  reserveB: 1401780.0, fee: 0.003 },
  'SPY-B':  { id: 'SPY-B',  tokenA: 'tSPY',  tokenB: 'tUSD', reserveA: 1300.0,  reserveB: 1003560.0, fee: 0.003 },
  'SPY-C':  { id: 'SPY-C',  tokenA: 'tSPY',  tokenB: 'tUSD', reserveA: 520.0,   reserveB: 401440.0,  fee: 0.005 },
  'QQQ-A':  { id: 'QQQ-A',  tokenA: 'tQQQ',  tokenB: 'tUSD', reserveA: 360.0,   reserveB: 259354.8,  fee: 0.003 },
  'QQQ-B':  { id: 'QQQ-B',  tokenA: 'tQQQ',  tokenB: 'tUSD', reserveA: 168.0,   reserveB: 121032.24, fee: 0.005 },
  'NVDA-A': { id: 'NVDA-A', tokenA: 'tNVDA', tokenB: 'tUSD', reserveA: 3890.0,  reserveB: 900535.0,  fee: 0.003 },
  'NVDA-B': { id: 'NVDA-B', tokenA: 'tNVDA', tokenB: 'tUSD', reserveA: 2900.0,  reserveB: 671350.0,  fee: 0.003 },
  'NVDA-C': { id: 'NVDA-C', tokenA: 'tNVDA', tokenB: 'tUSD', reserveA: 980.0,   reserveB: 226870.0,  fee: 0.005 },
  'AAPL-A': { id: 'AAPL-A', tokenA: 'tAAPL', tokenB: 'tUSD', reserveA: 2500.0,  reserveB: 535500.0,  fee: 0.003 },
  'AAPL-B': { id: 'AAPL-B', tokenA: 'tAAPL', tokenB: 'tUSD', reserveA: 1900.0,  reserveB: 406980.0,  fee: 0.005 },
  'TSLA-A': { id: 'TSLA-A', tokenA: 'tTSLA', tokenB: 'tUSD', reserveA: 2200.0,  reserveB: 547580.0,  fee: 0.003 },
  'TSLA-B': { id: 'TSLA-B', tokenA: 'tTSLA', tokenB: 'tUSD', reserveA: 1600.0,  reserveB: 398240.0,  fee: 0.003 },
  'TSLA-C': { id: 'TSLA-C', tokenA: 'tTSLA', tokenB: 'tUSD', reserveA: 620.0,   reserveB: 154318.0,  fee: 0.005 },
  'MSFT-A': { id: 'MSFT-A', tokenA: 'tMSFT', tokenB: 'tUSD', reserveA: 1100.0,  reserveB: 460625.0,  fee: 0.003 },
  'MSFT-B': { id: 'MSFT-B', tokenA: 'tMSFT', tokenB: 'tUSD', reserveA: 720.0,   reserveB: 301500.0,  fee: 0.005 },
  'AMZN-A': { id: 'AMZN-A', tokenA: 'tAMZN', tokenB: 'tUSD', reserveA: 1900.0,  reserveB: 367460.0,  fee: 0.003 },
  'AMZN-B': { id: 'AMZN-B', tokenA: 'tAMZN', tokenB: 'tUSD', reserveA: 1300.0,  reserveB: 251420.0,  fee: 0.005 },
  'COIN-A': { id: 'COIN-A', tokenA: 'tCOIN', tokenB: 'tUSD', reserveA: 900.0,   reserveB: 240435.0,  fee: 0.003 },
  'COIN-B': { id: 'COIN-B', tokenA: 'tCOIN', tokenB: 'tUSD', reserveA: 640.0,   reserveB: 170976.0,  fee: 0.005 },
};

// Stored 24h change (static — would normally come from indexed history)
const change24h = {
  tSPY: +1.24, tQQQ: -0.38, tNVDA: +2.87, tAAPL: +0.54,
  tTSLA: -1.12, tMSFT: +0.19, tAMZN: -0.67, tCOIN: +3.44,
};

const wallets = {};        // address → { token → balance }
const swapHistory = [];    // recent swap records

// ─── AMM helpers ─────────────────────────────────────────────────────────────

function poolsForPair(tokenIn, tokenOut) {
  return Object.values(pools).filter(p =>
    (p.tokenA === tokenIn && p.tokenB === tokenOut) ||
    (p.tokenA === tokenOut && p.tokenB === tokenIn)
  );
}

function reserves(pool, tokenIn) {
  return pool.tokenA === tokenIn
    ? { rIn: pool.reserveA, rOut: pool.reserveB }
    : { rIn: pool.reserveB, rOut: pool.reserveA };
}

// Constant-product AMM output (fee applied to input)
function ammOut(amtIn, rIn, rOut, fee) {
  const net = amtIn * (1 - fee);
  return (net * rOut) / (rIn + net);
}

// Marginal price (tokenOut per tokenIn) at current reserves after fee
function marginalPrice(rIn, rOut, fee) {
  return (rOut * (1 - fee)) / rIn;
}

// ─── Optimal split via equal-marginal-price condition ────────────────────────
// For N pools, optimal split equalises the marginal price across all pools.
// We iterate: compute marginal prices, reallocate weight to pools with better
// marginal prices, converge in ~20 rounds for typical inputs.
function optimalSplit(pairPools, tokenIn, totalIn) {
  if (pairPools.length === 1) return [totalIn];

  // Start with liquidity-weighted guess
  const res = pairPools.map(p => reserves(p, tokenIn));
  const weights = res.map(r => Math.sqrt(r.rIn));
  const wSum = weights.reduce((a, b) => a + b, 0);
  let split = weights.map(w => (w / wSum) * totalIn);

  // Iteratively rebalance: move input from lower-marginal-price pools to higher
  for (let iter = 0; iter < 40; iter++) {
    const prices = pairPools.map((p, i) => {
      const { rIn, rOut } = res[i];
      const eff = rIn + split[i] * (1 - p.fee);
      return marginalPrice(eff, rOut, p.fee);
    });

    const maxP = Math.max(...prices);
    const minP = Math.min(...prices);
    if (maxP - minP < 1e-10) break;

    // Gradient step: shift Δ from worst pool to best pool
    const maxIdx = prices.indexOf(maxP);
    const minIdx = prices.indexOf(minP);
    const delta = Math.min(split[minIdx] * 0.05, totalIn * 0.001);
    split[maxIdx] += delta;
    split[minIdx] -= delta;
    if (split[minIdx] < 0) { split[maxIdx] += split[minIdx]; split[minIdx] = 0; }
  }

  return split;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// GET /api/health
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    network: 'arc-testnet',
    pools: Object.keys(pools).length,
    pairs: 8,
    uptime: +process.uptime().toFixed(1),
    timestamp: Date.now(),
  });
});

// GET /api/tokens
app.get('/api/tokens', (req, res) => {
  res.json({ tokens: Object.values(tokens) });
});

// GET /api/markets
app.get('/api/markets', (req, res) => {
  const pairs = [
    ['tSPY','tUSD'], ['tQQQ','tUSD'], ['tNVDA','tUSD'], ['tAAPL','tUSD'],
    ['tTSLA','tUSD'], ['tMSFT','tUSD'], ['tAMZN','tUSD'], ['tCOIN','tUSD'],
  ];

  const markets = pairs.map(([tA, tB]) => {
    const ps = poolsForPair(tA, tB);
    // Liquidity-weighted mid price
    const totalA = ps.reduce((s, p) => s + (p.tokenA === tA ? p.reserveA : p.reserveB), 0);
    const totalB = ps.reduce((s, p) => s + (p.tokenA === tA ? p.reserveB : p.reserveA), 0);
    const price = totalB / totalA;
    const liquidity = totalB; // tUSD side

    // Rough 24h volume estimate: 8% of TVL
    const vol24h = +(liquidity * 0.08).toFixed(0);

    return {
      pair: `${tA}/${tB}`,
      tokenIn: tA,
      tokenOut: tB,
      price: +price.toFixed(4),
      change24h: change24h[tA] ?? 0,
      liquidity: +liquidity.toFixed(2),
      liquidityFmt: liquidity >= 1e6 ? `$${(liquidity / 1e6).toFixed(1)}M`
                  : liquidity >= 1e3 ? `$${(liquidity / 1e3).toFixed(0)}K`
                  : `$${liquidity.toFixed(0)}`,
      volume24h: vol24h,
      pools: ps.length,
    };
  });

  res.json({ markets, updatedAt: Date.now() });
});

// GET /api/pools
app.get('/api/pools', (req, res) => {
  const data = Object.values(pools).map(p => {
    const price = p.reserveB / p.reserveA;
    const tvl = p.reserveB * 2;
    return {
      id: p.id,
      tokenA: p.tokenA,
      tokenB: p.tokenB,
      reserveA: +p.reserveA.toFixed(6),
      reserveB: +p.reserveB.toFixed(6),
      price: +price.toFixed(4),
      fee: p.fee,
      feeBps: Math.round(p.fee * 10000),
      tvl: +tvl.toFixed(2),
    };
  });
  res.json({ pools: data });
});

// POST /api/quote
// { tokenIn, tokenOut, amountIn }
app.post('/api/quote', (req, res) => {
  const { tokenIn, tokenOut, amountIn } = req.body;

  if (!tokenIn || !tokenOut) return res.status(400).json({ error: 'tokenIn and tokenOut required' });
  const amt = parseFloat(amountIn);
  if (!amt || amt <= 0) return res.status(400).json({ error: 'amountIn must be a positive number' });

  const ps = poolsForPair(tokenIn, tokenOut);
  if (!ps.length) return res.status(404).json({ error: `No pools for ${tokenIn}/${tokenOut}` });

  const split = optimalSplit(ps, tokenIn, amt);

  let totalOut = 0;
  let totalFee = 0;
  const shards = [];

  ps.forEach((p, i) => {
    const sharIn = split[i];
    if (sharIn < 1e-9) return;
    const { rIn, rOut } = reserves(p, tokenIn);
    const out = ammOut(sharIn, rIn, rOut, p.fee);
    const fee = sharIn * p.fee;
    const impact = (sharIn / (rIn + sharIn)) * 100;
    totalOut += out;
    totalFee += fee;
    shards.push({
      poolId: p.id,
      amountIn: +sharIn.toFixed(6),
      amountOut: +out.toFixed(6),
      fee: +fee.toFixed(6),
      feeBps: Math.round(p.fee * 10000),
      priceImpact: +impact.toFixed(4),
      share: +(sharIn / amt * 100).toFixed(1),
    });
  });

  // Sort shards by share desc for display
  shards.sort((a, b) => b.share - a.share);

  // Reference price (no slippage — mid price)
  const allR = ps.map(p => reserves(p, tokenIn));
  const midPrice = allR.reduce((s, r) => s + r.rOut, 0) / allR.reduce((s, r) => s + r.rIn, 0);
  const refOut = amt * midPrice;
  const priceImpactTotal = ((refOut - totalOut) / refOut) * 100;

  res.json({
    tokenIn,
    tokenOut,
    amountIn: amt,
    amountOut: +totalOut.toFixed(6),
    effectivePrice: +(totalOut / amt).toFixed(6),
    referencePrice: +midPrice.toFixed(6),
    priceImpact: +priceImpactTotal.toFixed(4),
    savings: +(totalOut - (amt * midPrice * 0.997)).toFixed(6), // vs single best pool
    totalFees: +totalFee.toFixed(6),
    feeToken: tokenIn,
    gasEstimateUsdc: +(0.06 + shards.length * 0.025).toFixed(4),
    shards,
    poolCount: shards.length,
    quoteId: `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    expiresAt: Date.now() + 30000,
  });
});

// POST /api/swap
// { tokenIn, tokenOut, amountIn, minAmountOut?, walletAddress? }
app.post('/api/swap', (req, res) => {
  const { tokenIn, tokenOut, amountIn, minAmountOut, walletAddress } = req.body;
  if (!tokenIn || !tokenOut || !amountIn) return res.status(400).json({ error: 'tokenIn, tokenOut, amountIn required' });

  const amt = parseFloat(amountIn);
  const ps = poolsForPair(tokenIn, tokenOut);
  if (!ps.length) return res.status(404).json({ error: 'No pools found' });

  const split = optimalSplit(ps, tokenIn, amt);
  let totalOut = 0;
  const shards = [];

  ps.forEach((p, i) => {
    const sharIn = split[i];
    if (sharIn < 1e-9) return;
    const { rIn, rOut } = reserves(p, tokenIn);
    const out = ammOut(sharIn, rIn, rOut, p.fee);
    totalOut += out;
    shards.push({ poolId: p.id, amountIn: +sharIn.toFixed(6), amountOut: +out.toFixed(6) });

    // Commit reserve changes
    if (p.tokenA === tokenIn) { p.reserveA += sharIn; p.reserveB -= out; }
    else                       { p.reserveB += sharIn; p.reserveA -= out; }
  });

  if (minAmountOut && totalOut < parseFloat(minAmountOut)) {
    // Revert — in a real chain this would be a revert; here we undo
    ps.forEach((p, i) => {
      const sharIn = split[i];
      if (sharIn < 1e-9) return;
      const out = shards.find(s => s.poolId === p.id)?.amountOut ?? 0;
      if (p.tokenA === tokenIn) { p.reserveA -= sharIn; p.reserveB += out; }
      else                       { p.reserveB -= sharIn; p.reserveA += out; }
    });
    return res.status(400).json({ error: 'Reverted: output below minAmountOut', amountOut: +totalOut.toFixed(6) });
  }

  // Update wallet if address provided
  if (walletAddress) {
    const addr = walletAddress.toLowerCase();
    if (!wallets[addr]) wallets[addr] = {};
    wallets[addr][tokenIn] = (wallets[addr][tokenIn] || 0) - amt;
    wallets[addr][tokenOut] = (wallets[addr][tokenOut] || 0) + totalOut;
  }

  const gas = +(0.06 + shards.length * 0.025).toFixed(4);
  const txHash = '0x' + Array.from({ length: 64 }, () => (Math.random() * 16 | 0).toString(16)).join('');

  const record = {
    txHash,
    status: 'confirmed',
    blockNumber: 4200000 + swapHistory.length,
    tokenIn,
    tokenOut,
    amountIn: amt,
    amountOut: +totalOut.toFixed(6),
    effectivePrice: +(totalOut / amt).toFixed(6),
    gasUsdc: gas,
    shards,
    poolCount: shards.length,
    walletAddress: walletAddress || null,
    timestamp: Date.now(),
  };
  swapHistory.unshift(record);
  if (swapHistory.length > 500) swapHistory.pop();

  res.json(record);
});

// POST /api/faucet/claim
// { walletAddress, token }  — token: 'USDC' | 'tUSD'
app.post('/api/faucet/claim', (req, res) => {
  const { walletAddress, token = 'tUSD' } = req.body;
  if (!walletAddress) return res.status(400).json({ error: 'walletAddress required' });

  const drip = { USDC: 1000, tUSD: 1000000 };
  if (!drip[token]) return res.status(400).json({ error: 'token must be USDC or tUSD' });

  const addr = walletAddress.toLowerCase();
  if (!wallets[addr]) wallets[addr] = {};
  wallets[addr][token] = (wallets[addr][token] || 0) + drip[token];

  const txHash = '0x' + Array.from({ length: 64 }, () => (Math.random() * 16 | 0).toString(16)).join('');
  res.json({
    success: true,
    txHash,
    token,
    amount: drip[token],
    newBalance: wallets[addr][token],
    walletAddress,
    timestamp: Date.now(),
  });
});

// GET /api/wallet/:address/balances
app.get('/api/wallet/:address/balances', (req, res) => {
  const addr = req.params.address.toLowerCase();
  res.json({ walletAddress: req.params.address, balances: wallets[addr] || {} });
});

// GET /api/swaps?limit=20
app.get('/api/swaps', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  res.json({ swaps: swapHistory.slice(0, limit), total: swapHistory.length });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\nShardline API  →  http://localhost:${PORT}\n`);
  console.log('  GET  /api/health');
  console.log('  GET  /api/tokens');
  console.log('  GET  /api/markets');
  console.log('  GET  /api/pools');
  console.log('  POST /api/quote          { tokenIn, tokenOut, amountIn }');
  console.log('  POST /api/swap           { tokenIn, tokenOut, amountIn, minAmountOut?, walletAddress? }');
  console.log('  POST /api/faucet/claim   { walletAddress, token }');
  console.log('  GET  /api/wallet/:address/balances');
  console.log('  GET  /api/swaps?limit=20');
});

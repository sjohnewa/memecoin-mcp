// Exercises the client directly (no MCP transport) end to end, across three chains.
import { getTrendingPools, getPoolDetail, findEarlyWallets } from "./src/geckoterminal.js";
import { computeRiskSignals } from "./src/risk.js";

for (const network of ["solana", "base", "eth"]) {
  console.log(`\n=== ${network} trending pools ===`);
  const pools = await getTrendingPools(network, 5);
  console.log(pools.map((p) => `${p.name}  liq=$${Math.round(p.liquidityUsd).toLocaleString()}  vol24h=$${Math.round(p.volumeUsd24h).toLocaleString()}  age=${((Date.now()-new Date(p.poolCreatedAt))/3600000).toFixed(1)}h`));
}

console.log("\n=== risk signals: top solana trending pool ===");
const [topSolana] = await getTrendingPools("solana", 1);
const detail = await getPoolDetail("solana", topSolana.address);
console.log(detail);
console.log(computeRiskSignals(detail));

console.log("\n=== earliest wallets on that pool ===");
const early = await findEarlyWallets("solana", topSolana.address, { minUsd: 200, topN: 8 });
console.log(early);

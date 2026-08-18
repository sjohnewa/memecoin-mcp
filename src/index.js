import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  getTrendingPools,
  getNewPools,
  getPoolDetail,
  getPoolTrades,
  findEarlyWallets,
} from "./geckoterminal.js";
import { computeRiskSignals } from "./risk.js";

const server = new McpServer({ name: "memecoin-wallet-spotter", version: "1.0.0" });

function asText(payload) {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

const networkArg = z
  .string()
  .describe('Chain id, e.g. "solana", "base", "eth", "bsc", "arbitrum"');

server.registerTool(
  "get_trending_pools",
  {
    title: "Get trending pools",
    description: "Currently-trending token pools on one chain, ranked by GeckoTerminal's trending score.",
    inputSchema: { network: networkArg, limit: z.number().int().positive().max(20).optional() },
  },
  async ({ network, limit }) => asText(await getTrendingPools(network, limit))
);

server.registerTool(
  "get_new_pools",
  {
    title: "Get newest pools",
    description: "Freshly created token pools on one chain — where brand-new memecoin launches show up first.",
    inputSchema: { network: networkArg, limit: z.number().int().positive().max(20).optional() },
  },
  async ({ network, limit }) => asText(await getNewPools(network, limit))
);

server.registerTool(
  "get_pool_risk",
  {
    title: "Get pool risk signals",
    description:
      "Pull one pool's stats (liquidity, volume, age, buy/sell counts) and score it against known rug/risk " +
      "patterns. Heuristic, not a prediction — read the flags, don't just trust the score.",
    inputSchema: { network: networkArg, poolAddress: z.string() },
  },
  async ({ network, poolAddress }) => {
    const pool = await getPoolDetail(network, poolAddress);
    const risk = computeRiskSignals(pool);
    return asText({ pool, risk });
  }
);

server.registerTool(
  "get_pool_trades",
  {
    title: "Get recent trades on a pool",
    description: "Recent individual buy/sell trades on a pool, including the trader's wallet address.",
    inputSchema: {
      network: networkArg,
      poolAddress: z.string(),
      minUsd: z.number().positive().optional().describe("Only trades above this USD size (default 100)"),
    },
  },
  async ({ network, poolAddress, minUsd }) => asText(await getPoolTrades(network, poolAddress, { minUsd }))
);

server.registerTool(
  "find_early_wallets",
  {
    title: "Find early wallets on a pool",
    description:
      "The earliest unique buyer wallets within the trade data the API returns, in chronological order. " +
      "Most accurate on newly-created, lower-volume pools where the returned window covers most of the " +
      "pool's history; on a high-volume pool that's been trading for days, 'earliest in window' may only " +
      "mean 'earliest in the last few minutes,' not since launch. Chronology only — being early is not " +
      "proof of skill or insider status, just a fact you can go investigate further.",
    inputSchema: {
      network: networkArg,
      poolAddress: z.string(),
      minUsd: z.number().positive().optional().describe("Ignore buys smaller than this (default 100)"),
      topN: z.number().int().positive().max(50).optional().describe("How many wallets to return (default 10)"),
    },
  },
  async ({ network, poolAddress, minUsd, topN }) =>
    asText(await findEarlyWallets(network, poolAddress, { minUsd, topN }))
);

const transport = new StdioServerTransport();
await server.connect(transport);

// Thin client for GeckoTerminal's public DEX/pool API (api.geckoterminal.com/api/v2).
// Free, no API key, covers pools across 200+ chains including solana, base, and eth —
// which is what makes a multi-chain tool possible without juggling a different
// provider (and a different key) per chain.
const BASE = "https://api.geckoterminal.com/api/v2";

async function fetchJson(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`GeckoTerminal request failed: ${res.status} ${res.statusText} (${path})`);
  }
  return res.json();
}

function num(v) {
  return v === null || v === undefined ? null : Number(v);
}

function normalizePool(p) {
  const a = p.attributes;
  return {
    network: p.relationships?.network?.data?.id ?? null,
    address: a.address,
    name: a.name,
    poolCreatedAt: a.pool_created_at,
    priceUsd: num(a.base_token_price_usd),
    priceChangePct: {
      h1: num(a.price_change_percentage?.h1),
      h6: num(a.price_change_percentage?.h6),
      h24: num(a.price_change_percentage?.h24),
    },
    volumeUsd24h: num(a.volume_usd?.h24),
    liquidityUsd: num(a.reserve_in_usd),
    fdvUsd: num(a.fdv_usd),
    marketCapUsd: num(a.market_cap_usd),
    txns24h: {
      buys: a.transactions?.h24?.buys ?? 0,
      sells: a.transactions?.h24?.sells ?? 0,
      buyers: a.transactions?.h24?.buyers ?? 0,
      sellers: a.transactions?.h24?.sellers ?? 0,
    },
  };
}

export async function getTrendingPools(network, limit = 10) {
  const data = await fetchJson(`/networks/${network}/trending_pools?limit=${limit}`);
  return data.data.slice(0, limit).map(normalizePool);
}

export async function getNewPools(network, limit = 10) {
  const data = await fetchJson(`/networks/${network}/new_pools?page=1`);
  return data.data.slice(0, limit).map(normalizePool);
}

export async function getPoolDetail(network, poolAddress) {
  const data = await fetchJson(`/networks/${network}/pools/${poolAddress}`);
  return normalizePool(data.data);
}

// Individual trades on a pool, including the trader's wallet address (tx_from_address).
// This is the raw material for "wallet spotting" — who bought, when, how much.
export async function getPoolTrades(network, poolAddress, { minUsd = 100 } = {}) {
  const data = await fetchJson(
    `/networks/${network}/pools/${poolAddress}/trades?trade_volume_in_usd_greater_than=${minUsd}`
  );
  return data.data.map((t) => ({
    kind: t.attributes.kind, // "buy" | "sell"
    wallet: t.attributes.tx_from_address,
    volumeUsd: num(t.attributes.volume_in_usd),
    priceUsd: num(t.attributes.price_from_in_usd),
    timestamp: t.attributes.block_timestamp,
    txHash: t.attributes.tx_hash,
  }));
}

// Convenience wrapper over getPoolTrades: the earliest unique buyer wallets on a pool,
// i.e. candidates for "this wallet was early" — not proof of skill, just chronology.
export async function findEarlyWallets(network, poolAddress, { minUsd = 100, topN = 10 } = {}) {
  const trades = await getPoolTrades(network, poolAddress, { minUsd });
  const buys = trades
    .filter((t) => t.kind === "buy")
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  const seen = new Set();
  const earliest = [];
  for (const t of buys) {
    if (seen.has(t.wallet)) continue;
    seen.add(t.wallet);
    earliest.push(t);
    if (earliest.length >= topN) break;
  }
  return earliest;
}

// Simulated, no-key-required paper trading pass: marks existing paper positions
// to the latest price, then screens trending + new pools across chains and opens
// fixed-size paper positions in anything that clears the rug-risk filter.
// Never touches a real wallet. Run this, then rebuild the dashboard from paper-ledger.json.
import fs from "node:fs/promises";
import { getNewPools, getPoolDetail } from "./src/geckoterminal.js";
import { computeRiskSignals } from "./src/risk.js";

const LEDGER_PATH = new URL("./paper-ledger.json", import.meta.url);
const STARTING_BANKROLL = 10_000;
const POSITION_SIZE = 250;
const NETWORKS = ["solana", "base", "eth"];

async function loadLedger() {
  try {
    return JSON.parse(await fs.readFile(LEDGER_PATH, "utf8"));
  } catch {
    return { bankroll: { starting: STARTING_BANKROLL }, positions: [] };
  }
}

async function saveLedger(ledger) {
  await fs.writeFile(LEDGER_PATH, JSON.stringify(ledger, null, 2));
}

function cashAvailable(ledger) {
  const committed = ledger.positions
    .filter((p) => p.status === "open")
    .reduce((sum, p) => sum + p.sizeUsd, 0);
  return ledger.bankroll.starting - committed;
}

async function markOpenPositions(ledger) {
  for (const p of ledger.positions) {
    if (p.status !== "open") continue;
    try {
      const detail = await getPoolDetail(p.network, p.poolAddress);
      if (detail.priceUsd) {
        p.lastMarkPriceUsd = detail.priceUsd;
        p.lastMarkTime = new Date().toISOString();
        delete p.markError;
      }
    } catch (e) {
      p.markError = String(e.message || e);
    }
  }
}

async function screenAndOpenNew(ledger) {
  const held = new Set(
    ledger.positions.filter((p) => p.status === "open").map((p) => `${p.network}:${p.poolAddress}`)
  );
  const opened = [];

  for (const network of NETWORKS) {
    let candidates = [];
    try {
      // Deliberately new_pools only, not trending: trending mixes in established
      // majors (WETH/USDC, multi-year-old PEPE) that aren't fresh memecoin spots —
      // new_pools is where an actual "did the early screen work" test lives.
      candidates = await getNewPools(network, 15);
    } catch {
      continue;
    }

    for (const pool of candidates) {
      const key = `${network}:${pool.address}`;
      if (held.has(key)) continue;
      if (cashAvailable(ledger) < POSITION_SIZE) break;
      if (!pool.priceUsd || !pool.liquidityUsd) continue;

      const risk = computeRiskSignals(pool);
      if (risk.riskLevel === "high") continue; // skip the obvious rugs

      const position = {
        id: `${key}:${Date.now()}`,
        network,
        poolAddress: pool.address,
        name: pool.name,
        sizeUsd: POSITION_SIZE,
        entryPriceUsd: pool.priceUsd,
        entryTime: new Date().toISOString(),
        status: "open",
        lastMarkPriceUsd: pool.priceUsd,
        lastMarkTime: new Date().toISOString(),
        riskAtEntry: { level: risk.riskLevel, flags: risk.flags },
      };
      ledger.positions.push(position);
      held.add(key);
      opened.push(position);
    }
  }
  return opened;
}

const ledger = await loadLedger();
await markOpenPositions(ledger);
const opened = await screenAndOpenNew(ledger);
await saveLedger(ledger);

const openPositions = ledger.positions.filter((p) => p.status === "open");
const equity =
  cashAvailable(ledger) +
  openPositions.reduce((sum, p) => sum + p.sizeUsd * (p.lastMarkPriceUsd / p.entryPriceUsd), 0);

console.log(`Opened ${opened.length} new paper position(s) this run.`);
for (const p of opened) console.log(`  + ${p.network}:${p.name} @ $${p.entryPriceUsd} (risk: ${p.riskAtEntry.level})`);
console.log(`\nOpen positions: ${openPositions.length}`);
console.log(`Cash: $${cashAvailable(ledger).toFixed(2)}`);
console.log(`Equity: $${equity.toFixed(2)}`);
console.log(`Total PnL: $${(equity - ledger.bankroll.starting).toFixed(2)}`);

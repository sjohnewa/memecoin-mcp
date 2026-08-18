// Regenerates the paper-trading section of dashboard-demo.html from paper-ledger.json,
// so a refresh is a deterministic rebuild, not a hand-edit. Run paper-trade.js first.
import fs from "node:fs/promises";

const LEDGER_PATH = new URL("./paper-ledger.json", import.meta.url);
const DASHBOARD_PATH = new URL("./dashboard-demo.html", import.meta.url);
const START = "<!-- PAPER_TRADE_START -->";
const END = "<!-- PAPER_TRADE_END -->";

const CHAIN_LABEL = { solana: "Solana", base: "Base", eth: "Ethereum" };
const CHAIN_VAR = { solana: "--sol", base: "--base-chain", eth: "--eth" };

function fmtUsd(n, digits = 2) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function fmtPrice(n) {
  // Memecoin prices are often sub-cent; show enough significant digits to be legible.
  if (n >= 1) return `$${n.toFixed(4)}`;
  return `$${n.toPrecision(3)}`;
}

function pnlClass(v) {
  if (v > 0.005) return "pos";
  if (v < -0.005) return "neg";
  return "flat";
}

const ledger = JSON.parse(await fs.readFile(LEDGER_PATH, "utf8"));

const openPositions = ledger.positions.filter((p) => p.status === "open");
const committed = openPositions.reduce((sum, p) => sum + p.sizeUsd, 0);
const cash = ledger.bankroll.starting - committed;
const equity =
  cash + openPositions.reduce((sum, p) => sum + p.sizeUsd * (p.lastMarkPriceUsd / p.entryPriceUsd), 0);
const totalPnl = equity - ledger.bankroll.starting;
const totalPnlPct = (totalPnl / ledger.bankroll.starting) * 100;

const lastRefreshed = openPositions.reduce((latest, p) => {
  const t = new Date(p.lastMarkTime || p.entryTime).getTime();
  return Math.max(latest, t);
}, 0);
const refreshedLabel = lastRefreshed
  ? new Date(lastRefreshed).toISOString().replace("T", " ").slice(0, 16) + " UTC"
  : "never";

const rows = openPositions
  .map((p) => {
    const pnlUsd = p.sizeUsd * (p.lastMarkPriceUsd / p.entryPriceUsd - 1);
    const pnlPct = (p.lastMarkPriceUsd / p.entryPriceUsd - 1) * 100;
    const cls = pnlClass(pnlUsd);
    const sign = pnlUsd > 0 ? "+" : "";
    return `          <tr>
            <td class="mono">${p.name}</td>
            <td class="mono" style="color: var(${CHAIN_VAR[p.network] || "--ink-faint"});">${CHAIN_LABEL[p.network] || p.network}</td>
            <td class="mono">${fmtPrice(p.entryPriceUsd)}</td>
            <td class="mono">${fmtPrice(p.lastMarkPriceUsd)}</td>
            <td class="mono pnl-cell ${cls}">${sign}${fmtUsd(pnlUsd)} (${sign}${pnlPct.toFixed(1)}%)</td>
            <td><span class="risk-badge ${p.riskAtEntry.level.startsWith("low") ? "low" : p.riskAtEntry.level}">${p.riskAtEntry.level.startsWith("low") ? "Low" : p.riskAtEntry.level[0].toUpperCase() + p.riskAtEntry.level.slice(1)}</span></td>
          </tr>`;
  })
  .join("\n");

const totalCls = pnlClass(totalPnl);
const totalSign = totalPnl > 0 ? "+" : "";

const block = `${START}
    <div class="refresh-note"><span class="refresh-dot"></span>Last refreshed ${refreshedLabel} &middot; scheduled routine, no manual request needed</div>

    <div class="stat-tiles">
      <div class="stat-tile"><div class="num">${fmtUsd(ledger.bankroll.starting)}</div><div class="cap">Starting bankroll</div></div>
      <div class="stat-tile"><div class="num">${fmtUsd(cash)}</div><div class="cap">Cash, uncommitted</div></div>
      <div class="stat-tile"><div class="num">${fmtUsd(equity)}</div><div class="cap">Equity right now</div></div>
      <div class="stat-tile"><div class="num pnl-cell ${totalCls}">${totalSign}${fmtUsd(totalPnl)}</div><div class="cap">Total PnL (${totalSign}${totalPnlPct.toFixed(2)}%)</div></div>
    </div>

    <div class="risk-table-card">
      <table>
        <thead><tr><th>Position</th><th>Chain</th><th>Entry price</th><th>Mark price</th><th>Unrealized PnL</th><th>Risk at entry</th></tr></thead>
        <tbody>
${rows || '          <tr><td colspan="6" class="mono" style="color: var(--ink-faint);">No open positions.</td></tr>'}
        </tbody>
      </table>
    </div>
    <p class="section-note" style="margin-top: 14px;">${openPositions.length} open position${openPositions.length === 1 ? "" : "s"}, rebuilt from <code>paper-ledger.json</code> on every refresh. This is the live experiment: does skipping risk-flagged pools beat buying everything new?</p>
    ${END}`;

let html = await fs.readFile(DASHBOARD_PATH, "utf8");
const startIdx = html.indexOf(START);
const endIdx = html.indexOf(END);
if (startIdx === -1 || endIdx === -1) {
  throw new Error("Paper-trade markers not found in dashboard-demo.html — did the template change?");
}
html = html.slice(0, startIdx) + block + html.slice(endIdx + END.length);
await fs.writeFile(DASHBOARD_PATH, html);

console.log(`Rebuilt dashboard: ${openPositions.length} open position(s), equity ${fmtUsd(equity)}, PnL ${totalSign}${fmtUsd(totalPnl)} (${totalSign}${totalPnlPct.toFixed(2)}%).`);

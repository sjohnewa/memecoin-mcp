# memecoin-mcp

Read-only MCP server for spotting trending/new memecoin pools, scoring them
against known rug patterns, and surfacing the wallets buying in early — across
Solana, Base, Ethereum, and anything else GeckoTerminal covers. No API key,
free tier. **Nothing in this server can move funds or place a trade** — it
only reads public on-chain data.

## Tools

| Tool | What it does |
|---|---|
| `get_trending_pools` | currently-trending pools on one chain |
| `get_new_pools` | freshly-created pools — where new launches show up first |
| `get_pool_risk` | liquidity/age/volume stats + a transparent rug-risk score |
| `get_pool_trades` | recent individual trades on a pool, with wallet addresses |
| `find_early_wallets` | earliest unique buyer wallets in the returned trade window |

## Setup

```
npm install
npm run demo      # proves the pipeline live across solana/base/eth
```

## Wire it into Claude Code

```
claude mcp add memecoin-spotter -- node "C:\Users\PC\Desktop\Research\memecoin-mcp\src\index.js"
```

or add by hand:

```json
{
  "mcpServers": {
    "memecoin-spotter": {
      "command": "node",
      "args": ["C:\\Users\\PC\\Desktop\\Research\\memecoin-mcp\\src\\index.js"]
    }
  }
}
```

## Unattended refresh (scheduled routine)

The dashboard's paper-trading section is now machine-regenerable:
`paper-trade.js` marks/screens positions into `paper-ledger.json`, then
`build-dashboard.js` rewrites the block between `<!-- PAPER_TRADE_START -->`
and `<!-- PAPER_TRADE_END -->` in `dashboard-demo.html` from that ledger.
That's the whole pipeline a scheduled routine needs to run.

**Blocked on**: this repo isn't on GitHub yet, and this machine has no `gh`
CLI and no git credentials configured, so it can't be pushed from here
unattended. To close the loop: install the GitHub CLI and run
`gh auth login` once (interactive, one-time) — after that, push access and
routine creation can happen from an agent session without further manual
steps. The routine, once wired, would run roughly: `npm ci && node
paper-trade.js && node build-dashboard.js`, then commit+push the updated
ledger/dashboard, then republish the artifact at the URL pinned in the
routine's own prompt.

## Paper trading

```
node paper-trade.js
```

Simulated $10,000 bankroll, $250 per position, persisted to `paper-ledger.json`.
Each run: marks every open position to its latest price, then screens
`get_new_pools` across all three chains and opens a position in anything that
doesn't get flagged `"high"` risk by `computeRiskSignals`. No real wallet, no
key, no trade ever leaves this script. This is the actual test of the wallet-
spotting/risk-screen work above: does avoiding the obviously-flagged pools
beat just buying everything new?

**This does not run on its own.** The dashboard (`dashboard-demo.html`) bakes
in the ledger state at publish time — it can't poll GeckoTerminal itself
(published Artifacts can't fetch arbitrary external APIs, and the runtime's
live-data bridge only reaches claude.ai connectors, not a local MCP server).
To refresh: run `paper-trade.js`, then rebuild the dashboard's paper-trading
section from the updated `paper-ledger.json` and republish. Currently done
on request, not on a schedule — ask for a refresh, or ask to set up a
recurring one if that's wanted later.

## Real limitations, found while building this (read before trusting the output)

- **`find_early_wallets` is window-limited, not history-complete.** The trades
  endpoint returns recent trades, not a full pool history. On a pool that's
  been trading for days at high volume, "earliest in the window" might mean
  "earliest in the last five minutes." It's only a true "since launch" signal
  on pools young enough that the window covers their whole life — which,
  conveniently, is also when spotting early wallets is most interesting.
- **Free-tier rate limits are real.** The `/trades` endpoint 429'd repeatedly
  while building this. Space out calls; don't hammer it in a loop.
- **XBRL-style tag inconsistency has a crypto equivalent: token name squatting.**
  While testing `get_new_pools`, five separate brand-new "billy"-named tokens
  showed up in the same 15-minute window, riding a trending name. Name/symbol
  alone is not identity — always check the pool address.
- **Being early is not being smart.** The wallets in `find_early_wallets` are
  ranked by timestamp only. On the live example in the dashboard, eight
  wallets bought within the same two seconds — that's sniper bots racing a
  new pool, not considered conviction. Treat "early" as a fact to investigate,
  never as a signal to copy.

## What this deliberately doesn't do

This was scoped as read-only on purpose. A "copy trading agent" that
auto-executes real trades is a fundamentally different, much higher-risk
build — it means holding a private key capable of moving funds, and
memecoin copy-trading in particular tends to lose to latency (bots see
a tracked wallet's buy before you can act on it) and to survivorship bias
(a wallet that looks smart in hindsight was usually just early or an
insider). If that's still wanted later, it deserves its own deliberate
scoping conversation — paper-trading first, explicit capital limits, and
key custody that never touches plaintext in a config file — not a bolt-on
to this tool.

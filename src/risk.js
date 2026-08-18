// Transparent, rule-based rug/risk heuristics — not a model, not a guarantee.
// Every flag here is a known memecoin failure pattern, not a prediction.

export function computeRiskSignals(pool) {
  const flags = [];
  let score = 0; // 0 = no flags tripped, higher = more flags tripped

  const ageHours = pool.poolCreatedAt
    ? (Date.now() - new Date(pool.poolCreatedAt).getTime()) / 3_600_000
    : null;

  if (ageHours !== null && ageHours < 24) {
    flags.push(`Pool is ${ageHours.toFixed(1)}h old — unproven, most rugs happen in the first 24-48h.`);
    score += 25;
  }

  if (pool.liquidityUsd !== null && pool.liquidityUsd < 20_000) {
    flags.push(`Liquidity is only $${Math.round(pool.liquidityUsd).toLocaleString()} — thin enough to move price sharply or trap size on exit.`);
    score += 25;
  }

  if (pool.fdvUsd !== null && pool.liquidityUsd) {
    const ratio = pool.fdvUsd / pool.liquidityUsd;
    if (ratio > 50) {
      flags.push(`FDV is ${ratio.toFixed(0)}x liquidity — paper valuation far outruns what's actually backing it.`);
      score += 20;
    }
  }

  const { buys, sells, buyers, sellers } = pool.txns24h;
  if (buys > 100 && sellers > 0 && sellers < buyers * 0.15) {
    flags.push(`${buyers} unique buyers vs. only ${sellers} unique sellers in 24h — few people are managing to sell, a honeypot-adjacent pattern.`);
    score += 30;
  }
  if (buys > 50 && sells === 0) {
    flags.push("Zero sells recorded despite active buying — check whether selling is actually possible before touching this.");
    score += 30;
  }

  const level = score >= 50 ? "high" : score >= 25 ? "elevated" : "low (by these signals only)";

  return { ageHours, riskScore: score, riskLevel: level, flags };
}

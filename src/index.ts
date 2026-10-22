import { config } from "./config.js";
import { execute } from "./execute.js";
import { research } from "./research.js";
import { killSwitchEngaged } from "./risk.js";
import { getAccount, getHoldings, getQuotes } from "./robinhood.js";

async function cycle() {
  if (killSwitchEngaged()) {
    console.log(`Kill switch engaged (${config.killSwitchFile}); skipping cycle.`);
    return;
  }
  console.log(`\n=== Cycle ${new Date().toISOString()} (${config.liveTrading ? "LIVE" : "dry run"}) ===`);

  const [account, quotes, holdings] = await Promise.all([getAccount(), getQuotes(config.symbols), getHoldings()]);

  const findings = await research(quotes, holdings, account.buying_power);
  console.log("Claude research:", findings.market_summary);
  for (const s of findings.signals) console.log(`  ${s.symbol}: ${s.action} $${s.usd_amount} (${s.confidence}) — ${s.rationale}`);

  const summary = await execute(findings);
  console.log("Grok execution:", summary);
}

async function main() {
  await cycle();
  if (process.argv.includes("--once")) return;
  setInterval(() => cycle().catch((err) => console.error("Cycle failed:", err)), config.cycleMinutes * 60_000);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

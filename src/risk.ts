// Every order Grok requests passes through here. Grok cannot bypass these checks.
import fs from "node:fs";
import { config } from "./config.js";

const LEDGER_PATH = "state/ledger.json";

interface LedgerEntry { date: string; symbol: string; side: string; usd: number; live: boolean; orderId?: string }

function readLedger(): LedgerEntry[] {
  try {
    return JSON.parse(fs.readFileSync(LEDGER_PATH, "utf8"));
  } catch {
    return [];
  }
}

export function recordOrder(entry: LedgerEntry) {
  fs.mkdirSync("state", { recursive: true });
  fs.writeFileSync(LEDGER_PATH, JSON.stringify([...readLedger(), entry], null, 2));
}

function spentToday(): number {
  const today = new Date().toISOString().slice(0, 10);
  return readLedger()
    .filter((e) => e.live && e.date.startsWith(today))
    .reduce((sum, e) => sum + e.usd, 0);
}

export function killSwitchEngaged(): boolean {
  return fs.existsSync(config.killSwitchFile);
}

export function checkOrder(symbol: string, usd: number): string | null {
  if (killSwitchEngaged()) return `Kill switch engaged (${config.killSwitchFile} exists).`;
  if (!config.symbols.includes(symbol)) return `${symbol} is not in the allowed SYMBOLS list.`;
  if (!(usd > 0)) return "Order size must be positive.";
  if (usd > config.maxOrderUsd) return `Order of $${usd.toFixed(2)} exceeds MAX_ORDER_USD ($${config.maxOrderUsd}).`;
  const spent = spentToday();
  if (spent + usd > config.maxDailyUsd)
    return `Order would exceed MAX_DAILY_USD ($${config.maxDailyUsd}); $${spent.toFixed(2)} already traded today.`;
  return null;
}

import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name} (see .env.example)`);
  return value;
}

export const config = {
  anthropicModel: "claude-opus-5-5",
  xaiApiKey: () => required("XAI_API_KEY"),
  xaiModel: process.env.XAI_MODEL ?? "grok-4",
  robinhoodApiKey: () => required("ROBINHOOD_API_KEY"),
  robinhoodPrivateKey: () => required("ROBINHOOD_PRIVATE_KEY"),
  liveTrading: process.env.LIVE_TRADING === "true",
  killSwitchFile: process.env.KILL_SWITCH_FILE ?? "KILL",
  symbols: (process.env.SYMBOLS ?? "BTC-USD,ETH-USD").split(",").map((s) => s.trim()).filter(Boolean),
  maxOrderUsd: Number(process.env.MAX_ORDER_USD ?? 50),
  maxDailyUsd: Number(process.env.MAX_DAILY_USD ?? 200),
  minConfidence: Number(process.env.MIN_CONFIDENCE ?? 0.7),
  cycleMinutes: Number(process.env.CYCLE_MINUTES ?? 60),
};

# Grok Trader: Claude researches, Grok executes

A crypto trading NPC wired to Robinhood's official Crypto Trading API.

Each cycle:
1. **Data.** Pull quotes, holdings and buying power from Robinhood.
2. **Research (Claude).** Claude analyses the data and returns structured signals: symbol, action, USD size, confidence and rationale. Claude never trades.
3. **Execute (Grok).** Grok gets the signals through the xAI API, checks live quotes, and calls `place_order` for the signals it agrees with.
4. **Risk gate.** Every order passes `src/risk.ts` before it reaches Robinhood: symbol allowlist, per-order cap, daily cap and kill switch. Grok can't bypass it.

> Robinhood's official API supports **crypto only**. Stocks and options have no public trading API.

## Setup

```bash
npm install
cp .env.example .env   # fill in the keys locally; never commit .env
npm run once           # one research→execute cycle
npm start              # run every CYCLE_MINUTES
```

| Variable | Where to get it |
|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys |
| `XAI_API_KEY` | console.x.ai → API Keys |
| `ROBINHOOD_API_KEY`, `ROBINHOOD_PRIVATE_KEY` | Robinhood web → Account → Crypto → API Trading. Generate an Ed25519 key pair, register the public key, and keep the base64 private key. |

## Safety

- **Dry run by default.** Real orders are only sent when `LIVE_TRADING=true`. Every decision is logged to `state/ledger.json`.
- **Kill switch.** `touch KILL` stops all order placement at once. Delete the file to resume.
- **Limits.** `MAX_ORDER_USD`, `MAX_DAILY_USD`, `SYMBOLS` and `MIN_CONFIDENCE`.

Run in dry-run mode for a while and read the ledger before switching to live trading.

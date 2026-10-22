// Grok's job: review Claude's signals and execute the ones it agrees with, through risk-checked tools.
// Uses xAI's chat completions API with function calling.
import { config } from "./config.js";
import { checkOrder, recordOrder } from "./risk.js";
import { getQuotes, placeMarketOrder } from "./robinhood.js";
import type { Research } from "./research.js";

const XAI_URL = "https://api.x.ai/v1/chat/completions";
const MAX_ROUNDS = 8;

const tools = [
  {
    type: "function",
    function: {
      name: "get_quote",
      description: "Get the current best bid/ask for a crypto symbol such as BTC-USD.",
      parameters: { type: "object", properties: { symbol: { type: "string" } }, required: ["symbol"] },
    },
  },
  {
    type: "function",
    function: {
      name: "place_order",
      description:
        "Place a market order sized in USD. Risk limits are enforced server-side; a rejected order returns the reason.",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string" },
          side: { type: "string", enum: ["buy", "sell"] },
          usd_amount: { type: "number" },
          reason: { type: "string" },
        },
        required: ["symbol", "side", "usd_amount", "reason"],
      },
    },
  },
];

type ChatMessage = Record<string, unknown>;

async function runTool(name: string, args: Record<string, any>): Promise<unknown> {
  if (name === "get_quote") return (await getQuotes([args.symbol]))[0] ?? { error: "No quote" };

  if (name === "place_order") {
    const { symbol, side, usd_amount: usd } = args;
    const rejection = checkOrder(symbol, usd);
    if (rejection) return { status: "rejected", reason: rejection };

    const [quote] = await getQuotes([symbol]);
    const price = Number(side === "buy" ? quote.ask_inclusive_of_buy_spread : quote.bid_inclusive_of_sell_spread);
    const assetQuantity = (usd / price).toFixed(8);

    if (!config.liveTrading) {
      recordOrder({ date: new Date().toISOString(), symbol, side, usd, live: false });
      console.log(`[dry run] ${side} ${assetQuantity} ${symbol} (~$${usd}) — ${args.reason}`);
      return { status: "dry_run", symbol, side, assetQuantity };
    }

    const order = await placeMarketOrder({ symbol, side, assetQuantity });
    recordOrder({ date: new Date().toISOString(), symbol, side, usd, live: true, orderId: order.id });
    console.log(`[LIVE] ${side} ${assetQuantity} ${symbol} (~$${usd}) order ${order.id} — ${args.reason}`);
    return { status: "submitted", orderId: order.id, state: order.state };
  }

  return { error: `Unknown tool ${name}` };
}

export async function execute(research: Research): Promise<string> {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are the execution trader. A research analyst (Claude) hands you signals. " +
        `Only act on signals with confidence >= ${config.minConfidence}. ` +
        "Check the live quote before trading; skip a signal if the price has moved against its rationale. " +
        "You may decline any signal. Finish with a short summary of what you did and why.",
    },
    { role: "user", content: JSON.stringify(research) },
  ];

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await fetch(XAI_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.xaiApiKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: config.xaiModel, messages, tools, tool_choice: "auto" }),
    });
    if (!res.ok) throw new Error(`xAI request failed (${res.status}): ${await res.text()}`);
    const data = (await res.json()) as any;
    const message = data.choices[0].message;
    messages.push(message);

    if (!message.tool_calls?.length) return message.content ?? "";

    for (const call of message.tool_calls) {
      let result: unknown;
      try {
        result = await runTool(call.function.name, JSON.parse(call.function.arguments));
      } catch (err) {
        result = { error: String(err) };
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  return "Stopped: Grok hit the tool-call round limit.";
}

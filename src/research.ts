// Claude's job: analyse market data and current holdings, and produce trade signals.
// Claude never places orders.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { config } from "./config.js";
import type { Holding, Quote } from "./robinhood.js";

export const SignalSchema = z.object({
  signals: z.array(
    z.object({
      symbol: z.string(),
      action: z.enum(["buy", "sell", "hold"]),
      usd_amount: z.number().describe("Dollar size of the trade; 0 for hold"),
      confidence: z.number().describe("0 to 1"),
      rationale: z.string(),
    }),
  ),
  market_summary: z.string(),
});
export type Research = z.infer<typeof SignalSchema>;

const client = new Anthropic();

export async function research(quotes: Quote[], holdings: Holding[], buyingPower: string): Promise<Research> {
  const response = await client.messages.parse({
    model: config.anthropicModel,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: zodOutputFormat(SignalSchema) },
    system:
      "You are the research analyst for a small, risk-averse crypto trading bot. " +
      "Another agent executes your signals, so be explicit and conservative. " +
      "Recommend 'hold' unless the data gives a clear reason to act. " +
      `Only use these symbols: ${config.symbols.join(", ")}. ` +
      `Never size a single trade above $${config.maxOrderUsd}.`,
    messages: [
      {
        role: "user",
        content: JSON.stringify({ timestamp: new Date().toISOString(), buying_power_usd: buyingPower, quotes, holdings }),
      },
    ],
  });

  if (response.stop_reason === "refusal") throw new Error("Claude declined the research request.");
  if (!response.parsed_output) throw new Error(`Research output could not be parsed (stop_reason: ${response.stop_reason}).`);
  return response.parsed_output;
}

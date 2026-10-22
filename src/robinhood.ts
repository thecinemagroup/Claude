// Client for Robinhood's official Crypto Trading API (https://docs.robinhood.com/crypto/trading/).
// Requests are signed with Ed25519 over `${apiKey}${timestamp}${path}${method}${body}`.
import crypto from "node:crypto";
import { config } from "./config.js";

const BASE_URL = "https://trading.robinhood.com";
// PKCS#8 DER prefix for a raw 32-byte Ed25519 seed
const ED25519_PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

let privateKey: crypto.KeyObject | undefined;
function signingKey(): crypto.KeyObject {
  if (!privateKey) {
    const seed = Buffer.from(config.robinhoodPrivateKey(), "base64").subarray(0, 32);
    privateKey = crypto.createPrivateKey({
      key: Buffer.concat([ED25519_PKCS8_PREFIX, seed]),
      format: "der",
      type: "pkcs8",
    });
  }
  return privateKey;
}

async function request<T>(method: "GET" | "POST", path: string, body?: object): Promise<T> {
  const apiKey = config.robinhoodApiKey();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const bodyText = body ? JSON.stringify(body) : "";
  const message = `${apiKey}${timestamp}${path}${method}${bodyText}`;
  const signature = crypto.sign(null, Buffer.from(message), signingKey()).toString("base64");

  const res = await fetch(BASE_URL + path, {
    method,
    headers: {
      "x-api-key": apiKey,
      "x-timestamp": timestamp,
      "x-signature": signature,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: body ? bodyText : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Robinhood ${method} ${path} failed (${res.status}): ${text}`);
  return JSON.parse(text) as T;
}

export interface Quote {
  symbol: string;
  bid_inclusive_of_sell_spread: string;
  ask_inclusive_of_buy_spread: string;
  price: string;
}

export interface Holding {
  asset_code: string;
  total_quantity: string;
  quantity_available_for_trading: string;
}

export async function getAccount(): Promise<{ account_number: string; buying_power: string; status: string }> {
  return request("GET", "/api/v1/crypto/trading/accounts/");
}

export async function getQuotes(symbols: string[]): Promise<Quote[]> {
  const query = symbols.map((s) => `symbol=${encodeURIComponent(s)}`).join("&");
  const data = await request<{ results: Quote[] }>("GET", `/api/v1/crypto/marketdata/best_bid_ask/?${query}`);
  return data.results;
}

export async function getHoldings(): Promise<Holding[]> {
  const data = await request<{ results: Holding[] }>("GET", "/api/v1/crypto/trading/holdings/");
  return data.results;
}

export async function placeMarketOrder(params: { symbol: string; side: "buy" | "sell"; assetQuantity: string }) {
  return request<{ id: string; state: string }>("POST", "/api/v1/crypto/trading/orders/", {
    client_order_id: crypto.randomUUID(),
    side: params.side,
    symbol: params.symbol,
    type: "market",
    market_order_config: { asset_quantity: params.assetQuantity },
  });
}

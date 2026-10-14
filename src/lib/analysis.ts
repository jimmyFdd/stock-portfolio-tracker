// Server-only: AI daily stock-movement diagnosis via the Claude API.
//
// Cost control is two-layered:
//   1. DB cache — @@unique([symbol, date]) means we call Claude at most once per
//      ticker per day; subsequent requests (and all other users) reuse the row.
//   2. Prompt caching — the instruction system prompt is identical across every
//      ticker, so it carries a `cache_control` breakpoint.
//
// Model: claude-haiku-4-5 (the current, non-retired equivalent of the requested
// claude-3-5-haiku) — cheap and more than capable for a short structured verdict.

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "./prisma";
import { getQuote, getCompanyNews, getMarketNews } from "./provider";
import type { DailyAnalysis, AnalysisDriver, AnalysisTrajectory } from "./types";

const MODEL = "claude-haiku-4-5";

/** Today's date as YYYY-MM-DD (UTC) — the cache key alongside the symbol. */
const todayUtc = () => new Date().toISOString().slice(0, 10);

const SYSTEM_PROMPT = `You are an equity research analyst. Given a stock's daily price move and the day's news, diagnose what drove the move and whether it changes the long-term investment thesis.

Classify two things:
- driver: "Macro" when the move is primarily driven by market-wide, economic, Federal Reserve, or sector-wide factors; "Micro" when primarily company-specific (earnings, products, management, guidance, filings, analyst actions); "Both" when materially driven by each.
- trajectoryType: "Transitory Noise" when the move is short-term volatility unlikely to affect the multi-year thesis; "Structural Shift" when it reflects a durable change to fundamentals or the investment thesis.

Then write:
- summary: 2-3 sentences explaining the specific news, earnings, or market factors behind today's move. Cite the concrete catalyst when the provided data supports one.
- longTermOutlook: an analytical breakdown of whether this move affects the company's multi-year investment thesis or is temporary volatility, with brief reasoning.

Base your analysis only on the provided data. When news is sparse, infer the most likely driver from the price move and market context and say so explicitly rather than inventing specifics. Be concise and concrete; avoid generic filler and hedging boilerplate.`;

// Structured-output schema — guarantees valid, typed JSON back from the model.
const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    driver: { type: "string", enum: ["Macro", "Micro", "Both"] },
    summary: { type: "string" },
    trajectoryType: { type: "string", enum: ["Transitory Noise", "Structural Shift"] },
    longTermOutlook: { type: "string" },
  },
  required: ["driver", "summary", "trajectoryType", "longTermOutlook"],
} as const;

class AnalysisError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

function serialize(row: {
  symbol: string;
  date: string;
  driver: string;
  summary: string;
  trajectoryType: string;
  longTermOutlook: string;
}, priceChangePct: number | null, cached: boolean): DailyAnalysis {
  return {
    symbol: row.symbol,
    date: row.date,
    driver: row.driver as AnalysisDriver,
    summary: row.summary,
    trajectoryType: row.trajectoryType as AnalysisTrajectory,
    longTermOutlook: row.longTermOutlook,
    priceChangePct,
    cached,
  };
}

/** Build the per-ticker user prompt from today's price move + micro/macro news. */
async function gatherContext(symbol: string): Promise<{ prompt: string; pct: number | null }> {
  const [quoteRes, microRes, macroRes] = await Promise.allSettled([
    getQuote(symbol),
    getCompanyNews(symbol),
    getMarketNews(),
  ]);

  const pct = quoteRes.status === "fulfilled" ? quoteRes.value.percentChange : null;
  const micro = microRes.status === "fulfilled" ? microRes.value : [];
  const macro = macroRes.status === "fulfilled" ? macroRes.value : [];

  const fmt = (items: { headline: string; source: string }[], n: number) =>
    items.slice(0, n).map((a) => `- ${a.headline} (${a.source})`).join("\n") || "- (none today)";

  const prompt = `Ticker: ${symbol}
Today's price change: ${pct == null ? "unknown" : `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`}

Company-specific (micro) headlines today:
${fmt(micro, 8)}

Market-wide (macro) headlines today:
${fmt(macro, 8)}

Diagnose today's move.`;

  return { prompt, pct };
}

/** Call Claude and return the validated structured verdict. */
async function generate(symbol: string): Promise<{
  driver: string;
  summary: string;
  trajectoryType: string;
  longTermOutlook: string;
  pct: number | null;
}> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AnalysisError(
      "ANTHROPIC_API_KEY is not configured. Add it to .env.local to enable AI analysis.",
      500
    );
  }

  const client = new Anthropic();
  const { prompt, pct } = await gatherContext(symbol);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: [
      // Shared across every ticker → cacheable prefix.
      { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: prompt }],
    output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
  } as any);

  const text = response.content.find((b: any) => b.type === "text") as { text?: string } | undefined;
  if (!text?.text) throw new AnalysisError("Empty analysis response from Claude.");

  let parsed: any;
  try {
    parsed = JSON.parse(text.text);
  } catch {
    throw new AnalysisError("Could not parse the analysis response.");
  }
  return { ...parsed, pct };
}

/**
 * Return today's analysis for a ticker, generating + caching it if missing.
 * Pass `refresh` to force regeneration (the UI's "Refresh Analysis" button).
 */
export async function getDailyAnalysis(
  symbol: string,
  opts: { refresh?: boolean } = {}
): Promise<DailyAnalysis> {
  const sym = symbol.toUpperCase();
  const date = todayUtc();

  if (!opts.refresh) {
    const cached = await prisma.dailyAnalysis.findUnique({
      where: { symbol_date: { symbol: sym, date } },
    });
    if (cached) {
      // Attach the live price move for display without spending tokens.
      let pct: number | null = null;
      try {
        pct = (await getQuote(sym)).percentChange;
      } catch {
        /* price optional */
      }
      return serialize(cached, pct, true);
    }
  }

  const result = await generate(sym);
  const row = await prisma.dailyAnalysis.upsert({
    where: { symbol_date: { symbol: sym, date } },
    update: {
      driver: result.driver,
      summary: result.summary,
      trajectoryType: result.trajectoryType,
      longTermOutlook: result.longTermOutlook,
    },
    create: {
      symbol: sym,
      date,
      driver: result.driver,
      summary: result.summary,
      trajectoryType: result.trajectoryType,
      longTermOutlook: result.longTermOutlook,
    },
  });

  return serialize(row, result.pct, false);
}

export { AnalysisError };

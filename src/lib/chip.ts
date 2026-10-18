// Server-only: multi-market "chip distribution" (籌碼面) aggregation.
//
// Market routers:
//   US — institutional % + insider % (Yahoo quoteSummary, best-effort; crumb-
//        throttled from cloud IPs), short interest % (Yahoo), and net insider
//        share flow (Finnhub insider-sentiment, reliable from the cloud).
//   JP — same Yahoo/Finnhub path (.T tickers).
//   TW — TDCC open data 集保戶股權分散表 (authentic per-tier shareholding), the
//        real 籌碼分佈 source; big tier (大戶) vs retail (散戶) by share bracket.
//
// Not wired to real free sources (premium / auth-gated / heavy XBRL-CSV parsing),
// so reported as unavailable rather than fabricated:
//   13F/13D/13G aggregation, SMH/SOXX ETF flows, FINRA short interest,
//   EDINET 大量保有報告書 XBRL, JPX 信用買い残/売り残 margin balances,
//   TWSE 法人買賣超 / 融資融券.
//
// A snapshot is persisted once per ticker per day (@@unique([symbol, reportDate]))
// so we don't re-hit upstream APIs, and the snapshot history powers the
// accumulation-trend chart.

import "server-only";
import yahooFinance from "yahoo-finance2";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "./prisma";
import type { ChipDistribution, ChipMarket, ChipTier } from "./types";

try {
  (yahooFinance as any).suppressNotices?.(["yahooSurvey"]);
} catch {
  /* ignore */
}

const FINNHUB = "https://finnhub.io/api/v1";
const FINNHUB_KEY = process.env.FINNHUB_API_KEY;

const iso = (d: Date) => d.toISOString().slice(0, 10);
const clampPct = (n: number) => Math.max(0, Math.min(100, n));

/** Midnight-UTC Date for today — the per-day snapshot key. */
function todayUtcDate(): Date {
  return new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
}

export function detectMarket(symbol: string): ChipMarket {
  const s = symbol.toUpperCase();
  if (s.endsWith(".T")) return "JP";
  if (s.endsWith(".TW") || s.endsWith(".TWO")) return "TW";
  return "US";
}

// ───────────────────────── US / JP (Yahoo + Finnhub) ─────────────────────────

/** Institutional %, insider %, and short % via Yahoo quoteSummary (best-effort). */
async function yahooChip(symbol: string): Promise<{
  institutionsPct: number | null;
  insidersPct: number | null;
  shortPct: number | null;
} | null> {
  try {
    const r: any = await yahooFinance.quoteSummary(
      symbol,
      { modules: ["majorHoldersBreakdown", "defaultKeyStatistics"] },
      { validateResult: false }
    );
    const mh = r?.majorHoldersBreakdown;
    const ks = r?.defaultKeyStatistics;
    const pct = (v: any) => (typeof v === "number" ? v * 100 : null);
    const institutionsPct = pct(mh?.institutionsPercentHeld);
    const insidersPct = pct(mh?.insidersPercentHeld);
    const shortPct = pct(ks?.shortPercentOfFloat);
    if (institutionsPct == null && insidersPct == null && shortPct == null) return null;
    return { institutionsPct, insidersPct, shortPct };
  } catch {
    return null;
  }
}

/** Net insider share flow over ~6 months (Finnhub insider-sentiment; cloud-OK). */
async function finnhubInsiderNet(symbol: string): Promise<number | null> {
  if (!FINNHUB_KEY) return null;
  try {
    const to = new Date();
    const from = new Date();
    from.setMonth(from.getMonth() - 6);
    const res = await fetch(
      `${FINNHUB}/stock/insider-sentiment?symbol=${symbol}&from=${iso(from)}&to=${iso(to)}&token=${FINNHUB_KEY}`,
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const rows: any[] = Array.isArray(data?.data) ? data.data : [];
    if (!rows.length) return null;
    return rows.reduce((s, m) => s + (Number(m.change) || 0), 0);
  } catch {
    return null;
  }
}

// ───────────────────────── Taiwan (TDCC open data) ─────────────────────────

// TDCC 集保戶股權分散表 brackets (持股分級). 大戶 (big) ≈ ≥ 400 張 (400,000 shares) →
// levels 12–15; everything below is treated as retail/散戶.
const TDCC_BIG_LEVELS = new Set([12, 13, 14, 15]);
const TDCC_LEVEL_LABEL: Record<number, string> = {
  1: "1–999",
  2: "1k–5k",
  3: "5k–10k",
  4: "10k–15k",
  5: "15k–20k",
  6: "20k–30k",
  7: "30k–40k",
  8: "40k–50k",
  9: "50k–100k",
  10: "100k–200k",
  11: "200k–400k",
  12: "400k–600k",
  13: "600k–800k",
  14: "800k–1M",
  15: "1M+ (大戶)",
};

/** TDCC per-tier distribution for a Taiwan ticker (e.g. "2330" from "2330.TW"). */
async function tdccTiers(twCode: string): Promise<{
  tiers: ChipTier[];
  bigPct: number;
  retailPct: number;
  reportDate: string | null;
} | null> {
  try {
    // Dataset 1-5: 集保戶股權分散表 (latest week, all listed stocks). This CSV is
    // multi-MB, which exceeds Next's 2MB fetch-cache limit, so skip that cache
    // (the per-day DB snapshot is our real cache) with no-store.
    const res = await fetch("https://opendata.tdcc.com.tw/getOD.ashx?id=1-5", {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const text = await res.text();
    const lines = text.split(/\r?\n/);
    // columns: 資料日期,證券代號,持股分級,人數,股數,占集保庫存數比例%
    // TDCC pads the security-code column with trailing spaces ("2330  "), so trim.
    const rows = lines
      .map((l) => l.split(","))
      .filter((c) => c.length >= 6 && (c[1] || "").trim() === twCode);
    if (!rows.length) return null;

    const reportDate = rows[0][0]?.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3") ?? null;
    const tiers: ChipTier[] = [];
    let bigPct = 0;
    let retailPct = 0;
    for (const c of rows) {
      const level = Number(c[2]);
      const pct = Number(c[5]);
      if (!Number.isFinite(level) || !Number.isFinite(pct)) continue;
      if (level >= 16) continue; // 16 = 差異數調整, 17 = 合計
      const group: ChipTier["group"] = TDCC_BIG_LEVELS.has(level) ? "big" : "retail";
      tiers.push({ label: TDCC_LEVEL_LABEL[level] ?? `L${level}`, pct, group });
      if (group === "big") bigPct += pct;
      else retailPct += pct;
    }
    if (!tiers.length) return null;
    return { tiers, bigPct: clampPct(bigPct), retailPct: clampPct(retailPct), reportDate };
  } catch {
    return null;
  }
}

// ───────────────────────── AI interpretation (Claude) ─────────────────────────

async function interpret(d: {
  symbol: string;
  market: ChipMarket;
  bigHolderPct: number | null;
  retailHolderPct: number | null;
  insiderNetShares: number | null;
  marginRatio: number | null;
  trendDelta: number | null; // change in bigHolderPct vs prior snapshot
}): Promise<ChipDistribution["ai"]> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const client = new Anthropic();
    const resp = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 512,
      system: [
        {
          type: "text",
          text: "You are a 籌碼面 (chip distribution / smart-money flow) analyst. Given a stock's ownership-tier split, insider net flow, short/margin ratio, and the change in big-holder % versus the prior reporting period, judge whether smart money (institutions / big holders) is Accumulating, Holding, or Distributing into retail buying. Be concise and specific; base it only on the provided numbers and say when a signal is missing.",
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Symbol: ${d.symbol} (${d.market})
Big holders / smart money: ${d.bigHolderPct == null ? "unknown" : d.bigHolderPct.toFixed(1) + "%"}
Retail / small holders: ${d.retailHolderPct == null ? "unknown" : d.retailHolderPct.toFixed(1) + "%"}
Net insider shares (6mo): ${d.insiderNetShares == null ? "unknown" : d.insiderNetShares}
Short interest / margin ratio: ${d.marginRatio == null ? "unknown" : d.marginRatio}
Change in big-holder % vs prior period: ${d.trendDelta == null ? "unknown" : (d.trendDelta >= 0 ? "+" : "") + d.trendDelta.toFixed(2) + " pts"}

Classify the smart-money stance and explain in 2-3 sentences.`,
        },
      ],
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              stance: { type: "string", enum: ["Accumulating", "Holding", "Distributing"] },
              interpretation: { type: "string" },
            },
            required: ["stance", "interpretation"],
          },
        },
      },
    } as any);
    const text = resp.content.find((b: any) => b.type === "text") as { text?: string } | undefined;
    if (!text?.text) return null;
    return JSON.parse(text.text);
  } catch {
    return null;
  }
}

// ───────────────────────── Orchestration ─────────────────────────

const UNAVAILABLE_NOTES: Record<ChipMarket, string[]> = {
  US: [
    "13F/13D/13G aggregation, FINRA short interest, and SMH/SOXX ETF flows are not wired to a free per-ticker source.",
  ],
  JP: [
    "EDINET 大量保有報告書 (XBRL) and JPX 信用買い残/売り残 margin balances are not wired to a free per-ticker source.",
  ],
  TW: ["TWSE 法人買賣超 and 融資/融券 (信用倍率) are not wired to a free source."],
};

async function buildHistory(symbol: string): Promise<ChipDistribution["history"]> {
  const rows = await prisma.chipDistributionSnapshot.findMany({
    where: { symbol },
    orderBy: { reportDate: "asc" },
    take: 24,
  });
  return rows.map((r) => ({ date: iso(r.reportDate), bigHolderPct: r.bigHolderPct }));
}

export async function getChipDistribution(
  symbol: string,
  opts: { refresh?: boolean } = {}
): Promise<ChipDistribution> {
  const sym = symbol.toUpperCase();
  const market = detectMarket(sym);
  const reportDate = todayUtcDate();

  // 24h cache: reuse today's snapshot unless a refresh is requested.
  if (!opts.refresh) {
    const cached = await prisma.chipDistributionSnapshot.findUnique({
      where: { symbol_reportDate: { symbol: sym, reportDate } },
    });
    if (cached) {
      const raw = (cached.rawTierData as any) ?? {};
      return {
        symbol: sym,
        market: cached.market as ChipMarket,
        available: true,
        reportDate: iso(cached.reportDate),
        bigHolderPct: cached.bigHolderPct,
        retailHolderPct: cached.retailHolderPct,
        insiderNetShares: cached.insiderNetShares,
        marginRatio: cached.marginRatio,
        institutionalNetFlow: cached.institutionalNetFlow,
        tiers: raw.tiers ?? [],
        history: await buildHistory(sym),
        ai: raw.ai ?? null,
        notes: raw.notes ?? UNAVAILABLE_NOTES[cached.market as ChipMarket] ?? [],
        sources: raw.sources ?? [],
      };
    }
  }

  // ── Gather fresh data per market ──
  let bigHolderPct: number | null = null;
  let retailHolderPct: number | null = null;
  let insiderNetShares: number | null = null;
  let marginRatio: number | null = null;
  const institutionalNetFlow: number | null = null;
  let tiers: ChipTier[] = [];
  const sources: string[] = [];
  const notes = [...(UNAVAILABLE_NOTES[market] ?? [])];
  let tdccReportDate: string | null = null;

  if (market === "TW") {
    const twCode = sym.replace(/\.(TW|TWO)$/i, "");
    const tdcc = await tdccTiers(twCode);
    if (tdcc) {
      tiers = tdcc.tiers;
      bigHolderPct = tdcc.bigPct;
      retailHolderPct = tdcc.retailPct;
      tdccReportDate = tdcc.reportDate;
      sources.push("TDCC 集保戶股權分散表");
    } else {
      notes.push("TDCC distribution not found for this ticker.");
    }
  } else {
    const [yahoo, insiderNet] = await Promise.all([yahooChip(sym), finnhubInsiderNet(sym)]);
    if (yahoo) {
      const inst = yahoo.institutionsPct;
      const ins = yahoo.insidersPct ?? 0;
      if (inst != null) {
        bigHolderPct = clampPct(inst);
        retailHolderPct = clampPct(100 - inst - ins);
        tiers = [
          { label: "Institutions", pct: clampPct(inst), group: "big" },
          { label: "Insiders", pct: clampPct(ins), group: "big" },
          { label: "Retail / other", pct: clampPct(100 - inst - ins), group: "retail" },
        ];
      }
      if (yahoo.shortPct != null) marginRatio = yahoo.shortPct;
      sources.push("Yahoo Finance (institutional/short)");
    } else {
      notes.push("Institutional % and short interest unavailable (Yahoo rate-limited or no coverage).");
    }
    if (insiderNet != null) {
      insiderNetShares = insiderNet;
      sources.push("Finnhub insider sentiment");
    }
  }

  const available = bigHolderPct != null || tiers.length > 0 || insiderNetShares != null;
  if (!available) {
    return {
      symbol: sym,
      market,
      available: false,
      reportDate: null,
      bigHolderPct: null,
      retailHolderPct: null,
      insiderNetShares: null,
      marginRatio: null,
      institutionalNetFlow: null,
      tiers: [],
      history: await buildHistory(sym),
      ai: null,
      notes,
      sources,
    };
  }

  // Trend delta vs the most recent prior snapshot (for the AI stance).
  const prior = await prisma.chipDistributionSnapshot.findFirst({
    where: { symbol: sym, reportDate: { lt: reportDate } },
    orderBy: { reportDate: "desc" },
  });
  const trendDelta =
    prior && bigHolderPct != null ? bigHolderPct - prior.bigHolderPct : null;

  const ai = await interpret({
    symbol: sym,
    market,
    bigHolderPct,
    retailHolderPct,
    insiderNetShares,
    marginRatio,
    trendDelta,
  });

  const raw = { tiers, ai, notes, sources };
  const saved = await prisma.chipDistributionSnapshot.upsert({
    where: { symbol_reportDate: { symbol: sym, reportDate } },
    update: {
      market,
      bigHolderPct: bigHolderPct ?? 0,
      retailHolderPct: retailHolderPct ?? 0,
      insiderNetShares: insiderNetShares ?? 0,
      marginRatio,
      institutionalNetFlow,
      rawTierData: raw as any,
    },
    create: {
      symbol: sym,
      market,
      reportDate,
      bigHolderPct: bigHolderPct ?? 0,
      retailHolderPct: retailHolderPct ?? 0,
      insiderNetShares: insiderNetShares ?? 0,
      marginRatio,
      institutionalNetFlow,
      rawTierData: raw as any,
    },
  });

  return {
    symbol: sym,
    market,
    available: true,
    reportDate: tdccReportDate ?? iso(saved.reportDate),
    bigHolderPct,
    retailHolderPct,
    insiderNetShares,
    marginRatio,
    institutionalNetFlow,
    tiers,
    history: await buildHistory(sym),
    ai,
    notes,
    sources,
  };
}

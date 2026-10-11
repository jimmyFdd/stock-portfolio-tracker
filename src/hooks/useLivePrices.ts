"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Quote } from "@/lib/types";

const POLL_MS = Number(process.env.NEXT_PUBLIC_PRICE_POLL_MS) || 15000;

interface LivePrices {
  quotes: Record<string, Quote>;
  lastUpdated: number | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Polls /api/quote for the given symbols on an interval.
 *
 * Polling (rather than a raw WebSocket) is the default because it works on the
 * Finnhub free tier and behind serverless functions. The server route caches
 * upstream responses briefly, so many clients share the same fan-out. To use
 * Finnhub's WebSocket instead, stream wss://ws.finnhub.io?token=... from a
 * dedicated client component and merge messages into this same shape.
 */
export function useLivePrices(symbols: string[]): LivePrices {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stable key so the effect only re-subscribes when the symbol set changes.
  const key = [...symbols].map((s) => s.toUpperCase()).sort().join(",");

  const fetchQuotes = useCallback(async () => {
    if (!key) {
      setQuotes({});
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/quote?symbols=${encodeURIComponent(key)}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load prices");
      const next: Record<string, Quote> = {};
      for (const q of data.quotes as Quote[]) next[q.symbol] = q;
      setQuotes(next);
      setLastUpdated(Date.now());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load prices");
    } finally {
      setLoading(false);
    }
  }, [key]);

  const savedFetch = useRef(fetchQuotes);
  savedFetch.current = fetchQuotes;

  useEffect(() => {
    savedFetch.current();
    if (!key) return;
    const id = setInterval(() => savedFetch.current(), POLL_MS);
    // Pause polling when the tab is hidden to save free-tier calls.
    const onVisibility = () => {
      if (document.visibilityState === "visible") savedFetch.current();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [key]);

  return { quotes, lastUpdated, loading, error, refresh: () => savedFetch.current() };
}

"use client";

import { useEffect, useRef, useState } from "react";
import { usePortfolio } from "./PortfolioProvider";
import type { SymbolMatch } from "@/lib/types";

export default function AddStockForm() {
  const { addHolding } = usePortfolio();
  const [symbol, setSymbol] = useState("");
  const [shares, setShares] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [matches, setMatches] = useState<SymbolMatch[]>([]);
  const [showMatches, setShowMatches] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounced symbol search for the autocomplete dropdown.
  useEffect(() => {
    const q = symbol.trim();
    if (q.length < 1) {
      setMatches([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: ctrl.signal,
        });
        const data = await res.json();
        if (res.ok) setMatches(data.matches ?? []);
      } catch {
        /* aborted or offline — ignore */
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [symbol]);

  // Close the dropdown on outside click.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setShowMatches(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const sym = symbol.trim().toUpperCase();
    const sh = Number(shares);
    const bp = Number(buyPrice);
    if (!sym) return setError("Enter a ticker symbol.");
    if (!Number.isFinite(sh) || sh <= 0) return setError("Shares must be a positive number.");
    if (!Number.isFinite(bp) || bp < 0) return setError("Buy price must be zero or more.");
    addHolding({ symbol: sym, shares: sh, buyPrice: bp });
    setSymbol("");
    setShares("");
    setBuyPrice("");
    setMatches([]);
    setShowMatches(false);
  };

  return (
    <form onSubmit={submit} className="rounded-xl border border-surface-border bg-surface-card p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
        Add position
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.4fr_1fr_1fr_auto]">
        <div className="relative" ref={boxRef}>
          <input
            aria-label="Ticker symbol"
            value={symbol}
            onChange={(e) => {
              setSymbol(e.target.value.toUpperCase());
              setShowMatches(true);
            }}
            onFocus={() => setShowMatches(true)}
            placeholder="Ticker (e.g. AAPL)"
            className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-brand"
            autoComplete="off"
          />
          {showMatches && matches.length > 0 && (
            <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-surface-border bg-surface-card shadow-xl">
              {matches.map((m) => (
                <li key={m.symbol}>
                  <button
                    type="button"
                    onClick={() => {
                      setSymbol(m.symbol);
                      setShowMatches(false);
                    }}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-surface"
                  >
                    <span className="font-semibold text-white">{m.symbol}</span>
                    <span className="truncate text-xs text-slate-400">{m.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <input
          aria-label="Number of shares"
          value={shares}
          onChange={(e) => setShares(e.target.value)}
          type="number"
          min="0"
          step="any"
          placeholder="Shares"
          className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-brand"
        />
        <input
          aria-label="Buy price per share"
          value={buyPrice}
          onChange={(e) => setBuyPrice(e.target.value)}
          type="number"
          min="0"
          step="any"
          placeholder="Buy price"
          className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-brand"
        />
        <button
          type="submit"
          className="rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
        >
          Add
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-loss">{error}</p>}
    </form>
  );
}

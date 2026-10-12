"use client";

import { useState } from "react";
import OwnershipPanel from "./OwnershipPanel";

/**
 * Collapsible "Institutional & Insiders" accordion — one row per portfolio
 * ticker. The ownership data for a ticker is fetched lazily only when its row
 * is expanded, so opening the Micro view doesn't fan out a request per holding.
 */
export default function OwnershipSection({ symbols }: { symbols: string[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const tickers = [...new Set(symbols)];

  if (tickers.length === 0) return null;

  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-surface-border bg-surface-card">
      <div className="border-b border-surface-border px-4 py-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Institutional &amp; Insiders
        </h3>
        <p className="text-xs text-slate-500">
          Ownership and insider buying/selling for your tickers — tap to expand.
        </p>
      </div>
      <ul>
        {tickers.map((sym) => {
          const isOpen = open === sym;
          return (
            <li key={sym} className="border-b border-surface-border/60 last:border-0">
              <button
                onClick={() => setOpen(isOpen ? null : sym)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-surface/40"
              >
                <span className="font-semibold text-white">{sym}</span>
                <span
                  className={`text-slate-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
                >
                  ▾
                </span>
              </button>
              {isOpen && <OwnershipPanel symbol={sym} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

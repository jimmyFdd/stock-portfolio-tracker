"use client";

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";
import type { Holding } from "@/lib/types";

interface PortfolioContextValue {
  holdings: Holding[];
  hydrated: boolean; // true once the initial DB fetch has resolved
  error: string | null;
  addHolding: (input: { symbol: string; shares: number; buyPrice: number }) => Promise<void>;
  removeHolding: (id: string) => Promise<void>;
  updateHolding: (id: string, patch: Partial<Omit<Holding, "id">>) => Promise<void>;
  symbols: string[];
}

const PortfolioContext = createContext<PortfolioContextValue | null>(null);

/**
 * Holds the signed-in user's positions, backed by the database via /api/positions.
 * (Previously this used localStorage; now every mutation round-trips to Postgres
 * so the portfolio follows the user across devices.)
 */
export function PortfolioProvider({ children }: { children: ReactNode }) {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initial load from the database.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/positions", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (active) setHoldings(data.positions ?? []);
        } else if (res.status !== 401) {
          const data = await res.json().catch(() => ({}));
          if (active) setError(data?.error || "Failed to load portfolio");
        }
      } catch {
        if (active) setError("Failed to load portfolio");
      } finally {
        if (active) setHydrated(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const addHolding = useCallback(
    async (input: { symbol: string; shares: number; buyPrice: number }) => {
      setError(null);
      const res = await fetch("/api/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Failed to add position");
        return;
      }
      setHoldings(data.positions ?? []);
    },
    []
  );

  const removeHolding = useCallback(async (id: string) => {
    setError(null);
    // Optimistic removal; reconcile with the server response.
    const prev = holdings;
    setHoldings((h) => h.filter((x) => x.id !== id));
    const res = await fetch(`/api/positions/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setHoldings(prev); // roll back on failure
      const data = await res.json().catch(() => ({}));
      setError(data?.error || "Failed to remove position");
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (data.positions) setHoldings(data.positions);
  }, [holdings]);

  const updateHolding = useCallback(
    async (id: string, patch: Partial<Omit<Holding, "id">>) => {
      setError(null);
      const res = await fetch(`/api/positions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Failed to update position");
        return;
      }
      setHoldings(data.positions ?? []);
    },
    []
  );

  const symbols = useMemo(() => holdings.map((h) => h.symbol), [holdings]);

  const value = useMemo(
    () => ({ holdings, hydrated, error, addHolding, removeHolding, updateHolding, symbols }),
    [holdings, hydrated, error, addHolding, removeHolding, updateHolding, symbols]
  );

  return <PortfolioContext.Provider value={value}>{children}</PortfolioContext.Provider>;
}

export function usePortfolio() {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error("usePortfolio must be used within <PortfolioProvider>");
  return ctx;
}

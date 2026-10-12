// Small formatting helpers shared by the UI components.

export const usd = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);

export const compactUsd = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number.isFinite(n) ? n : 0);

/** Format an amount in its native currency (e.g. ¥4,058 for JPY, £12.30 for GBP). */
export const nativeMoney = (n: number, currency: string) => {
  const value = Number.isFinite(n) ? n : 0;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: currency === "JPY" ? 0 : 2,
    }).format(value);
  } catch {
    // Unknown/invalid currency code — fall back to a plain suffix.
    return `${value.toLocaleString("en-US")} ${currency}`;
  }
};

export const pct = (n: number) => `${n >= 0 ? "+" : ""}${(Number.isFinite(n) ? n : 0).toFixed(2)}%`;

export const signedUsd = (n: number) => `${n >= 0 ? "+" : "-"}${usd(Math.abs(n)).replace("-", "")}`;

export const relativeTime = (unixSeconds: number) => {
  const diff = Date.now() / 1000 - unixSeconds;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

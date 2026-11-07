/** Formats a share count with up to four decimals. */
export function formatShares(qty: number): string {
  return qty.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

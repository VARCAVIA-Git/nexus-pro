// ═══════════════════════════════════════════════════════════════
// Number formatting — always en-US to avoid hydration mismatches
// ═══════════════════════════════════════════════════════════════

const fmtUsd = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const fmtPct = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Format as USD: $1,234.56 */
export function fmtDollar(n: number): string {
  return `$${fmtUsd.format(n)}`;
}

/** Format as USD with sign: +$1,234.56 or -$1,234.56 */
export function fmtPnl(n: number): string {
  return `${n >= 0 ? '+' : ''}$${fmtUsd.format(n)}`;
}

/** Format integer with commas: 1,234 */
export function fmtNumber(n: number): string {
  return fmtInt.format(n);
}

/** Format percentage: 67.3% */
export function fmtPercent(n: number): string {
  return `${fmtPct.format(n)}%`;
}

/** Format percentage with sign: +2.34% */
export function fmtPctChange(n: number): string {
  return `${n >= 0 ? '+' : ''}${fmtPct.format(n)}%`;
}

/** Format price — auto-detect decimal places based on magnitude */
export function fmtPrice(n: number): string {
  if (n >= 1000) return `$${fmtInt.format(n)}`;
  if (n >= 1) return `$${fmtUsd.format(n)}`;
  return `$${new Intl.NumberFormat('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(n)}`;
}

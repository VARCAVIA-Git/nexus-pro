#!/usr/bin/env python3
"""Descriptive statistics on funding rates.

For each asset:
  - Mean / median 8h funding rate
  - Implied APR (annualized = rate * 3 * 365)
  - % positive / % negative / |rate| > 0.01% events
  - Autocorrelation lag 1, 3, 9 (persistence)
  - Cross-asset correlation matrix
  - Histogram bucket counts

A positive funding rate means longs PAY shorts. Carry trade:
  - Short perp + Long spot when expected APR > cost threshold
  - Capture funding as yield, hedge price exposure delta-neutral
"""
from __future__ import annotations
import csv
import statistics
from pathlib import Path

DATA = Path(__file__).parent / "data"
ASSETS = ["BTC", "ETH", "SOL", "BNB", "XRP", "ADA"]
FUNDING_PER_DAY = 3  # 8h cadence => 3/day


def load(symbol: str) -> list[tuple[int, float]]:
    """Returns list of (ts_ms, rate_decimal). rate=0.0001 means 0.01% per 8h."""
    rows = []
    with (DATA / f"funding_{symbol}.csv").open() as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append((int(r["ts"]), float(r["funding_rate"])))
    rows.sort()
    return rows


def stats_for(symbol: str, rows: list[tuple[int, float]]) -> dict:
    rates = [r for _, r in rows]
    n = len(rates)
    if n == 0:
        return {"symbol": symbol, "n": 0}
    pos = [r for r in rates if r > 0]
    neg = [r for r in rates if r < 0]
    big_pos = [r for r in rates if r >= 0.0001]   # >= 1 bp per 8h
    big_neg = [r for r in rates if r <= -0.0001]  # <= -1 bp per 8h

    mean = statistics.mean(rates)
    median = statistics.median(rates)
    stdev = statistics.stdev(rates) if n > 1 else 0.0
    p10, p25, p75, p90 = (
        statistics.quantiles(rates, n=10)[0],
        statistics.quantiles(rates, n=4)[0],
        statistics.quantiles(rates, n=4)[2],
        statistics.quantiles(rates, n=10)[8],
    )

    # Implied annualized APR if you collect this rate every 8h continuously.
    # rate * 3 funding/day * 365 days. (Approximation; ignores compounding.)
    apr_mean = mean * FUNDING_PER_DAY * 365
    apr_median = median * FUNDING_PER_DAY * 365

    # Sum of all observed funding over the window (what you'd have earned
    # going short-perp 100% of the window with delta-neutral hedge).
    total_collected_pct = sum(rates) * 100  # as % of notional

    # Autocorrelation at lag k
    def autocorr(k: int) -> float:
        if n <= k:
            return 0.0
        m = statistics.mean(rates)
        num = sum((rates[i] - m) * (rates[i + k] - m) for i in range(n - k))
        den = sum((r - m) ** 2 for r in rates)
        return num / den if den else 0.0

    return {
        "symbol": symbol,
        "n": n,
        "days": n / FUNDING_PER_DAY,
        "mean_8h_bps": mean * 10000,
        "median_8h_bps": median * 10000,
        "stdev_8h_bps": stdev * 10000,
        "p10_8h_bps": p10 * 10000,
        "p90_8h_bps": p90 * 10000,
        "apr_mean_pct": apr_mean * 100,
        "apr_median_pct": apr_median * 100,
        "pct_positive": 100 * len(pos) / n,
        "pct_negative": 100 * len(neg) / n,
        "pct_big_pos": 100 * len(big_pos) / n,
        "pct_big_neg": 100 * len(big_neg) / n,
        "total_collected_pct": total_collected_pct,
        "autocorr_lag1": autocorr(1),
        "autocorr_lag3": autocorr(3),   # ~1 day
        "autocorr_lag9": autocorr(9),   # ~3 days
        "autocorr_lag21": autocorr(21), # ~1 week
    }


def correlation_matrix(by_asset: dict[str, list[tuple[int, float]]]) -> dict:
    # Align by timestamp (intersection)
    ts_sets = [{ts for ts, _ in rows} for rows in by_asset.values()]
    common = set.intersection(*ts_sets) if ts_sets else set()
    common_sorted = sorted(common)

    series: dict[str, list[float]] = {}
    for sym, rows in by_asset.items():
        m = {ts: r for ts, r in rows}
        series[sym] = [m[ts] for ts in common_sorted]

    syms = list(series.keys())
    matrix = {}
    for a in syms:
        matrix[a] = {}
        for b in syms:
            xa, xb = series[a], series[b]
            ma, mb = sum(xa) / len(xa), sum(xb) / len(xb)
            num = sum((xa[i] - ma) * (xb[i] - mb) for i in range(len(xa)))
            denA = (sum((v - ma) ** 2 for v in xa)) ** 0.5
            denB = (sum((v - mb) ** 2 for v in xb)) ** 0.5
            matrix[a][b] = (num / (denA * denB)) if denA and denB else 0.0
    return {"symbols": syms, "n_common": len(common_sorted), "corr": matrix}


def fmt_row(s: dict) -> str:
    return (
        f"{s['symbol']:4s} | n={s['n']:4d} ({s['days']:.0f}d) | "
        f"μ_8h={s['mean_8h_bps']:+6.3f}bps  med={s['median_8h_bps']:+6.3f}  σ={s['stdev_8h_bps']:.3f} | "
        f"APR μ={s['apr_mean_pct']:+5.2f}%  med={s['apr_median_pct']:+5.2f}% | "
        f"pos={s['pct_positive']:.0f}% neg={s['pct_negative']:.0f}% | "
        f"AC1={s['autocorr_lag1']:+.3f} AC9={s['autocorr_lag9']:+.3f} | "
        f"Σ={s['total_collected_pct']:+5.2f}%"
    )


def main() -> None:
    by_asset: dict[str, list[tuple[int, float]]] = {}
    print("=== Per-asset funding stats ===\n")
    all_stats: list[dict] = []
    for sym in ASSETS:
        rows = load(sym)
        by_asset[sym] = rows
        s = stats_for(sym, rows)
        all_stats.append(s)
        if s["n"]:
            print(fmt_row(s))

    print("\n=== Cross-asset correlation matrix ===")
    cm = correlation_matrix(by_asset)
    print(f"common timestamps: {cm['n_common']}")
    print("       " + "  ".join(f"{s:>5}" for s in cm["symbols"]))
    for a in cm["symbols"]:
        print(f"  {a:4s} " + "  ".join(f"{cm['corr'][a][b]:+.2f}" for b in cm["symbols"]))

    print("\n=== Interpretation ===")
    n_avg = sum(s["n"] for s in all_stats) / max(1, len(all_stats))
    apr_avg = statistics.mean(s["apr_mean_pct"] for s in all_stats if s["n"])
    print(f"Avg APR across {len(ASSETS)} assets: {apr_avg:+.2f}% (gross, before costs/slippage/funding-vol risk)")
    print(f"Sample window: ~{n_avg/FUNDING_PER_DAY:.0f} days. Significance: LOW for trend assertions, OK for descriptive.")

    # Save summary as JSON for downstream backtest
    import json
    out = Path(__file__).parent / "analysis" / "summary.json"
    out.parent.mkdir(exist_ok=True)
    json.dump({"per_asset": all_stats, "correlation": cm}, out.open("w"), indent=2)
    print(f"\nSaved: {out.relative_to(Path(__file__).parent.parent.parent)}")


if __name__ == "__main__":
    main()

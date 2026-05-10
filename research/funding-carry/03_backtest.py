#!/usr/bin/env python3
"""Backtest delta-neutral funding carry — realistic strategies.

Three flavors compared:
  1. ALWAYS_ON: enter once at start, hold forever. Captures full mean APR
     but pays full DD on funding-rate adverse swings.
  2. REGIME: enter when N-period EMA funding > threshold, exit when
     EMA < exit_threshold. Lower DD, fewer trades.
  3. ENTRY_ONLY: hold short while rate>0, flat while rate≤0 (high turnover).
     Included as baseline to demonstrate cost-of-flip problem.

Costs:
  - Entry: 1× round trip = perp_taker(0.05%) + spot_taker(0.10%) + spread(0.05%) = 20 bps
  - Exit:  same = 20 bps
  - Per-flip total: 40 bps
"""
from __future__ import annotations
import csv
import json
import statistics
from pathlib import Path

DATA = Path(__file__).parent / "data"
OUT = Path(__file__).parent / "analysis"
OUT.mkdir(exist_ok=True)
ASSETS = ["BTC", "ETH", "SOL", "BNB", "XRP", "ADA"]
FLIP_COST_BPS = 40
PERIODS_PER_DAY = 3


def load(sym: str) -> list[float]:
    rows = []
    with (DATA / f"funding_{sym}.csv").open() as f:
        for r in csv.DictReader(f):
            rows.append((int(r["ts"]), float(r["funding_rate"])))
    rows.sort()
    return [r for _, r in rows]


def stats(equity_bps: list[float], trades: int, days: float) -> dict:
    n = len(equity_bps)
    if n < 2 or days <= 0:
        return {"apr_pct": 0, "max_dd_pct": 0, "sharpe": 0, "trades": trades}
    final = equity_bps[-1]
    peak = 0.0
    max_dd = 0.0
    for e in equity_bps:
        if e > peak: peak = e
        dd = peak - e
        if dd > max_dd: max_dd = dd
    apr = final * 365 / days / 100
    # daily PnL for Sharpe
    daily = []
    for i in range(PERIODS_PER_DAY, n, PERIODS_PER_DAY):
        daily.append(equity_bps[i] - equity_bps[i - PERIODS_PER_DAY])
    if len(daily) >= 2:
        mu = statistics.mean(daily)
        sd = statistics.stdev(daily)
        sharpe = (mu / sd) * (365 ** 0.5) if sd > 0 else 0
    else:
        sharpe = 0
    return {"apr_pct": apr, "max_dd_pct": max_dd / 100, "sharpe": sharpe,
            "trades": trades, "final_pct": final / 100,
            "calmar": apr / (max_dd / 100) if max_dd > 0 else 0}


def always_on(rates: list[float], side: str = "short") -> dict:
    sign = +1 if side == "short" else -1
    eq = -FLIP_COST_BPS  # pay once on entry
    series = [eq]
    for r in rates[1:]:
        eq += sign * r * 10000
        series.append(eq)
    eq -= FLIP_COST_BPS  # pay once on exit (mark to market)
    series[-1] = eq
    days = (len(rates) - 1) / PERIODS_PER_DAY
    return {**stats(series, 1, days), "name": "always_on"}


def regime(rates: list[float], ema_n: int = 3, enter_bps: float = 1.0,
           exit_bps: float = -1.0, side: str = "short") -> dict:
    """EMA-based regime filter. side='short' captures positive funding."""
    sign = +1 if side == "short" else -1
    ema = 0.0
    alpha = 2 / (ema_n + 1)
    in_pos = False
    eq = 0.0
    series = [eq]
    trades = 0
    for i, r in enumerate(rates):
        ema = alpha * r + (1 - alpha) * ema if i > 0 else r
        if side == "short":
            should_enter = ema * 10000 > enter_bps
            should_exit  = ema * 10000 < exit_bps
        else:
            should_enter = ema * 10000 < -enter_bps
            should_exit  = ema * 10000 > -exit_bps
        if not in_pos and should_enter:
            eq -= FLIP_COST_BPS
            in_pos = True
            trades += 1
        elif in_pos and should_exit:
            eq -= FLIP_COST_BPS
            in_pos = False
        if in_pos and i > 0:
            eq += sign * r * 10000
        series.append(eq)
    days = (len(rates) - 1) / PERIODS_PER_DAY
    return {**stats(series, trades, days), "name": f"regime(ema={ema_n},in={enter_bps},out={exit_bps})"}


def best_regime_grid(rates: list[float], side: str) -> dict:
    """Tiny grid search over regime parameters."""
    best = None
    for ema_n in [3, 6, 9, 18]:
        for enter in [0.5, 1.0, 2.0, 3.0]:
            for exit_th in [-0.5, -1.0, -2.0]:
                r = regime(rates, ema_n, enter, exit_th, side=side)
                if best is None or r["sharpe"] > best["sharpe"]:
                    best = r
    return best or {}


def portfolio_always_on(by_asset: dict[str, list[float]], weights: dict[str, float]) -> dict:
    """Weighted always-on portfolio."""
    n = min(len(rs) for rs in by_asset.values())
    eq = -FLIP_COST_BPS  # entry costs (assume simultaneous)
    series = [eq]
    for i in range(1, n):
        period_pnl = 0.0
        for sym, w in weights.items():
            sign = -1 if sym == "SOL" else +1  # SOL avg funding < 0
            period_pnl += w * sign * by_asset[sym][i] * 10000
        eq += period_pnl
        series.append(eq)
    eq -= FLIP_COST_BPS
    series[-1] = eq
    days = (n - 1) / PERIODS_PER_DAY
    return {**stats(series, 1, days), "name": "portfolio_always_on"}


def main() -> None:
    by_asset = {sym: load(sym) for sym in ASSETS}

    print("=" * 90)
    print("PER-ASSET — ALWAYS-ON vs BEST REGIME (grid search)")
    print("=" * 90)
    print(f"Flip cost: {FLIP_COST_BPS} bps per entry+exit. ~93 days of data.\n")
    print(f"  {'Asset':5s} | {'Strategy':40s} | {'APR%':>7} | {'MaxDD%':>7} | {'Sharpe':>6} | {'Calmar':>6} | trades")
    print("-" * 90)
    results = {}
    for sym in ASSETS:
        rates = by_asset[sym]
        side = "long" if sym == "SOL" else "short"
        ao = always_on(rates, side=side)
        br = best_regime_grid(rates, side=side)
        results[sym] = {"always_on": ao, "best_regime": br}
        for name, r in [("always_on", ao), ("best_regime", br)]:
            label = r.get("name", name)
            print(f"  {sym:5s} | {label:40s} | "
                  f"{r['apr_pct']:>+6.2f} | "
                  f"{r['max_dd_pct']:>+6.2f} | "
                  f"{r['sharpe']:>+5.2f} | "
                  f"{r['calmar']:>+5.2f} | "
                  f"{r['trades']}")

    print()
    print("=" * 90)
    print("PORTFOLIO ALWAYS-ON — all 6 assets, equal weight")
    print("=" * 90)
    weights = {s: 1.0 / len(ASSETS) for s in ASSETS}
    pf = portfolio_always_on(by_asset, weights)
    print(f"APR={pf['apr_pct']:+.2f}%  MaxDD={pf['max_dd_pct']:+.2f}%  Sharpe={pf['sharpe']:+.2f}  Calmar={pf['calmar']:+.2f}")

    print()
    print("=" * 90)
    print("PORTFOLIO ALWAYS-ON — best 3 assets (BNB, ETH, ADA — highest mean APR positive)")
    print("=" * 90)
    weights3 = {"BNB": 1/3, "ETH": 1/3, "ADA": 1/3}
    pf3 = portfolio_always_on({s: by_asset[s] for s in weights3}, weights3)
    print(f"APR={pf3['apr_pct']:+.2f}%  MaxDD={pf3['max_dd_pct']:+.2f}%  Sharpe={pf3['sharpe']:+.2f}  Calmar={pf3['calmar']:+.2f}")

    summary = {"per_asset": results, "portfolio_all6": pf, "portfolio_best3": pf3}
    json.dump(summary, (OUT / "backtest_realistic.json").open("w"), indent=2)
    print("\nSaved: analysis/backtest_realistic.json")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Cross-exchange spot arbitrage scanner.

Fetches BBO (best bid/ask) for top crypto pairs from OKX, Bybit, Kraken
and computes the gross spread between exchanges. Reports only spreads
that exceed estimated round-trip cost.

Geo-friendly endpoints (Binance fapi blocked from EU on some IPs).

Cost model:
  - Taker fee OKX: 0.10%, Bybit: 0.10%, Kraken: 0.26%
  - Withdraw fees (if cross-exchange settle): ~0.01-0.1% depending on chain
  - Slippage on actual fill: ~0.05% per side
  - Round-trip realistic cost: 30-60 bps

A real arb requires either:
  (a) holding inventory on both venues (instant in/out, no transfer time)
  (b) fast bridge between venues (Binance Pay, FTX-like) — mostly gone
Otherwise, latency arb is dominated by HFT pros.
"""
from __future__ import annotations
import json
import urllib.request
import urllib.parse
from datetime import datetime, timezone

PAIRS = ["BTC", "ETH", "SOL", "BNB", "XRP", "ADA"]

# Per-exchange best-bid/best-ask getters
def okx_ticker(asset: str) -> dict | None:
    inst = f"{asset}-USDT"
    url = f"https://www.okx.com/api/v5/market/ticker?instId={inst}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 research/arb"})
        with urllib.request.urlopen(req, timeout=5) as r:
            d = json.loads(r.read())
        if d.get("code") != "0" or not d.get("data"):
            return None
        t = d["data"][0]
        return {"bid": float(t["bidPx"]), "ask": float(t["askPx"]), "mid": (float(t["bidPx"]) + float(t["askPx"])) / 2}
    except Exception:
        return None

def bybit_ticker(asset: str) -> dict | None:
    sym = f"{asset}USDT"
    url = f"https://api.bybit.com/v5/market/tickers?category=spot&symbol={sym}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 research/arb"})
        with urllib.request.urlopen(req, timeout=5) as r:
            d = json.loads(r.read())
        lst = d.get("result", {}).get("list", [])
        if not lst:
            return None
        t = lst[0]
        return {"bid": float(t["bid1Price"]), "ask": float(t["ask1Price"]), "mid": (float(t["bid1Price"]) + float(t["ask1Price"])) / 2}
    except Exception:
        return None

def kraken_ticker(asset: str) -> dict | None:
    # Kraken uses XBT for BTC, sometimes different prefixes
    sym_map = {"BTC": "XBTUSDT", "ETH": "ETHUSDT", "SOL": "SOLUSDT", "BNB": None, "XRP": "XRPUSDT", "ADA": "ADAUSDT"}
    sym = sym_map.get(asset)
    if not sym:
        return None
    url = f"https://api.kraken.com/0/public/Ticker?pair={sym}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 research/arb"})
        with urllib.request.urlopen(req, timeout=5) as r:
            d = json.loads(r.read())
        result = d.get("result", {})
        if not result:
            return None
        # Kraken returns first key as the actual pair name
        first = next(iter(result.values()))
        return {"bid": float(first["b"][0]), "ask": float(first["a"][0]), "mid": (float(first["b"][0]) + float(first["a"][0])) / 2}
    except Exception:
        return None

VENUES = [("OKX", okx_ticker), ("Bybit", bybit_ticker), ("Kraken", kraken_ticker)]
ROUND_TRIP_COST_BPS = 50  # conservative

def scan() -> list[dict]:
    results = []
    for asset in PAIRS:
        quotes = {}
        for name, fn in VENUES:
            q = fn(asset)
            if q:
                quotes[name] = q
        if len(quotes) < 2:
            continue
        # Find best buy (lowest ask) and best sell (highest bid)
        best_buy = min(quotes.items(), key=lambda kv: kv[1]["ask"])
        best_sell = max(quotes.items(), key=lambda kv: kv[1]["bid"])
        if best_buy[0] == best_sell[0]:
            spread_bps = 0
        else:
            spread = best_sell[1]["bid"] - best_buy[1]["ask"]
            spread_bps = (spread / best_buy[1]["ask"]) * 10000
        results.append({
            "asset": asset,
            "quotes": {k: {"bid": v["bid"], "ask": v["ask"]} for k, v in quotes.items()},
            "best_buy_venue": best_buy[0],
            "best_buy_ask": best_buy[1]["ask"],
            "best_sell_venue": best_sell[0],
            "best_sell_bid": best_sell[1]["bid"],
            "spread_bps_gross": round(spread_bps, 2),
            "spread_bps_net": round(spread_bps - ROUND_TRIP_COST_BPS, 2),
            "actionable": spread_bps > ROUND_TRIP_COST_BPS,
        })
    return results

def main():
    print(f"=== Cross-exchange spot arb scan — {datetime.now(timezone.utc).isoformat()} ===\n")
    rows = scan()
    print(f"{'Asset':>5} | {'Buy@':14} | {'Sell@':14} | {'Spread bps':>10} | {'Net (bps)':>10} | actionable")
    print("-" * 90)
    for r in rows:
        print(f"  {r['asset']:>3} | {r['best_buy_venue']:>4} {r['best_buy_ask']:>9.2f} | "
              f"{r['best_sell_venue']:>4} {r['best_sell_bid']:>9.2f} | "
              f"{r['spread_bps_gross']:>9.2f}  | "
              f"{r['spread_bps_net']:>+9.2f}  | "
              f"{'✓' if r['actionable'] else ''}")
    print(f"\nCost assumption: round-trip {ROUND_TRIP_COST_BPS} bps (fees + slippage)")
    actionable = [r for r in rows if r['actionable']]
    print(f"\nActionable opportunities (gross > {ROUND_TRIP_COST_BPS}bps): {len(actionable)}")
    if not actionable:
        print("→ Markets efficient right now. Spot arb requires inventory on both sides + faster than HFT.")
        print("→ Realistic alt: triangular arb on single venue, or basis-arb (perp vs spot).")

if __name__ == "__main__":
    main()

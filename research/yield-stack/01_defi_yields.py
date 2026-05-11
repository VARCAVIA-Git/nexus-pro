#!/usr/bin/env python3
"""DeFi yield aggregator — fetch live APR via DeFi Llama public API.

No auth, no rate-limit issues for moderate use. Returns top stablecoin
yield opportunities ranked by risk-adjusted APR.
"""
from __future__ import annotations
import json
import urllib.request
from pathlib import Path

ENDPOINT = "https://yields.llama.fi/pools"
OUT = Path(__file__).parent / "data"
OUT.mkdir(exist_ok=True)

# Pre-vetted "safe-ish" protocols (no audit guarantee, just established)
SAFE_PROTOCOLS = {
    "aave-v3", "aave-v2", "compound-v3", "compound-v2",
    "morpho-blue", "morpho-aave", "morpho-compound",
    "curve-dex", "convex-finance", "yearn-finance",
    "spark", "sky-lending", "fluid-lending",
}
SAFE_CHAINS = {"Ethereum", "Arbitrum", "Optimism", "Base", "Polygon"}
STABLE_SYMBOLS = {"USDC", "USDT", "DAI", "USDS", "USDE", "USDD", "USDM", "FRAX", "LUSD", "USDC.E"}

def fetch_pools() -> list[dict]:
    with urllib.request.urlopen(ENDPOINT, timeout=20) as r:
        body = json.loads(r.read())
    if body.get("status") != "success":
        raise RuntimeError(f"API error: {body.get('status')}")
    return body.get("data", [])

def filter_stable_safe(pools: list[dict]) -> list[dict]:
    out = []
    for p in pools:
        if p.get("project") not in SAFE_PROTOCOLS:
            continue
        if p.get("chain") not in SAFE_CHAINS:
            continue
        sym = (p.get("symbol") or "").upper()
        # Must be pure-stable: symbol like "USDC" or "USDC-USDT" with both stable
        if not all(s in STABLE_SYMBOLS or s == "" for s in sym.split("-")):
            continue
        if (p.get("tvlUsd") or 0) < 10_000_000:  # min $10M TVL for liquidity
            continue
        apr = p.get("apy") or 0
        if apr <= 0 or apr > 50:  # filter implausible APRs
            continue
        out.append({
            "protocol": p["project"],
            "chain": p["chain"],
            "symbol": p["symbol"],
            "apr_pct": round(apr, 2),
            "apy_base_pct": round(p.get("apyBase") or 0, 2),
            "apy_reward_pct": round(p.get("apyReward") or 0, 2),
            "tvl_usd_m": round((p.get("tvlUsd") or 0) / 1e6, 1),
            "il_risk": p.get("ilRisk", "no"),
            "exposure": p.get("exposure", ""),
            "pool_id": p.get("pool", ""),
            "underlying": p.get("underlyingTokens", []),
        })
    return out

def main() -> None:
    print("Fetching DeFi Llama pools…", flush=True)
    pools = fetch_pools()
    print(f"  total pools: {len(pools)}", flush=True)
    safe = filter_stable_safe(pools)
    print(f"  safe stablecoin pools (TVL>$10M, vetted protocols): {len(safe)}\n")

    safe.sort(key=lambda p: p["apr_pct"], reverse=True)
    print("=" * 100)
    print(f"{'Rank':>4} {'Protocol':18} {'Chain':10} {'Symbol':20} {'APR%':>7} {'Base':>6} {'Rwd':>6} {'TVL$M':>8} {'IL':>3}")
    print("=" * 100)
    for i, p in enumerate(safe[:25], 1):
        print(f"{i:>4} {p['protocol']:18.18} {p['chain']:10.10} {p['symbol']:20.20} "
              f"{p['apr_pct']:>6.2f}% {p['apy_base_pct']:>5.2f}% {p['apy_reward_pct']:>5.2f}% "
              f"{p['tvl_usd_m']:>7.1f} {p['il_risk']:>3}")

    json.dump(safe, (OUT / "stable_yields.json").open("w"), indent=2)
    print(f"\nSaved {len(safe)} entries → data/stable_yields.json")

    # Capital deployment scenarios
    print("\n=== Yield projections (top 5 pools, after 10bp protocol risk haircut) ===")
    for capital in [1000, 5000, 10000, 50000, 100000]:
        avg_apr = sum(p["apr_pct"] for p in safe[:5]) / 5 if len(safe) >= 5 else 0
        net_apr = max(0, avg_apr - 0.5)  # crude risk haircut
        annual = capital * net_apr / 100
        print(f"  €{capital:>7,} @ {net_apr:.2f}% net = €{annual:>7,.0f}/yr  (€{annual/12:.0f}/mo)")

if __name__ == "__main__":
    main()

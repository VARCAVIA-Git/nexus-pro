#!/usr/bin/env python3
"""Download OKX USDT-margined perpetual swap funding rate history.

OKX endpoint is geo-friendly (Binance fapi returns 451 from EU IPs).
Funding events ~every 8h. Saves per-asset CSV.

API: GET /api/v5/public/funding-rate-history
  params: instId=BTC-USDT-SWAP, before=<ts_ms>, after=<ts_ms>, limit<=100
  pagination: before = older bound; response sorted DESC by fundingTime.

Usage: python3 01_fetch_funding.py
"""
from __future__ import annotations
import csv
import json
import time
import urllib.request
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

ASSETS = [
    ("BTC-USDT-SWAP",  "BTC"),
    ("ETH-USDT-SWAP",  "ETH"),
    ("SOL-USDT-SWAP",  "SOL"),
    ("BNB-USDT-SWAP",  "BNB"),
    ("XRP-USDT-SWAP",  "XRP"),
    ("ADA-USDT-SWAP",  "ADA"),
]
BACKFILL_DAYS = 400
ENDPOINT = "https://www.okx.com/api/v5/public/funding-rate-history"
OUT = Path(__file__).parent / "data"
OUT.mkdir(exist_ok=True)


def fetch(inst: str, after_ms: int | None = None, limit: int = 100) -> list[dict]:
    """`after` = upper bound: returns records with fundingTime < after."""
    params = {"instId": inst, "limit": str(limit)}
    if after_ms is not None:
        params["after"] = str(after_ms)
    url = f"{ENDPOINT}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"User-Agent": "research/funding-carry"})
    with urllib.request.urlopen(req, timeout=15) as r:
        body = json.loads(r.read())
    if body.get("code") != "0":
        raise RuntimeError(f"OKX error: {body}")
    return body.get("data", [])


def backfill(inst: str) -> list[dict]:
    cutoff_ms = int((time.time() - BACKFILL_DAYS * 86400) * 1000)
    all_rows: list[dict] = []
    cursor: int | None = None  # None = start from latest, then walk backwards
    last_oldest = None
    while True:
        batch = fetch(inst, after_ms=cursor, limit=100)
        if not batch:
            break
        all_rows.extend(batch)
        oldest = min(int(r["fundingTime"]) for r in batch)
        if last_oldest is not None and oldest >= last_oldest:
            break  # no progress
        last_oldest = oldest
        if oldest <= cutoff_ms:
            break
        cursor = oldest
        time.sleep(0.12)
    return all_rows


def save_csv(symbol: str, rows: list[dict]) -> Path:
    path = OUT / f"funding_{symbol}.csv"
    seen = set()
    deduped = []
    for r in rows:
        ts = int(r["fundingTime"])
        if ts in seen:
            continue
        seen.add(ts)
        deduped.append(r)
    deduped.sort(key=lambda r: int(r["fundingTime"]))
    with path.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["ts", "iso", "funding_rate", "realized_rate"])
        for r in deduped:
            ts = int(r["fundingTime"])
            iso = datetime.fromtimestamp(ts / 1000, tz=timezone.utc).isoformat()
            w.writerow([ts, iso, r["fundingRate"], r.get("realizedRate", r["fundingRate"])])
    return path


def main() -> None:
    for inst, sym in ASSETS:
        print(f"[{sym}] fetching {BACKFILL_DAYS}d from OKX…", flush=True)
        try:
            rows = backfill(inst)
        except Exception as e:
            print(f"  ERROR: {e}")
            continue
        path = save_csv(sym, rows)
        if rows:
            first = min(int(r["fundingTime"]) for r in rows)
            last = max(int(r["fundingTime"]) for r in rows)
            first_d = datetime.fromtimestamp(first / 1000, tz=timezone.utc).date()
            last_d = datetime.fromtimestamp(last / 1000, tz=timezone.utc).date()
            print(f"  {len(rows)} events {first_d} → {last_d} → {path.name}", flush=True)
        else:
            print(f"  no rows")


if __name__ == "__main__":
    main()

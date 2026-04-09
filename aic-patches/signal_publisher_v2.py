"""
core/signal_publisher.py — V2 with Feedback Loop + Signal Scorecard
====================================================================
PATCHED VERSION: adds feedback ingestion endpoint and signal tracking.

Replace the original core/signal_publisher.py with this file.

New endpoints:
  POST /feedback          — receive trade outcome from Nexus Pro Mine Engine
  GET  /scorecard         — signal performance scorecard
  GET  /scorecard/{setup} — single setup performance
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel

log = logging.getLogger(__name__)


# ── Pydantic models ──────────────────────────────────────────────────────────

class TradeOutcomePayload(BaseModel):
    mine_id: str
    symbol: str
    strategy: str               # e.g. "reversion", "trend", "breakout"
    timeframe: str
    direction: str              # "long" or "short"
    entry_price: float
    exit_price: float
    pnl_pct: float
    outcome: str                # "tp_hit", "sl_hit", "timeout", "manual", "trailing_exit"
    duration_hours: float
    setup_name: str             # AIC setup name, e.g. "RSI_MACD_Volume_4h"
    original_confidence: float  # confidence when signal was generated
    regime_at_entry: str | None = None
    confluence_at_entry: float | None = None
    closed_at: str


# ── WebSocket manager ─────────────────────────────────────────────────────────

class _WSManager:
    def __init__(self) -> None:
        self._connections: list[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._connections.append(ws)

    def disconnect(self, ws: WebSocket) -> None:
        if ws in self._connections:
            self._connections.remove(ws)

    async def broadcast(self, data: dict) -> None:
        dead = []
        for ws in self._connections:
            try:
                await ws.send_text(json.dumps(data))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


_ws_manager = _WSManager()


# ── Signal publisher ──────────────────────────────────────────────────────────

class SignalPublisher:
    def __init__(self, cfg: dict, db: "Database",
                 analyzer: "AssetAnalyzer") -> None:
        self.cfg      = cfg
        self.db       = db
        self.analyzer = analyzer
        self.symbol   = cfg["asset"]["symbol"]
        self.min_conf = cfg["signals"]["min_confidence"]
        self.min_cs   = cfg["signals"]["min_confluence_score"]
        self.grace    = cfg["signals"]["grace_period_minutes"]
        self.max_act  = cfg["signals"]["max_active_signals"]

    async def evaluate_and_publish(self, candidate_signals: list[dict]) -> list[dict]:
        """Filter, enrich, persist and broadcast high-quality signals."""
        await self.db.expire_old_signals(self.symbol)
        active = await self.db.get_active_signals(self.symbol)

        # ── NEW: Apply scorecard-based confidence adjustment ──
        scorecards = await self.db.get_all_scorecards(self.symbol)
        scorecard_map = {sc["setup_name"]: sc for sc in scorecards}

        published = []
        for sig in candidate_signals:
            if len(active) >= self.max_act:
                break
            if sig.get("confidence", 0) < self.min_conf:
                continue
            if sig.get("confluence_score", 0) < self.min_cs:
                continue

            # ── NEW: Recalibrate confidence using real performance ──
            setup = sig.get("setup_name", "")
            sc = scorecard_map.get(setup)
            if sc and sc["total_executed"] >= 20:
                # Blend original confidence with real win rate
                real_wr = sc["real_win_rate"]
                orig_conf = sig["confidence"]
                # 70% real data, 30% model estimate (as trust builds)
                trust_weight = min(sc["total_executed"] / 100, 0.9)
                adjusted_conf = (trust_weight * real_wr
                                 + (1 - trust_weight) * orig_conf)
                sig["confidence_original"] = orig_conf
                sig["confidence"] = round(adjusted_conf, 3)
                sig["confidence_source"] = "scorecard_adjusted"

                # Hard reject if setup is consistently losing
                if real_wr < 0.40:
                    log.info("⛔ Rejecting signal from %s — real WR=%.1f%%",
                             setup, real_wr * 100)
                    continue

                # Reject on losing streak (last 5 all losses)
                last_5 = sc.get("last_10_outcomes", [])[-5:]
                if len(last_5) >= 5 and all(o in ("sl_hit", "timeout") for o in last_5):
                    log.info("⛔ Rejecting signal from %s — 5-loss streak", setup)
                    continue

            # Enrich
            sig["symbol"] = self.symbol
            expires_at = (datetime.now(timezone.utc)
                          + timedelta(minutes=self.grace)).isoformat()
            sig["expires_at"] = expires_at
            sig["timeout_minutes"] = self.grace

            signal_id = await self.db.save_signal(sig)
            sig["id"] = signal_id
            published.append(sig)

            await _ws_manager.broadcast({"event": "new_signal", "signal": sig})
            log.info(
                "📢  Signal published: %s %s @ %.2f | conf=%.2f%s | %s",
                sig["action"], self.symbol, sig["entry"],
                sig["confidence"],
                " (adj)" if sig.get("confidence_source") == "scorecard_adjusted" else "",
                sig["setup_name"]
            )

        return published

    async def get_active_signals(self) -> list[dict]:
        await self.db.expire_old_signals(self.symbol)
        return await self.db.get_active_signals(self.symbol)


# ── App factory ───────────────────────────────────────────────────────────────

def create_app(publisher: SignalPublisher,
               reporter: "ReportGenerator") -> FastAPI:

    app = FastAPI(
        title="Asset Intelligence API",
        description="Single-asset trading intelligence & signal engine — V2 with feedback loop",
        version="2.0.0",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    SECRET = (os.getenv("API_SECRET_TOKEN")
              or publisher.cfg["api"].get("secret_token", ""))

    def _auth(token: str = "") -> None:
        if SECRET and token != SECRET:
            raise HTTPException(status_code=401, detail="Unauthorized")

    # ── Original routes (unchanged) ──────────────────────────────────────────

    @app.get("/status")
    async def status() -> dict:
        regime, regime_conf = publisher.analyzer.ml.detect_regime(
            publisher.analyzer.get_indicators("4h"),
            publisher.analyzer.get_indicators("1d"),
        ) if hasattr(publisher.analyzer, "ml") else ("UNKNOWN", 0)
        return {
            "status": "online",
            "symbol": publisher.symbol,
            "price":  publisher.analyzer.current_price,
            "confluence": publisher.analyzer.confluence,
            "regime": regime,
            "regime_confidence": regime_conf,
            "active_tfs": list(publisher.analyzer.state.keys()),
            "ts": datetime.now(timezone.utc).isoformat(),
        }

    @app.get("/signals")
    async def get_signals(token: str = "") -> list[dict]:
        _auth(token)
        sigs = await publisher.get_active_signals()
        for s in sigs:
            if isinstance(s.get("tp_levels"), str):
                s["tp_levels"] = json.loads(s["tp_levels"])
        return sigs

    @app.get("/signals/latest")
    async def latest_signal(token: str = "") -> dict:
        _auth(token)
        sigs = await publisher.get_active_signals()
        if not sigs:
            raise HTTPException(status_code=404, detail="No active signals")
        best = max(sigs, key=lambda s: s.get("confidence", 0))
        if isinstance(best.get("tp_levels"), str):
            best["tp_levels"] = json.loads(best["tp_levels"])
        return {
            "action":           best["action"],
            "entry":            best["entry"],
            "TP":               best.get("tp_levels", []),
            "SL":               best["sl"],
            "timeout_minutes":  best.get("timeout_minutes", 45),
            "confidence":       best.get("confidence", 0),
            "confidence_original": best.get("confidence_original"),
            "expected_profit_%": best.get("expected_profit_pct", 0),
            "setup_name":       best.get("setup_name", ""),
            "expires_at":       best.get("expires_at"),
        }

    @app.get("/analysis")
    async def analysis(tf: str = "4h", token: str = "") -> dict:
        _auth(token)
        ind = publisher.analyzer.get_indicators(tf)
        if not ind:
            raise HTTPException(status_code=404, detail=f"No data for TF={tf}")
        return {
            "timeframe": tf,
            "indicators": ind,
            "price": publisher.analyzer.current_price,
            "ts": datetime.now(timezone.utc).isoformat(),
        }

    @app.get("/confluence")
    async def confluence() -> dict:
        return {
            "confluence": publisher.analyzer.confluence,
            "key_levels": publisher.analyzer.get_key_levels(),
            "price": publisher.analyzer.current_price,
            "ts": datetime.now(timezone.utc).isoformat(),
        }

    @app.get("/report", response_class=HTMLResponse)
    async def report() -> str:
        try:
            with open(publisher.cfg["report"]["html_file"]) as f:
                return f.read()
        except FileNotFoundError:
            return "<h1>Report not yet generated</h1>"

    @app.get("/report/json")
    async def report_json() -> dict:
        try:
            with open(publisher.cfg["report"]["json_file"]) as f:
                return json.load(f)
        except FileNotFoundError:
            return {"error": "Report not yet generated"}

    @app.get("/top-setups")
    async def top_setups(token: str = "") -> list[dict]:
        _auth(token)
        return await publisher.db.get_top_setups(publisher.symbol, limit=20)

    @app.get("/research")
    async def research(token: str = "") -> dict:
        _auth(token)
        snap = await publisher.db.get_latest_research(publisher.symbol)
        return snap or {"error": "No research data yet"}

    # ── NEW: Feedback endpoint ────────────────────────────────────────────────

    @app.post("/feedback")
    async def receive_feedback(payload: TradeOutcomePayload,
                                token: str = "") -> dict:
        """
        Receive trade outcome from Nexus Pro Mine Engine.
        Updates the signal scorecard and stores for ML retraining.
        """
        _auth(token)

        outcome = payload.model_dump()
        log.info(
            "📥  Feedback received: %s %s | %s | PnL=%.2f%% | setup=%s",
            payload.direction.upper(), payload.symbol,
            payload.outcome, payload.pnl_pct, payload.setup_name,
        )

        # 1. Store raw feedback for ML retraining
        await publisher.db.save_feedback(payload.symbol, outcome)

        # 2. Update scorecard
        await _update_scorecard(publisher.db, payload)

        # 3. Broadcast to connected WS clients
        await _ws_manager.broadcast({
            "event": "feedback_received",
            "mine_id": payload.mine_id,
            "outcome": payload.outcome,
            "pnl_pct": payload.pnl_pct,
        })

        return {"status": "ok", "mine_id": payload.mine_id}

    @app.get("/scorecard")
    async def get_scorecard(token: str = "") -> list[dict]:
        """Get all setup scorecards for this asset."""
        _auth(token)
        return await publisher.db.get_all_scorecards(publisher.symbol)

    @app.get("/scorecard/{setup_name}")
    async def get_setup_scorecard(setup_name: str, token: str = "") -> dict:
        _auth(token)
        sc = await publisher.db.get_scorecard(publisher.symbol, setup_name)
        if not sc:
            raise HTTPException(status_code=404, detail="Scorecard not found")
        return sc

    # ── NEW: Regime endpoint ──────────────────────────────────────────────────

    @app.get("/regime")
    async def get_regime() -> dict:
        """Current market regime from ML + rules hybrid."""
        try:
            ind_4h = publisher.analyzer.get_indicators("4h")
            ind_1d = publisher.analyzer.get_indicators("1d")
            regime, conf = publisher.analyzer.ml.detect_regime(ind_4h, ind_1d)
            prob = publisher.analyzer.ml.next_move_probability(
                publisher.analyzer.confluence, ind_4h, ind_1d
            )
            return {
                "regime": regime,
                "confidence": conf,
                "probabilities": prob,
                "ts": datetime.now(timezone.utc).isoformat(),
            }
        except Exception as e:
            return {"regime": "UNKNOWN", "confidence": 0, "error": str(e)}

    # ── WebSocket ──────────────────────────────────────────────────────────────

    @app.websocket("/ws/signals")
    async def ws_signals(ws: WebSocket) -> None:
        await _ws_manager.connect(ws)
        try:
            await ws.send_text(json.dumps({
                "event": "connected",
                "confluence": publisher.analyzer.confluence,
                "price": publisher.analyzer.current_price,
            }))
            while True:
                try:
                    await asyncio.wait_for(ws.receive_text(), timeout=30)
                except asyncio.TimeoutError:
                    await ws.send_text(json.dumps({
                        "event": "heartbeat",
                        "price": publisher.analyzer.current_price,
                        "ts": datetime.now(timezone.utc).isoformat(),
                    }))
        except WebSocketDisconnect:
            _ws_manager.disconnect(ws)

    return app


# ── Scorecard logic ───────────────────────────────────────────────────────────

async def _update_scorecard(db: "Database",
                             payload: TradeOutcomePayload) -> None:
    """Update or create a scorecard entry for this setup."""
    existing = await db.get_scorecard(payload.symbol, payload.setup_name)

    if existing:
        sc = existing
        sc["total_executed"] += 1
        if payload.outcome == "tp_hit" or (payload.outcome == "trailing_exit" and payload.pnl_pct > 0):
            sc["wins"] += 1
        elif payload.outcome in ("sl_hit",):
            sc["losses"] += 1
        elif payload.outcome == "timeout":
            sc["timeouts"] += 1
        else:
            # manual close or other — count as win if profitable
            if payload.pnl_pct > 0:
                sc["wins"] += 1
            else:
                sc["losses"] += 1

        decided = sc["wins"] + sc["losses"]
        sc["real_win_rate"] = round(sc["wins"] / decided, 4) if decided > 0 else 0

        # Profit factor from cumulative
        total_profit = sc.get("_cum_profit", 0) + max(payload.pnl_pct, 0)
        total_loss = sc.get("_cum_loss", 0) + abs(min(payload.pnl_pct, 0))
        sc["_cum_profit"] = total_profit
        sc["_cum_loss"] = total_loss
        sc["real_profit_factor"] = round(total_profit / total_loss, 4) if total_loss > 0 else 999

        # Running average PnL
        n = sc["total_executed"]
        sc["avg_pnl_pct"] = round(
            (sc["avg_pnl_pct"] * (n - 1) + payload.pnl_pct) / n, 4
        )

        # Running average confidence
        sc["avg_confidence"] = round(
            (sc["avg_confidence"] * (n - 1) + payload.original_confidence) / n, 4
        )

        # Confidence accuracy: how well does confidence predict win rate?
        sc["confidence_accuracy"] = round(
            1 - abs(sc["avg_confidence"] - sc["real_win_rate"]), 4
        )

        # Last 10 outcomes (sliding window)
        outcomes = sc.get("last_10_outcomes", [])
        outcomes.append(payload.outcome)
        sc["last_10_outcomes"] = outcomes[-10:]

        sc["last_updated"] = datetime.now(timezone.utc).isoformat()

    else:
        # New scorecard
        is_win = payload.pnl_pct > 0
        sc = {
            "setup_name": payload.setup_name,
            "symbol": payload.symbol,
            "total_signals": 0,  # updated separately when signals are published
            "total_executed": 1,
            "wins": 1 if is_win else 0,
            "losses": 0 if is_win else 1,
            "timeouts": 1 if payload.outcome == "timeout" else 0,
            "real_win_rate": 1.0 if is_win else 0.0,
            "real_profit_factor": 999 if is_win else 0,
            "avg_pnl_pct": round(payload.pnl_pct, 4),
            "avg_confidence": round(payload.original_confidence, 4),
            "confidence_accuracy": 0.5,  # not enough data yet
            "last_10_outcomes": [payload.outcome],
            "last_updated": datetime.now(timezone.utc).isoformat(),
            "_cum_profit": max(payload.pnl_pct, 0),
            "_cum_loss": abs(min(payload.pnl_pct, 0)),
        }

    await db.save_scorecard(payload.symbol, payload.setup_name, sc)
    log.info(
        "📊  Scorecard updated: %s/%s — WR=%.1f%% PF=%.2f (%d trades)",
        payload.symbol, payload.setup_name,
        sc["real_win_rate"] * 100, sc["real_profit_factor"],
        sc["total_executed"],
    )

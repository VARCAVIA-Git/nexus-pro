"""
Database V2 additions — Add these methods to core/database.py
=============================================================
These methods support the feedback loop and signal scorecard.
Add them to the existing Database class.

Also add these tables to the init() method's CREATE TABLE block.
"""

# ── ADD TO init() — new tables ──────────────────────────────────────────────

FEEDBACK_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    mine_id TEXT NOT NULL UNIQUE,
    setup_name TEXT NOT NULL,
    direction TEXT NOT NULL,
    entry_price REAL NOT NULL,
    exit_price REAL NOT NULL,
    pnl_pct REAL NOT NULL,
    outcome TEXT NOT NULL,
    duration_hours REAL NOT NULL,
    original_confidence REAL NOT NULL,
    regime_at_entry TEXT,
    confluence_at_entry REAL,
    closed_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    payload TEXT NOT NULL
);
"""

SCORECARD_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS scorecard (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    setup_name TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(symbol, setup_name)
);
"""

FEEDBACK_INDEX_SQL = """
CREATE INDEX IF NOT EXISTS idx_feedback_symbol ON feedback(symbol);
CREATE INDEX IF NOT EXISTS idx_feedback_setup ON feedback(setup_name);
CREATE INDEX IF NOT EXISTS idx_scorecard_symbol ON scorecard(symbol);
"""


# ── ADD THESE METHODS to the Database class ──────────────────────────────────

async def save_feedback(self, symbol: str, outcome: dict) -> None:
    """Store a trade outcome for ML retraining and analytics."""
    import json
    await self._execute(
        """INSERT OR REPLACE INTO feedback
           (symbol, mine_id, setup_name, direction, entry_price, exit_price,
            pnl_pct, outcome, duration_hours, original_confidence,
            regime_at_entry, confluence_at_entry, closed_at, payload)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            symbol,
            outcome["mine_id"],
            outcome["setup_name"],
            outcome["direction"],
            outcome["entry_price"],
            outcome["exit_price"],
            outcome["pnl_pct"],
            outcome["outcome"],
            outcome["duration_hours"],
            outcome["original_confidence"],
            outcome.get("regime_at_entry"),
            outcome.get("confluence_at_entry"),
            outcome["closed_at"],
            json.dumps(outcome),
        )
    )


async def get_feedback(self, symbol: str, limit: int = 100) -> list[dict]:
    """Get recent trade outcomes for a symbol."""
    import json
    rows = await self.query(
        "SELECT payload FROM feedback WHERE symbol=? ORDER BY id DESC LIMIT ?",
        (symbol, limit)
    )
    return [json.loads(row["payload"]) for row in rows]


async def get_feedback_by_setup(self, symbol: str, setup_name: str,
                                 limit: int = 50) -> list[dict]:
    """Get trade outcomes for a specific setup."""
    import json
    rows = await self.query(
        """SELECT payload FROM feedback
           WHERE symbol=? AND setup_name=?
           ORDER BY id DESC LIMIT ?""",
        (symbol, setup_name, limit)
    )
    return [json.loads(row["payload"]) for row in rows]


async def save_scorecard(self, symbol: str, setup_name: str,
                          data: dict) -> None:
    """Upsert a signal scorecard."""
    import json
    await self._execute(
        """INSERT INTO scorecard (symbol, setup_name, data, updated_at)
           VALUES (?, ?, ?, datetime('now'))
           ON CONFLICT(symbol, setup_name) DO UPDATE SET
             data=excluded.data, updated_at=excluded.updated_at""",
        (symbol, setup_name, json.dumps(data))
    )


async def get_scorecard(self, symbol: str, setup_name: str) -> dict | None:
    """Get scorecard for a specific setup."""
    import json
    rows = await self.query(
        "SELECT data FROM scorecard WHERE symbol=? AND setup_name=?",
        (symbol, setup_name)
    )
    if rows:
        return json.loads(rows[0]["data"])
    return None


async def get_all_scorecards(self, symbol: str) -> list[dict]:
    """Get all scorecards for a symbol."""
    import json
    rows = await self.query(
        "SELECT data FROM scorecard WHERE symbol=? ORDER BY updated_at DESC",
        (symbol,)
    )
    return [json.loads(row["data"]) for row in rows]


async def get_feedback_stats(self, symbol: str) -> dict:
    """Aggregate feedback statistics for a symbol."""
    rows = await self.query(
        """SELECT
             COUNT(*) as total,
             SUM(CASE WHEN pnl_pct > 0 THEN 1 ELSE 0 END) as wins,
             SUM(CASE WHEN pnl_pct <= 0 THEN 1 ELSE 0 END) as losses,
             AVG(pnl_pct) as avg_pnl,
             SUM(CASE WHEN pnl_pct > 0 THEN pnl_pct ELSE 0 END) as gross_profit,
             SUM(CASE WHEN pnl_pct < 0 THEN ABS(pnl_pct) ELSE 0 END) as gross_loss
           FROM feedback WHERE symbol=?""",
        (symbol,)
    )
    if not rows:
        return {}
    r = rows[0]
    return {
        "total_trades": r["total"],
        "wins": r["wins"],
        "losses": r["losses"],
        "win_rate": round(r["wins"] / r["total"], 4) if r["total"] else 0,
        "avg_pnl_pct": round(r["avg_pnl"], 4) if r["avg_pnl"] else 0,
        "profit_factor": round(r["gross_profit"] / r["gross_loss"], 4)
            if r["gross_loss"] and r["gross_loss"] > 0 else 999,
    }

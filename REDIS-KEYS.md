# Nexus Pro — Redis Keys Reference

## Auth
| Key | Type | TTL | Description |
|---|---|---|---|
| `nexus:user:{email}` | String (JSON) | — | User record (id, name, email, passwordHash) |
| `nexus:session:{sessionId}` | String (JSON) | 7 days | Session data (userId, email, name) |

## User Settings
| Key | Type | TTL | Description |
|---|---|---|---|
| `nexus:{userId}:settings` | String (JSON) | — | User preferences (timezone, notifications, etc.) |
| `nexus:{userId}:ticker_assets` | String (JSON) | — | Custom ticker asset list |

## Bot System
| Key | Type | TTL | Description |
|---|---|---|---|
| `nexus:bot_config` | String (JSON array) | — | All MultiBotConfig objects. Filtered by `environment` field at API level. |
| `nexus:bot:state:{botId}` | String (JSON) | — | Per-bot runtime: positions, closedTrades, signalLog, tickCount |
| `nexus:bot_state` | String (JSON) | — | Legacy: bot running flag |

## Trading Data
| Key | Type | TTL | Description |
|---|---|---|---|
| `nexus:trades` | List (JSON) | — | Closed trade records (max 500) |
| `nexus:signal_log` | List (JSON) | — | Generated signals (max 500) |
| `nexus:notifications` | List (JSON) | — | In-app notifications (max 200) |
| `nexus:notif_unread_count` | String | — | Unread notification count |
| `nexus:performance` | String (JSON) | — | Cached performance metrics |

## Intelligence
| Key | Type | TTL | Description |
|---|---|---|---|
| `nexus:ohlcv:{asset}:{tf}` | String (JSON) | 5min-12h | Cached MTF candle data |
| `nexus:news:{asset}` | String (JSON) | 15min | News sentiment cache |
| `nexus:econ_calendar` | String (JSON) | 1h | Economic calendar cache |
| `nexus:analysis:{asset}:{tf}` | String (JSON) | 5min | Cached analysis results |

## Learning Engine
| Key | Type | TTL | Description |
|---|---|---|---|
| `nexus:learning:outcomes` | List (JSON) | — | Trade outcomes for learning (max 10k) |
| `nexus:learning:insights:{asset}` | String (JSON) | 1h | Pattern analysis insights |
| `nexus:learning:weights:{asset}` | String (JSON) | 30min | Adaptive signal weights |

## R&D Lab
| Key | Type | TTL | Description |
|---|---|---|---|
| `nexus:warehouse:{asset}:{tf}` | String (JSON) | 7 days | Historical OHLCV data |
| `nexus:rnd:warehouse_status` | String (JSON) | 24h | Warehouse download status |
| `nexus:rnd:scan:{asset}:{tf}` | String (JSON) | 24h | Indicator scan results |
| `nexus:rnd:scan_status` | String (JSON) | — | Scan progress status |
| `nexus:rnd:patterns:{asset}` | String (JSON) | 24h | Pattern mapper results |
| `nexus:rnd:events:{asset}` | String (JSON) | 24h | Event reaction analysis |
| `nexus:rnd:lab:{asset}` | String (JSON) | 24h | Strategy lab results |
| `nexus:rnd:training:{asset}:{tf}:{strategy}` | String (JSON) | 24h | Training results per combo |
| `nexus:rnd:knowledge` | String (JSON) | 24h | Knowledge base entries |
| `nexus:history:{asset}:{tf}` | String (JSON) | varies | Downloaded historical candles |

## Debug
| Key | Type | TTL | Description |
|---|---|---|---|
| `nexus:debug:lastTick` | String (JSON) | 1h | Last cron tick debug info |
| `nexus:test:ping` | String (JSON) | 60s | Test-all write/read check |

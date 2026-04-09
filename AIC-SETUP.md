# Asset Intelligence Core — Setup & Deploy Guide

**Per**: Deploy di AIC come sidecar di Nexus Pro
**Target**: Stesso droplet (se upgrade RAM) o droplet separato

---

## 1. Requisiti

- Python 3.11+
- 2GB RAM minimo (xgboost + pandas + optuna sono pesanti)
- Docker (consigliato) o venv Python
- Porte: 8080 (FastAPI)

## 2. Struttura file

```
/home/nexus/aic/                    # o dove preferisci
├── main.py
├── config.yaml
├── .env
├── requirements.txt
├── Dockerfile
├── docker-compose.yml
├── core/
│   ├── __init__.py
│   ├── asset_analyzer.py
│   ├── backtester.py
│   ├── database.py
│   ├── indicator_engine.py
│   ├── ml_engine.py
│   ├── report_generator.py
│   ├── research_agent.py
│   └── signal_publisher.py
├── data/                           # auto-created
├── logs/                           # auto-created
└── reports/                        # auto-created
```

## 3. Configurazione

### config.yaml — multi-asset setup

Per supportare BTC, ETH, SOL servono **3 istanze** (una per asset) o un refactor multi-asset. 
L'approccio più semplice per iniziare: 3 container Docker con config diverso.

```yaml
# config-btc.yaml
asset:
  symbol: "BTC/USDT"
  base: "BTC"
  quote: "USDT"
  exchange: "binance"

api:
  host: "0.0.0.0"
  port: 8080          # BTC su 8080, ETH su 8081, SOL su 8082
```

### .env

```bash
# Exchange (opzionale per dati pubblici, serve per dati privati)
EXCHANGE_API_KEY=
EXCHANGE_API_SECRET=

# Research APIs (tutti opzionali, AIC funziona anche senza)
CRYPTOPANIC_TOKEN=          # news sentiment
COINGLASS_API_KEY=          # liquidation data
ANTHROPIC_API_KEY=          # AI research summaries

# Security
API_SECRET_TOKEN=           # protezione endpoint (opzionale)
```

## 4. Deploy con Docker

### docker-compose.yml (multi-asset)

```yaml
version: "3.8"

services:
  aic-btc:
    build: .
    container_name: aic-btc
    ports:
      - "8080:8080"
    volumes:
      - ./data-btc:/app/data
      - ./logs-btc:/app/logs
      - ./config-btc.yaml:/app/config.yaml
    env_file: .env
    restart: unless-stopped
    mem_limit: 1g

  aic-eth:
    build: .
    container_name: aic-eth
    ports:
      - "8081:8080"
    volumes:
      - ./data-eth:/app/data
      - ./logs-eth:/app/logs
      - ./config-eth.yaml:/app/config.yaml
    env_file: .env
    restart: unless-stopped
    mem_limit: 1g

  aic-sol:
    build: .
    container_name: aic-sol
    ports:
      - "8082:8080"
    volumes:
      - ./data-sol:/app/data
      - ./logs-sol:/app/logs
      - ./config-sol.yaml:/app/config.yaml
    env_file: .env
    restart: unless-stopped
    mem_limit: 1g
```

### Lancio

```bash
docker compose up --build -d

# Verifica
curl http://localhost:8080/status   # BTC
curl http://localhost:8081/status   # ETH
curl http://localhost:8082/status   # SOL
```

## 5. Deploy senza Docker (venv)

```bash
cd /home/nexus/aic
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Lancia con PM2 (come Nexus Pro)
pm2 start main.py --name aic-btc --interpreter python3 -- --config config-btc.yaml
pm2 start main.py --name aic-eth --interpreter python3 -- --config config-eth.yaml
pm2 start main.py --name aic-sol --interpreter python3 -- --config config-sol.yaml
```

## 6. Connessione con Nexus Pro

Aggiungi al `.env` di Nexus Pro:

```bash
# Asset Intelligence Core endpoints
AIC_BTC_URL=http://localhost:8080
AIC_ETH_URL=http://localhost:8081
AIC_SOL_URL=http://localhost:8082
AIC_SECRET_TOKEN=                    # stesso token di AIC se impostato
```

L'AIC Client in Nexus Pro (`src/lib/mine/aic-client.ts`) usa queste URL per comunicare.

## 7. Risorse necessarie

### Opzione A: Upgrade droplet attuale (consigliato)
- Da 1GB → 4GB RAM ($24/mese su DigitalOcean)
- Nexus Pro: ~500MB, AIC×3: ~2.5GB, Sistema: ~500MB
- Swap: mantieni 2GB come safety net

### Opzione B: Droplet separato per AIC
- Nexus Pro resta su 1GB ($6/mese)
- Nuovo droplet 2GB ($12/mese) per AIC
- Comunicazione via IP privato (stessa region) o IP pubblico
- Totale: $18/mese

### Opzione C: Inizio graduale (1 asset)
- Parti solo con BTC su AIC (1 istanza)
- 1 container da ~800MB
- Upgrade droplet a 2GB ($12/mese) basta
- Aggiungi ETH e SOL quando confermato che funziona

## 8. Monitoring

```bash
# Log AIC
docker logs -f aic-btc --tail 50

# Status check (da aggiungere al cron Nexus Pro)
curl -s http://localhost:8080/status | jq .

# Report HTML generato automaticamente
# http://server-ip:8080/report
```

## 9. Tempistiche bootstrap

Al primo lancio AIC scarica dati storici per tutti i timeframe. Tempistiche stimate:
- Bootstrap candles (15 TF × 1000 candles): ~5-10 minuti
- Primo backtest cycle (4 strategie × 4 TF × 100 trials Optuna): ~15-30 minuti
- Primo XGBoost training: ~2-5 minuti
- Primo report: ~1 minuto

Dopo il bootstrap, il sistema è operativo e aggiorna ogni 60 secondi.

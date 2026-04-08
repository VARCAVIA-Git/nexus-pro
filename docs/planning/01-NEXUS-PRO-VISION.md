# NEXUS PRO — VISIONE DEL PRODOTTO

> Documento di riferimento per ogni sessione di sviluppo. Leggere prima di iniziare qualsiasi lavoro sul progetto.

## Identità

Nexus Pro è una piattaforma di trading analytics in cui ogni asset (BTC, ETH, AAPL, TSLA, ETF…) è studiato e operato da una propria **AI Analytic** persistente — un'entità "quasi vivente" che conosce quell'asset meglio di chiunque altro e mette il suo sapere al servizio di **Strategy** operative configurate dall'utente.

Non è "un bot di trading con qualche strategia". È **un sistema in cui il sapere e l'esecuzione sono separati**: il sapere viene capitalizzato una volta sola per asset (l'AI Analytic) e usato da quante Strategy si vuole.

## Le tre entità del sistema

### 1. AI Analytic — il cervello, una per asset

Entità persistente legata 1:1 a un asset. Non opera mai direttamente sul mercato. Il suo unico mestiere è **conoscere il suo asset**:

- Scarica tutto lo storico disponibile (4 anni × 4 timeframe).
- Analizza candela per candela, calcolando indicatori, contesto, regime, ground-truth (return futuri).
- Mappa i pattern: per ogni combinazione di condizioni, calcola winrate e expected return.
- Misura come l'asset risponde a ogni indicatore e a ogni strategia.
- Identifica le **reaction zones**: livelli di prezzo dove l'asset reagisce storicamente con probabilità >60%.
- Determina se l'asset rende meglio in scalp, intraday, daily o swing.
- Monitora il presente in tutti i timeframe per fornire alle Strategy il contesto live.
- Si auto-aggiorna periodicamente.

L'AI Analytic produce un **AnalyticReport** strutturato che è il *contratto* con cui dialoga con le Strategy.

### 2. Strategy — la mano, ne hai quante ne vuoi

Contratto operativo configurato dall'utente. Ogni Strategy dichiara:

- Nome.
- Quale capitale (% del totale o cifra fissa).
- Quali asset (tra quelli che hanno già un'AI Analytic addestrata).
- Livello di aggressività (Conservativa / Bilanciata / Aggressiva).
- Modalità (demo / real).

La Strategy **non sa nulla di mercato per conto suo**: chiede tutto all'AI Analytic. Il TP/SL **non sono configurati dall'utente** — sono derivati automaticamente dalle statistiche di reazione storica dell'asset (es. "BTC 15min con RSI<30 + BB lower → movimento medio +180pt → target 120pt, SL -60pt").

Multiple Strategy possono usare la stessa AI Analytic. È uno dei vantaggi del modello: lo studio si fa una volta, ne beneficiano tutte.

### 3. Mine — il modello di esecuzione

Le Strategy non operano "al market quando il segnale è forte". Operano piazzando **ordini condizionali in anticipo (limit orders)** sulle reaction zones che l'AI Analytic ha identificato. Ogni mina ha:

- Prezzo di trigger.
- TP e SL calcolati dalle statistiche storiche.
- **TTL** (time-to-live): se non viene innescata entro N minuti/ore (ereditati dal timeframe dell'AI Analytic), scade e viene cancellata.
- Capitale assegnato (frazione dell'allocazione della Strategy).

Modello di piazzamento: **grid laddering** — 2-4 mine in scala intorno a una zona, mai più di **5 mine pending per Strategy** contemporaneamente (hard cap).

## Esempio di flusso utente

1. Riccardo apre `/assets`, sceglie "Crypto" → "BTC", clicca "Assegna AI Analytic".
2. Il sistema risponde "AI Analytic in addestramento, posizione 1 in coda, ETA ~12 minuti". L'utente è libero di andare altrove.
3. Notifica in-app + Discord: "AI Analytic BTC pronta. 4 anni di storico, 12.847 pattern mappati, 23 reaction zones identificate, miglior timeframe: 1h."
4. Riccardo apre `/assets/BTC` e vede il report: distribuzione winrate per condizione, top 20 pattern, calendario reattività eventi, confronto strategie.
5. Riccardo va su `/strategy`, crea "BTC Aggressiva 1h": 30% capitale, asset = BTC, aggressività = Aggressiva, modalità = demo. Avvia.
6. Ad ogni tick (60s), la Strategy chiede all'AI Analytic le reaction zones delle prossime 4 ore. Piazza 3-4 mine in laddering su Alpaca con TTL 4h.
7. Quando una mina scatta, le altre si riequilibrano. Quando scadono, vengono cancellate. Quando un trade si chiude, viene salvato in `learning/` per migliorare i pesi futuri dell'AI Analytic.
8. La domenica notte, l'AI Analytic si auto-rigenera con i dati nuovi della settimana.

## Non-goals (cosa Nexus Pro NON è)

- **Non è un terminale di trading manuale.** Non offre il classico "compra/vendi adesso al market". Tutto passa per le Strategy.
- **Non è un copy-trading.** L'utente non segue altri trader, segue le sue AI Analytic.
- **Non è un bot generico configurabile.** I bot generici (vecchio `MultiBotConfig`) verranno deprecati o convertiti in Strategy.
- **Non è gratis di RAM.** Sul droplet 1GB, gira 1 training di AI Analytic alla volta. La concorrenza è gestita da una coda Redis sequenziale.

## Vincoli infrastrutturali (immutabili)

- DigitalOcean Droplet 1GB RAM, $6/mese.
- Upstash Redis (free tier, HTTP-based).
- Alpaca Markets (paper + live, commission-free, $0 per ordine).
- Twelve Data free (8 req/min — bottleneck per stocks).
- CoinGecko free (30 req/min) + Binance public klines (no auth, ~1200 req/min).
- PM2: nexus-web + nexus-cron (ogni 60s).
- **Zero spese aggiuntive consentite.** Ogni nuova feature deve girare sull'infra esistente.

## Modello di refresh (sintesi)

| Tipo di lavoro | Frequenza | Costo |
|---|---|---|
| Training completo AI Analytic (download + pattern mining + grid search) | 1 volta al primo assegnamento + ogni 7 giorni di notte | Pesante (~5-30 min per asset) |
| Ingestione candele live (append + statistiche incrementali) | Ogni 60s tramite cron tick | Leggero (~50ms per asset) |
| Tick delle Strategy (consulta AI Analytic + piazza/cancella mine) | Ogni 60s tramite cron tick | Leggero |
| Refresh manuale | A comando dell'utente | Pesante, accodato |

## Sintesi in una frase

> Una AI Analytic per asset che studia il passato e osserva il presente, e quante Strategy vuoi che usano quel sapere per piazzare mine condizionali con TP/SL auto-tarati.

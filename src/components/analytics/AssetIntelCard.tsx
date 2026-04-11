'use client';

import { useEffect, useState } from 'react';
import {
  Globe, Newspaper, TrendingUp, TrendingDown, Building2, Coins,
  Calendar, BarChart3, ExternalLink, AlertCircle, Activity,
} from 'lucide-react';

interface IntelData {
  symbol: string;
  type: 'crypto' | 'stock';
  macro: { events: any[] };
  crypto: any;
  stock: any;
  providers: { fmp: boolean; cmc: boolean; finnhub: boolean; cryptopanic: boolean };
}

function fmtBig(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}

function fmtPct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function timeAgo(iso: string | number): string {
  const ts = typeof iso === 'string' ? new Date(iso).getTime() : iso * 1000;
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m fa`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h fa`;
  return `${Math.floor(hours / 24)}g fa`;
}

export function AssetIntelCard({ symbol }: { symbol: string }) {
  const [data, setData] = useState<IntelData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/asset/${encodeURIComponent(symbol)}/intel`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [symbol]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-n-border bg-n-card p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-n-dim">
          <Activity size={16} className="animate-pulse" /> Caricamento intelligence asset...
        </div>
      </div>
    );
  }

  if (!data) return null;

  const isCrypto = data.type === 'crypto';
  const noProvidersConfigured =
    !data.providers.fmp && !data.providers.cmc && !data.providers.finnhub;

  return (
    <div className="space-y-4">
      {/* Header with provider status */}
      <div className="rounded-2xl border border-purple-500/30 bg-gradient-to-br from-purple-500/10 to-blue-500/5 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-purple-300 flex items-center gap-2">
            <Globe size={18} /> Asset Intelligence
          </h2>
          <div className="flex items-center gap-1.5 text-[10px]">
            <ProviderBadge active={data.providers.fmp} label="FMP" />
            {isCrypto && <ProviderBadge active={data.providers.cmc} label="CMC" />}
            {!isCrypto && <ProviderBadge active={data.providers.finnhub} label="Finnhub" />}
            {isCrypto && <ProviderBadge active={data.providers.cryptopanic} label="News" />}
          </div>
        </div>

        {noProvidersConfigured && (
          <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 p-3">
            <AlertCircle size={14} className="text-amber-400 mt-0.5 shrink-0" />
            <div className="text-[11px] text-amber-300">
              <p className="font-semibold">Provider esterni non configurati</p>
              <p className="text-amber-300/80 mt-0.5">
                Aggiungi le API keys gratuite in <code className="bg-n-bg-s px-1 rounded">.env.local</code> per attivare:{' '}
                <code>FMP_API_KEY</code> (calendario macro 30gg, earnings),{' '}
                <code>COINMARKETCAP_API_KEY</code> (metadata crypto),{' '}
                <code>FINNHUB_API_KEY</code> (news stocks, recommendations)
              </p>
            </div>
          </div>
        )}
      </div>

      {/* CRYPTO METADATA (CMC) */}
      {isCrypto && data.crypto?.quote && (
        <CryptoQuoteCard quote={data.crypto.quote} global={data.crypto.global} />
      )}

      {/* STOCK PROFILE (Finnhub) */}
      {!isCrypto && data.stock?.profile && (
        <StockProfileCard
          profile={data.stock.profile}
          recommendation={data.stock.recommendation}
          financials={data.stock.financials}
          earnings={data.stock.earnings}
        />
      )}

      {/* MACRO EVENTS */}
      <MacroEventsList events={data.macro.events} />

      {/* NEWS */}
      {isCrypto && data.crypto?.news?.length > 0 && (
        <CryptoNewsList news={data.crypto.news} />
      )}
      {!isCrypto && data.stock?.news?.length > 0 && (
        <StockNewsList news={data.stock.news} />
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────

function ProviderBadge({ active, label }: { active: boolean; label: string }) {
  return (
    <span className={`rounded px-1.5 py-0.5 font-bold ${active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-n-bg-s text-n-dim'}`}>
      {active ? '●' : '○'} {label}
    </span>
  );
}

function CryptoQuoteCard({ quote, global }: { quote: any; global: any }) {
  return (
    <div className="rounded-xl border border-n-border bg-n-card p-5">
      <div className="flex items-center gap-2 mb-3">
        <Coins size={14} className="text-amber-400" />
        <h3 className="text-sm font-bold text-n-text">{quote.name} (#{quote.rank})</h3>
        <span className="text-[10px] text-n-dim">via CoinMarketCap</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Market Cap" value={fmtBig(quote.marketCap)} />
        <Stat label="Volume 24h" value={fmtBig(quote.volume24h)} />
        <Stat label="Dominance" value={`${quote.marketCapDominance.toFixed(2)}%`} />
        <Stat label="Supply" value={`${(quote.circulatingSupply / 1e6).toFixed(1)}M`} />
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 text-[10px]">
        <ChangeBox label="1h" value={quote.percentChange1h} />
        <ChangeBox label="24h" value={quote.percentChange24h} />
        <ChangeBox label="7d" value={quote.percentChange7d} />
        <ChangeBox label="30d" value={quote.percentChange30d} />
      </div>
      {global && (
        <div className="mt-3 pt-3 border-t border-n-border flex items-center justify-between text-[10px] text-n-dim">
          <span>Mercato globale: <span className="text-n-text font-mono">{fmtBig(global.totalMarketCap)}</span></span>
          <span>BTC.D: <span className="text-amber-400 font-mono">{global.btcDominance.toFixed(1)}%</span></span>
          <span>ETH.D: <span className="text-blue-400 font-mono">{global.ethDominance.toFixed(1)}%</span></span>
        </div>
      )}
    </div>
  );
}

function StockProfileCard({ profile, recommendation, financials, earnings }: any) {
  const recoTotal = recommendation
    ? recommendation.strongBuy + recommendation.buy + recommendation.hold + recommendation.sell + recommendation.strongSell
    : 0;
  const buyPct = recoTotal > 0 ? ((recommendation.strongBuy + recommendation.buy) / recoTotal * 100) : 0;

  return (
    <div className="rounded-xl border border-n-border bg-n-card p-5">
      <div className="flex items-center gap-3 mb-4">
        {profile.logo && (
          <img src={profile.logo} alt={profile.name} className="h-10 w-10 rounded-lg bg-white p-1" />
        )}
        <div>
          <h3 className="text-sm font-bold text-n-text">{profile.name}</h3>
          <p className="text-[10px] text-n-dim">{profile.finnhubIndustry} · {profile.exchange}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Market Cap" value={profile.marketCapitalization ? `$${(profile.marketCapitalization / 1000).toFixed(2)}B` : '—'} />
        <Stat label="P/E TTM" value={financials?.metric?.peTTM?.toFixed(2) ?? '—'} />
        <Stat label="EPS TTM" value={financials?.metric?.epsTTM?.toFixed(2) ?? '—'} />
        <Stat label="Beta" value={financials?.metric?.beta?.toFixed(2) ?? '—'} />
      </div>
      {financials?.metric?.['52WeekHigh'] && (
        <div className="mt-3 grid grid-cols-3 gap-3 text-[10px]">
          <div>
            <p className="text-n-dim">52w High</p>
            <p className="font-mono font-bold text-n-text">${financials.metric['52WeekHigh']?.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-n-dim">52w Low</p>
            <p className="font-mono font-bold text-n-text">${financials.metric['52WeekLow']?.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-n-dim">Dividend Yield</p>
            <p className="font-mono font-bold text-n-text">{financials.metric.dividendYieldIndicatedAnnual?.toFixed(2) ?? '—'}%</p>
          </div>
        </div>
      )}
      {recommendation && recoTotal > 0 && (
        <div className="mt-3 pt-3 border-t border-n-border">
          <p className="text-[10px] text-n-dim mb-1.5">Analyst Recommendations</p>
          <div className="flex h-2 rounded-full overflow-hidden">
            {recommendation.strongBuy > 0 && <div className="bg-emerald-600" style={{ width: `${(recommendation.strongBuy / recoTotal) * 100}%` }} />}
            {recommendation.buy > 0 && <div className="bg-emerald-400" style={{ width: `${(recommendation.buy / recoTotal) * 100}%` }} />}
            {recommendation.hold > 0 && <div className="bg-amber-400" style={{ width: `${(recommendation.hold / recoTotal) * 100}%` }} />}
            {recommendation.sell > 0 && <div className="bg-red-400" style={{ width: `${(recommendation.sell / recoTotal) * 100}%` }} />}
            {recommendation.strongSell > 0 && <div className="bg-red-600" style={{ width: `${(recommendation.strongSell / recoTotal) * 100}%` }} />}
          </div>
          <div className="mt-1.5 flex justify-between text-[9px] text-n-dim">
            <span>{recoTotal} analisti</span>
            <span className="text-emerald-400 font-bold">{buyPct.toFixed(0)}% Buy</span>
          </div>
        </div>
      )}
      {earnings?.length > 0 && (
        <div className="mt-3 pt-3 border-t border-n-border">
          <p className="text-[10px] text-n-dim mb-1.5">Prossimi Earnings</p>
          <p className="font-mono text-xs text-n-text">{earnings[0].date}</p>
        </div>
      )}
    </div>
  );
}

function MacroEventsList({ events }: { events: any[] }) {
  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-n-border bg-n-card p-5">
        <div className="flex items-center gap-2 mb-2">
          <Calendar size={14} className="text-blue-400" />
          <h3 className="text-sm font-bold text-n-text">Calendario Macro</h3>
        </div>
        <p className="text-xs text-n-dim">Nessun evento macro disponibile al momento.</p>
      </div>
    );
  }

  // Trading Economics format: importance is 1/2/3, not "High"/"Medium"/"Low"
  // Country is full name, currency is in `currency` field
  const highImpact = events.filter((e: any) => (e.importance ?? 0) >= 3).slice(0, 8);
  const toShow = highImpact.length > 0 ? highImpact : events.slice(0, 8);

  const importanceLabel = (n: number) => n >= 3 ? 'High' : n >= 2 ? 'Med' : 'Low';
  const importanceColor = (n: number) => n >= 3 ? 'bg-red-500/15 text-red-400' : n >= 2 ? 'bg-amber-500/15 text-amber-400' : 'bg-n-bg-s text-n-dim';

  return (
    <div className="rounded-xl border border-n-border bg-n-card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-blue-400" />
          <h3 className="text-sm font-bold text-n-text">Calendario Macro</h3>
          <span className="text-[10px] text-n-dim">via Trading Economics</span>
        </div>
        <span className="text-[10px] text-n-dim">{events.length} eventi futuri</span>
      </div>
      <div className="space-y-1.5">
        {toShow.map((e: any, i: number) => {
          const date = new Date(e.date);
          const isToday = date.toDateString() === new Date().toDateString();
          return (
            <div key={i} className="flex items-center justify-between rounded-lg bg-n-bg/60 px-3 py-2 text-[11px]">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold ${importanceColor(e.importance ?? 0)}`}>
                  {importanceLabel(e.importance ?? 0)}
                </span>
                <span className="shrink-0 text-[9px] font-mono text-n-dim">{e.currency || e.country?.slice(0, 3).toUpperCase()}</span>
                <span className="truncate text-n-text">{e.event}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0 text-n-dim text-[10px]">
                {e.forecast && <span>est: <span className="font-mono text-n-text-s">{e.forecast}{e.unit}</span></span>}
                <span className={`font-mono ${isToday ? 'text-emerald-400 font-bold' : ''}`}>
                  {isToday ? 'OGGI' : date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CryptoNewsList({ news }: { news: any[] }) {
  return (
    <div className="rounded-xl border border-n-border bg-n-card p-5">
      <div className="flex items-center gap-2 mb-3">
        <Newspaper size={14} className="text-blue-400" />
        <h3 className="text-sm font-bold text-n-text">News Crypto</h3>
        <span className="text-[10px] text-n-dim">via CryptoPanic</span>
      </div>
      <div className="space-y-2">
        {news.slice(0, 6).map((n: any) => (
          <a key={n.id} href={n.url} target="_blank" rel="noopener" className="block rounded-lg bg-n-bg/60 p-3 hover:bg-n-bg transition-all">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[11px] text-n-text line-clamp-2 flex-1">{n.title}</p>
              <ExternalLink size={11} className="text-n-dim shrink-0 mt-0.5" />
            </div>
            <div className="mt-1.5 flex items-center gap-3 text-[9px] text-n-dim">
              <span className="font-semibold">{n.source}</span>
              <span>{timeAgo(n.publishedAt)}</span>
              {n.votes.positive > 0 && <span className="text-emerald-400">▲ {n.votes.positive}</span>}
              {n.votes.negative > 0 && <span className="text-red-400">▼ {n.votes.negative}</span>}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

function StockNewsList({ news }: { news: any[] }) {
  return (
    <div className="rounded-xl border border-n-border bg-n-card p-5">
      <div className="flex items-center gap-2 mb-3">
        <Newspaper size={14} className="text-blue-400" />
        <h3 className="text-sm font-bold text-n-text">News dell&apos;azienda</h3>
        <span className="text-[10px] text-n-dim">via Finnhub</span>
      </div>
      <div className="space-y-2">
        {news.slice(0, 6).map((n: any) => (
          <a key={n.id} href={n.url} target="_blank" rel="noopener" className="block rounded-lg bg-n-bg/60 p-3 hover:bg-n-bg transition-all">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[11px] text-n-text line-clamp-2 flex-1">{n.headline}</p>
              <ExternalLink size={11} className="text-n-dim shrink-0 mt-0.5" />
            </div>
            <div className="mt-1.5 flex items-center gap-3 text-[9px] text-n-dim">
              <span className="font-semibold">{n.source}</span>
              <span>{timeAgo(n.datetime)}</span>
              {n.category && <span className="rounded bg-n-bg-s px-1.5 py-0.5">{n.category}</span>}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-n-bg/60 p-2.5">
      <p className="text-[9px] uppercase tracking-wide text-n-dim">{label}</p>
      <p className="mt-0.5 font-mono text-xs font-bold text-n-text">{value}</p>
    </div>
  );
}

function ChangeBox({ label, value }: { label: string; value: number }) {
  const positive = value >= 0;
  return (
    <div className={`rounded-lg p-2 text-center ${positive ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
      <p className="text-n-dim">{label}</p>
      <p className={`font-mono font-bold ${positive ? 'text-emerald-400' : 'text-red-400'}`}>{fmtPct(value)}</p>
    </div>
  );
}

'use client';

import { useEffect, useState, useCallback } from 'react';
import { Brain, TrendingUp, TrendingDown, Minus, Activity, Flame, Shield, BarChart3, Newspaper, Zap, Target, BarChart, Radio } from 'lucide-react';

interface AICData {
  status?: { price: number; regime: string; regime_confidence: number; active_tfs: string[]; confluence: any };
  research?: Record<string, any>;
  confluence?: { bias: string; score: number; bullish_tfs: string[]; bearish_tfs: string[]; neutral_tfs: string[]; tf_biases: Record<string, string> };
}

const biasColor: Record<string, string> = {
  BULLISH: 'text-emerald-400',
  BEARISH: 'text-red-400',
  NEUTRAL: 'text-amber-400',
};
const biasIcon: Record<string, React.ElementType> = {
  BULLISH: TrendingUp,
  BEARISH: TrendingDown,
  NEUTRAL: Minus,
};
const regimeColor: Record<string, string> = {
  BULL: 'bg-emerald-500/15 text-emerald-400',
  BEAR: 'bg-red-500/15 text-red-400',
  CHOP: 'bg-amber-500/15 text-amber-400',
  ACCUMULATION: 'bg-blue-500/15 text-blue-400',
  DISTRIBUTION: 'bg-orange-500/15 text-orange-400',
};

function TFPill({ tf, bias }: { tf: string; bias: string }) {
  const colors: Record<string, string> = {
    BULLISH: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    BEARISH: 'bg-red-500/15 text-red-400 border-red-500/30',
    NEUTRAL: 'bg-n-bg-s text-n-dim border-n-border',
  };
  return (
    <div className={`flex flex-col items-center rounded-xl border px-3 py-2 ${colors[bias] ?? colors.NEUTRAL}`}>
      <span className="text-[10px] font-medium uppercase">{tf}</span>
      <span className="mt-0.5 text-xs font-bold">{bias === 'BULLISH' ? '▲' : bias === 'BEARISH' ? '▼' : '—'}</span>
    </div>
  );
}

export function AICInsightsCard({ data, symbol }: { data: AICData | null; symbol: string }) {
  if (!data?.status) return null;

  const { status, research, confluence } = data;
  const price = status.price;
  const regime = status.regime;
  const regimeConf = status.regime_confidence;
  const bias = confluence?.bias ?? 'NEUTRAL';
  const score = confluence?.score ?? 0;
  const BiasIcon = biasIcon[bias] ?? Minus;
  const tfBiases = confluence?.tf_biases ?? {};

  // Research data
  const r = research ?? {};
  const aiSummary = r.ai_summary;
  const fg = r.fear_greed_index;
  const fgLabel = r.fear_greed_label;
  const funding = r.funding_rate_current;
  const oi = r.open_interest;
  const fundingSent = r.funding_sentiment;
  const newsCount = r.news_article_count ?? 0;
  const newsSent = r.news_sentiment;
  const newsBull = r.news_bull_pct;
  const cgUp = r.cg_sentiment_up;
  const btcDom = r.btc_dominance;
  const mcap = r.total_market_cap_usd;
  const hashRate = r.btc_hash_rate;
  const tvl = r.defi_tvl_usd;

  return (
    <div className="space-y-4">
      {/* AI Summary */}
      {aiSummary && (
        <div className="rounded-2xl border border-accent/20 bg-accent/5 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Brain size={16} className="text-accent" />
            <h3 className="text-sm font-semibold text-accent">AI Market Analysis</h3>
            <span className="ml-auto text-[10px] text-n-dim">Aggiornato ogni 15 min</span>
          </div>
          <p className="text-sm leading-relaxed text-n-text">{aiSummary}</p>
        </div>
      )}

      {/* Confluence Multi-TF + Regime */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* TF Alignment */}
        <div className="rounded-2xl border border-n-border bg-n-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-n-text">Confluence Multi-TF</h3>
            <div className="flex items-center gap-1.5">
              <BiasIcon size={14} className={biasColor[bias]} />
              <span className={`text-sm font-bold ${biasColor[bias]}`}>{bias}</span>
              <span className="ml-1 text-[10px] text-n-dim">{(score * 100).toFixed(0)}%</span>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {['15m', '1h', '4h', '1d'].map(tf => (
              <TFPill key={tf} tf={tf} bias={tfBiases[tf] ?? 'NEUTRAL'} />
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[10px] text-n-dim">Regime:</span>
            <span className={`rounded-lg px-2 py-0.5 text-[11px] font-bold ${regimeColor[regime] ?? 'bg-n-bg-s text-n-dim'}`}>
              {regime}
            </span>
            <span className="text-[10px] text-n-dim">{(regimeConf * 100).toFixed(0)}% conf.</span>
          </div>
        </div>

        {/* Research / Sentiment */}
        <div className="rounded-2xl border border-n-border bg-n-card p-5">
          <h3 className="text-sm font-semibold text-n-text mb-3">Market Intelligence</h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
            {fg != null && (
              <div className="flex justify-between">
                <span className="text-n-dim">Fear & Greed</span>
                <span className={`font-mono font-bold ${fg < 25 ? 'text-red-400' : fg > 75 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {fg} <span className="font-normal text-n-dim">{fgLabel}</span>
                </span>
              </div>
            )}
            {funding != null && (
              <div className="flex justify-between">
                <span className="text-n-dim">Funding Rate</span>
                <span className="font-mono text-n-text">{funding}%</span>
              </div>
            )}
            {oi != null && (
              <div className="flex justify-between">
                <span className="text-n-dim">Open Interest</span>
                <span className="font-mono text-n-text">{(oi / 1e6).toFixed(2)}M</span>
              </div>
            )}
            {newsSent && newsSent !== 'UNAVAILABLE' && (
              <div className="flex justify-between">
                <span className="text-n-dim">News ({newsCount})</span>
                <span className={`font-bold ${newsSent === 'BULLISH' ? 'text-emerald-400' : newsSent === 'BEARISH' ? 'text-red-400' : 'text-amber-400'}`}>
                  {newsSent} <span className="font-normal text-n-dim">{newsBull != null ? `${(newsBull * 100).toFixed(0)}% bull` : ''}</span>
                </span>
              </div>
            )}
            {cgUp != null && (
              <div className="flex justify-between">
                <span className="text-n-dim">Community</span>
                <span className="font-mono text-n-text">{cgUp.toFixed(0)}% bullish</span>
              </div>
            )}
            {btcDom != null && (
              <div className="flex justify-between">
                <span className="text-n-dim">BTC Dominance</span>
                <span className="font-mono text-n-text">{btcDom.toFixed(1)}%</span>
              </div>
            )}
            {mcap != null && (
              <div className="flex justify-between">
                <span className="text-n-dim">Market Cap</span>
                <span className="font-mono text-n-text">${(mcap / 1e12).toFixed(2)}T</span>
              </div>
            )}
            {hashRate != null && (
              <div className="flex justify-between">
                <span className="text-n-dim">Hash Rate</span>
                <span className="font-mono text-n-text">{(hashRate / 1e12).toFixed(0)} TH/s</span>
              </div>
            )}
            {tvl != null && (
              <div className="flex justify-between">
                <span className="text-n-dim">DeFi TVL</span>
                <span className="font-mono text-n-text">${(tvl / 1e9).toFixed(1)}B</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Live AI Activity Feed */}
      <AIActivityFeed symbol={symbol} />
    </div>
  );
}

// ── Live Activity Feed ───────────────────────────────────────

interface ActivityItem {
  type: 'signal' | 'analysis' | 'backtest' | 'status';
  time: string;
  message: string;
  detail?: string;
  color?: 'green' | 'red' | 'blue' | 'amber' | 'dim';
}

const iconMap: Record<string, React.ElementType> = {
  signal: Zap,
  analysis: BarChart,
  backtest: Target,
  status: Radio,
};

const colorMap: Record<string, string> = {
  green: 'text-emerald-400',
  red: 'text-red-400',
  blue: 'text-blue-400',
  amber: 'text-amber-400',
  dim: 'text-n-dim',
};

const bgColorMap: Record<string, string> = {
  green: 'bg-emerald-500/10',
  red: 'bg-red-500/10',
  blue: 'bg-blue-500/10',
  amber: 'bg-amber-500/10',
  dim: 'bg-n-bg-s',
};

function AIActivityFeed({ symbol }: { symbol: string }) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/aic/activity?symbol=${encodeURIComponent(symbol)}`);
      if (res.ok) {
        const d = await res.json();
        setActivities(d.activities ?? []);
      }
    } catch {}
    setLoading(false);
  }, [symbol]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000); // refresh every 15s
    return () => clearInterval(interval);
  }, [load]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-n-border bg-n-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <Activity size={14} className="text-accent animate-pulse" />
          <h3 className="text-sm font-semibold text-n-text">AI Activity</h3>
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-8 rounded-lg bg-n-bg-s animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-n-border bg-n-card p-5">
      <div className="flex items-center gap-2 mb-3">
        <Activity size={14} className="text-accent" />
        <h3 className="text-sm font-semibold text-n-text">AI Activity</h3>
        <span className="ml-auto flex items-center gap-1 text-[9px] text-n-dim">
          <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
          live · aggiornato ogni 15s
        </span>
      </div>

      {activities.length === 0 ? (
        <p className="text-xs text-n-dim">Nessuna attività recente. L&apos;AI è in attesa del prossimo ciclo di analisi.</p>
      ) : (
        <div className="space-y-1.5">
          {activities.map((item, i) => {
            const Icon = iconMap[item.type] ?? Activity;
            const color = colorMap[item.color ?? 'dim'];
            const bg = bgColorMap[item.color ?? 'dim'];
            const timeAgo = formatTimeAgo(item.time);
            return (
              <div key={i} className={`flex items-start gap-2.5 rounded-lg ${bg} px-3 py-2`}>
                <Icon size={13} className={`mt-0.5 shrink-0 ${color}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className={`text-[11px] font-semibold ${color}`}>{item.message}</p>
                    <span className="shrink-0 text-[9px] text-n-dim">{timeAgo}</span>
                  </div>
                  {item.detail && (
                    <p className="mt-0.5 text-[10px] text-n-dim truncate">{item.detail}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatTimeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return 'ora';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s fa`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m fa`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h fa`;
  return `${Math.floor(hrs / 24)}g fa`;
}

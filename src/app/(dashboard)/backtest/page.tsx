'use client';

import { useState, useCallback } from 'react';
import { ASSETS, STRATEGIES } from '@/lib/config/assets';

const backtestPresets = {
  conservative: { capital: 10000, riskPerTrade: 2, stopLoss: 2, takeProfit: 4, trailing: true, trailingPct: 1.5 },
  moderate: { capital: 10000, riskPerTrade: 5, stopLoss: 3, takeProfit: 6.5, trailing: true, trailingPct: 2.5 },
  aggressive: { capital: 10000, riskPerTrade: 10, stopLoss: 5, takeProfit: 10, trailing: false, trailingPct: 0 },
};
import { runFullBacktest } from '@/lib/engine/backtest';
import { generateAssetOHLCV } from '@/lib/engine/data-generator';
import type { BacktestResult, StrategyKey, TradingConfig } from '@/types';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar,
} from 'recharts';
import { Play, RotateCcw, TrendingUp, TrendingDown } from 'lucide-react';

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg bg-n-bg/60 p-2.5 text-center">
      <p className={`font-mono text-sm font-bold ${color || 'text-n-text'}`}>{value}</p>
      <p className="text-[9px] text-n-dim">{label}</p>
    </div>
  );
}

export default function BacktestPage() {
  const accentColor = '#7c85a0';

  const [strategy, setStrategy] = useState<StrategyKey>('combined_ai');
  const [symbol, setSymbol] = useState('BTC/USD');
  const [timeframe, setTimeframe] = useState('1d');
  const [capital, setCapital] = useState(10000);
  const [risk, setRisk] = useState(5);
  const [stopLoss, setStopLoss] = useState(3);
  const [takeProfit, setTakeProfit] = useState(6.5);
  const [trailing, setTrailing] = useState(true);
  const [trailingPct, setTrailingPct] = useState(2.5);
  const [preset, setPreset] = useState<'conservative' | 'moderate' | 'aggressive'>('moderate');
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const applyPreset = (p: 'conservative' | 'moderate' | 'aggressive') => {
    setPreset(p);
    const v = backtestPresets[p];
    setCapital(v.capital);
    setRisk(v.riskPerTrade);
    setStopLoss(v.stopLoss);
    setTakeProfit(v.takeProfit);
    setTrailing(v.trailing);
    setTrailingPct(v.trailingPct);
  };

  const handleRunBacktest = useCallback(() => {
    setIsRunning(true);

    // Use requestAnimationFrame to let the UI update before heavy computation
    requestAnimationFrame(() => {
      setTimeout(() => {
        const days = timeframe === '1d' ? 500 : timeframe === '4h' ? 300 : 200;
        const candles = generateAssetOHLCV(symbol, days, '2024-06-01', Date.now() % 100000);

        const config: TradingConfig = {
          capital,
          riskPerTrade: risk,
          maxPositions: 3,
          stopLossPct: stopLoss,
          takeProfitPct: takeProfit,
          trailingStop: trailing,
          trailingPct: trailingPct,
          commissionPct: 0.1,
          slippagePct: 0.05,
          cooldownBars: 2,
          kellyFraction: 0.25,
          maxDrawdownLimit: 30,
          dailyLossLimit: 5,
        };

        const btResult = runFullBacktest(candles, config, strategy, symbol);
        setResult(btResult);
        setIsRunning(false);
      }, 50);
    });
  }, [strategy, symbol, timeframe, capital, risk, stopLoss, takeProfit, trailing, trailingPct]);

  // Build equity chart data
  const equityData = result ? result.equity.map((eq, i) => ({
    bar: i,
    equity: Math.round(eq * 100) / 100,
  })) : [];

  // Build monthly returns from trades
  const monthlyReturns = result ? buildMonthlyReturns(result) : [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-n-text">Backtest</h1>
        <p className="text-xs text-n-dim">Testa le strategie su dati storici generati con GBM</p>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="xl:col-span-4 space-y-4">
          <div className="rounded-xl border border-n-border bg-n-card p-4">
            <h3 className="mb-3 text-xs font-semibold text-n-dim">Preset</h3>
            <div className="grid grid-cols-3 gap-2">
              {(['conservative', 'moderate', 'aggressive'] as const).map((p) => (
                <button key={p} onClick={() => applyPreset(p)} className={`rounded-lg py-2 text-[11px] font-semibold transition-all ${preset === p ? 'bg-n-accent-dim text-n-text border border-n-border-b' : 'border border-n-border text-n-dim hover:text-n-text'}`}>
                  {p === 'conservative' ? 'Conservativo' : p === 'moderate' ? 'Moderato' : 'Aggressivo'}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-n-border bg-n-card p-4 space-y-3">
            <h3 className="text-xs font-semibold text-n-dim">Configurazione</h3>
            <div>
              <label className="mb-1 block text-[10px] font-medium text-n-dim">Strategia</label>
              <select value={strategy} onChange={(e) => setStrategy(e.target.value as StrategyKey)} className="w-full rounded-lg border border-n-border bg-n-input px-3 py-2 text-xs text-n-text focus:border-n-border-b focus:outline-none">
                {STRATEGIES.map((s) => (<option key={s.key} value={s.key}>{s.icon} {s.name}</option>))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[10px] font-medium text-n-dim">Asset</label>
                <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="w-full rounded-lg border border-n-border bg-n-input px-3 py-2 text-xs text-n-text focus:border-n-border-b focus:outline-none">
                  {ASSETS.map((a) => (<option key={a.symbol} value={a.symbol}>{a.symbol}</option>))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium text-n-dim">Timeframe</label>
                <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)} className="w-full rounded-lg border border-n-border bg-n-input px-3 py-2 text-xs text-n-text focus:border-n-border-b focus:outline-none">
                  {['1m', '5m', '15m', '1h', '4h', '1d', '1w'].map((t) => (<option key={t} value={t}>{t}</option>))}
                </select>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-n-border bg-n-card p-4 space-y-3">
            <h3 className="text-xs font-semibold text-n-dim">Parametri</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Capitale ($)', value: capital, set: setCapital },
                { label: 'Rischio (%)', value: risk, set: setRisk },
                { label: 'Stop Loss (%)', value: stopLoss, set: setStopLoss },
                { label: 'Take Profit (%)', value: takeProfit, set: setTakeProfit },
              ].map((f) => (
                <div key={f.label}>
                  <label className="mb-1 block text-[10px] font-medium text-n-dim">{f.label}</label>
                  <input type="number" value={f.value} onChange={(e) => f.set(+e.target.value)} step={f.label.includes('$') ? 1000 : 0.5} className="w-full rounded-lg border border-n-border bg-n-input px-3 py-2 font-mono text-xs text-n-text focus:border-n-border-b focus:outline-none" />
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button onClick={() => setTrailing(!trailing)} className={`relative h-5 w-9 rounded-full transition-all ${trailing ? 'bg-green-500' : 'bg-n-border-b'}`}>
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${trailing ? 'left-[18px]' : 'left-0.5'}`} />
                </button>
                <span className="text-[11px] text-n-text-s">Trailing Stop</span>
              </div>
              {trailing && (
                <input type="number" value={trailingPct} onChange={(e) => setTrailingPct(+e.target.value)} step={0.5} className="w-16 rounded-lg border border-n-border bg-n-input px-2 py-1 font-mono text-[11px] text-n-text text-right focus:border-n-border-b focus:outline-none" />
              )}
            </div>
          </div>

          <button onClick={handleRunBacktest} disabled={isRunning} className="flex w-full items-center justify-center gap-2 rounded-xl bg-n-text py-3 text-sm font-bold text-n-bg transition-all hover:opacity-90 disabled:opacity-50">
            {isRunning ? (<><RotateCcw size={15} className="animate-spin" /> Calcolo in corso...</>) : (<><Play size={15} /> Esegui Backtest</>)}
          </button>
        </div>

        <div className="xl:col-span-8 space-y-4">
          {result ? (
            <>
              <div className="rounded-xl border border-n-border bg-n-card p-4">
                <h3 className="mb-3 text-xs font-semibold text-n-dim">
                  Risultati — {STRATEGIES.find((s) => s.key === strategy)?.name} / {symbol} / {timeframe}
                </h3>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                  <Metric label="Return" value={`${result.returnPct >= 0 ? '+' : ''}${result.returnPct.toFixed(1)}%`} color={result.returnPct >= 0 ? 'text-green-400' : 'text-red-400'} />
                  <Metric label="Win Rate" value={`${result.winRate.toFixed(1)}%`} />
                  <Metric label="Sharpe" value={result.sharpeRatio.toFixed(2)} />
                  <Metric label="Sortino" value={result.sortinoRatio.toFixed(2)} />
                  <Metric label="Profit Factor" value={result.profitFactor === Infinity ? '∞' : result.profitFactor.toFixed(2)} />
                  <Metric label="Max DD" value={`${result.maxDrawdown.toFixed(1)}%`} color="text-red-400" />
                  <Metric label="Trades" value={result.totalTrades.toString()} />
                  <Metric label="Wins" value={result.wins.toString()} color="text-green-400" />
                  <Metric label="Losses" value={result.losses.toString()} color="text-red-400" />
                  <Metric label="Avg Win" value={`$${result.avgWin.toFixed(0)}`} color="text-green-400" />
                  <Metric label="Avg Loss" value={`$${result.avgLoss.toFixed(0)}`} color="text-red-400" />
                  <Metric label="Expectancy" value={`$${result.expectancy.toFixed(2)}`} />
                </div>
              </div>

              {/* Equity curve */}
              <div className="rounded-xl border border-n-border bg-n-card p-4">
                <h3 className="mb-3 text-xs font-semibold text-n-dim">Equity Curve</h3>
                <div className="h-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={equityData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="btGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={result.returnPct >= 0 ? '#22c55e' : '#ef4444'} stopOpacity={0.3} />
                          <stop offset="100%" stopColor={result.returnPct >= 0 ? '#22c55e' : '#ef4444'} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="bar" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={(v: number) => `${(v / 1000).toFixed(1)}k`} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={45} />
                      <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, fontFamily: 'IBM Plex Mono' }} formatter={(v: number) => [`$${v.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 'Equity']} />
                      <Area type="monotone" dataKey="equity" stroke={result.returnPct >= 0 ? '#22c55e' : '#ef4444'} strokeWidth={2} fill="url(#btGrad)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Monthly returns */}
              {monthlyReturns.length > 0 && (
                <div className="rounded-xl border border-n-border bg-n-card p-4">
                  <h3 className="mb-3 text-xs font-semibold text-n-dim">Rendimenti per Periodo</h3>
                  <div className="h-[160px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyReturns} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={30} tickFormatter={(v: number) => `${v}%`} />
                        <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, fontFamily: 'IBM Plex Mono' }} formatter={(v: number) => [`${v.toFixed(1)}%`, 'Return']} />
                        <Bar dataKey="return" radius={[4, 4, 0, 0]} fill={accentColor} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Monte Carlo */}
              {result.monteCarlo && (
                <div className="rounded-xl border border-n-border bg-n-card p-4">
                  <h3 className="mb-3 text-xs font-semibold text-n-dim">Monte Carlo ({result.monteCarlo.simulations} simulazioni)</h3>
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
                    <div className="rounded-lg bg-n-bg/60 p-2.5 text-center">
                      <p className={`font-mono text-sm font-bold ${result.monteCarlo.probabilityOfProfit > 0.5 ? 'text-green-400' : 'text-red-400'}`}>
                        {(result.monteCarlo.probabilityOfProfit * 100).toFixed(0)}%
                      </p>
                      <p className="text-[9px] text-n-dim">Prob. Profitto</p>
                    </div>
                    {Object.entries(result.monteCarlo.percentiles).map(([key, val]) => (
                      <div key={key} className="rounded-lg bg-n-bg/60 p-2.5 text-center">
                        <p className={`font-mono text-sm font-bold ${val.final >= capital ? 'text-green-400' : 'text-red-400'}`}>
                          ${val.final.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                        </p>
                        <p className="text-[9px] text-n-dim">{key.toUpperCase()} ({val.maxDD.toFixed(1)}% DD)</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Walk-Forward */}
              {result.walkForward && result.walkForward.windows.length > 0 && (
                <div className="rounded-xl border border-n-border bg-n-card p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-n-dim">Walk-Forward Analysis</h3>
                    <span className={`rounded px-2 py-0.5 font-mono text-[10px] font-bold ${
                      result.walkForward.robustnessPct >= 75 ? 'bg-green-500/15 text-green-400' :
                      result.walkForward.robustnessPct >= 50 ? 'bg-yellow-500/15 text-yellow-400' :
                      'bg-red-500/15 text-red-400'
                    }`}>
                      Robustness: {result.walkForward.robustnessPct.toFixed(0)}%
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-n-border">
                          <th className="px-2 py-2 text-[10px] font-semibold text-n-dim">Window</th>
                          <th className="px-2 py-2 text-[10px] font-semibold text-n-dim">Train WR</th>
                          <th className="px-2 py-2 text-[10px] font-semibold text-n-dim">Test WR</th>
                          <th className="px-2 py-2 text-[10px] font-semibold text-n-dim">Train Ret</th>
                          <th className="px-2 py-2 text-[10px] font-semibold text-n-dim">Test Ret</th>
                          <th className="px-2 py-2 text-[10px] font-semibold text-n-dim">Robust</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.walkForward.windows.map((w) => (
                          <tr key={w.window} className="border-b border-n-border/50">
                            <td className="px-2 py-1.5 font-mono text-xs text-n-text">#{w.window}</td>
                            <td className="px-2 py-1.5 font-mono text-xs text-n-text">{w.trainWinRate.toFixed(1)}%</td>
                            <td className="px-2 py-1.5 font-mono text-xs text-n-text">{w.testWinRate.toFixed(1)}%</td>
                            <td className={`px-2 py-1.5 font-mono text-xs ${w.trainReturn >= 0 ? 'text-green-400' : 'text-red-400'}`}>{w.trainReturn.toFixed(1)}%</td>
                            <td className={`px-2 py-1.5 font-mono text-xs ${w.testReturn >= 0 ? 'text-green-400' : 'text-red-400'}`}>{w.testReturn.toFixed(1)}%</td>
                            <td className="px-2 py-1.5">
                              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${w.robust ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                                {w.robust ? 'YES' : 'NO'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex h-full min-h-[500px] items-center justify-center rounded-xl border border-dashed border-n-border bg-n-card/50">
              <div className="text-center">
                <FlaskIcon />
                <p className="mt-3 text-sm font-semibold text-n-text-s">Configura ed esegui un backtest</p>
                <p className="mt-1 text-xs text-n-dim">Dati OHLCV generati con GBM · Monte Carlo · Walk-Forward</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FlaskIcon() {
  return (
    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-n-accent-dim">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 3h6M12 3v7.4a2 2 0 0 0 .6 1.4l5.1 5.1a2 2 0 0 1 .3 2.4 2 2 0 0 1-1.8 1H7.8a2 2 0 0 1-1.8-1 2 2 0 0 1 .3-2.4l5.1-5.1a2 2 0 0 0 .6-1.4V3" />
      </svg>
    </div>
  );
}

function buildMonthlyReturns(result: BacktestResult) {
  // Divide equity into ~10 chunks and compute return per chunk
  const chunkSize = Math.max(1, Math.floor(result.equity.length / 10));
  const returns: { label: string; return: number }[] = [];

  for (let i = 0; i < result.equity.length; i += chunkSize) {
    const start = result.equity[i];
    const end = result.equity[Math.min(i + chunkSize - 1, result.equity.length - 1)];
    const ret = start > 0 ? ((end - start) / start) * 100 : 0;
    returns.push({ label: `P${returns.length + 1}`, return: Math.round(ret * 10) / 10 });
  }

  return returns;
}

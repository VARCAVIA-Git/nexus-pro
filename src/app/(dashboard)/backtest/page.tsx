'use client';

import { useTradingStore } from '@/stores/trading-store';

const STRATEGIES = [
  { key: 'combined_ai', label: 'Combined AI' },
  { key: 'momentum', label: 'Momentum' },
  { key: 'trend', label: 'Trend Following' },
  { key: 'reversion', label: 'Mean Reversion' },
  { key: 'breakout', label: 'Breakout' },
  { key: 'pattern', label: 'Pattern' },
] as const;

export default function BacktestPage() {
  const { symbol, strategy, setStrategy, config, setConfig, results, isRunning } = useTradingStore();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Backtest</h1>
        <p className="text-nexus-dim">Test strategies against historical data</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Config Panel */}
        <div className="space-y-4 rounded-xl border border-nexus-border bg-nexus-card p-5">
          <h3 className="text-sm font-semibold text-nexus-dim">Configuration</h3>

          <div>
            <label className="mb-1 block text-xs text-nexus-dim">Strategy</label>
            <select
              value={strategy}
              onChange={(e) => setStrategy(e.target.value as typeof strategy)}
              className="w-full rounded-lg border border-nexus-border bg-nexus-bg px-3 py-2 text-sm text-white"
            >
              {STRATEGIES.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-nexus-dim">Capital</label>
              <input
                type="number"
                value={config.capital}
                onChange={(e) => setConfig({ capital: +e.target.value })}
                className="w-full rounded-lg border border-nexus-border bg-nexus-bg px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-nexus-dim">Risk %</label>
              <input
                type="number"
                value={config.riskPerTrade}
                onChange={(e) => setConfig({ riskPerTrade: +e.target.value })}
                className="w-full rounded-lg border border-nexus-border bg-nexus-bg px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-nexus-dim">Stop Loss %</label>
              <input
                type="number"
                value={config.stopLossPct}
                onChange={(e) => setConfig({ stopLossPct: +e.target.value })}
                className="w-full rounded-lg border border-nexus-border bg-nexus-bg px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-nexus-dim">Take Profit %</label>
              <input
                type="number"
                value={config.takeProfitPct}
                onChange={(e) => setConfig({ takeProfitPct: +e.target.value })}
                className="w-full rounded-lg border border-nexus-border bg-nexus-bg px-3 py-2 text-sm text-white"
              />
            </div>
          </div>

          <button
            disabled={isRunning}
            className="w-full rounded-lg bg-nexus-accent px-4 py-2.5 text-sm font-semibold text-nexus-bg transition-colors hover:bg-nexus-accent/80 disabled:opacity-50"
          >
            {isRunning ? 'Running...' : 'Run Backtest'}
          </button>
        </div>

        {/* Results */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl border border-nexus-border bg-nexus-card p-5">
            <h3 className="mb-4 text-sm font-semibold text-nexus-dim">
              Results — {symbol} / {strategy}
            </h3>
            {results ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div><p className="text-xs text-nexus-dim">Return</p><p className="text-lg font-bold text-nexus-green">{results.returnPct.toFixed(2)}%</p></div>
                <div><p className="text-xs text-nexus-dim">Win Rate</p><p className="text-lg font-bold text-white">{results.winRate.toFixed(1)}%</p></div>
                <div><p className="text-xs text-nexus-dim">Sharpe</p><p className="text-lg font-bold text-white">{results.sharpeRatio.toFixed(2)}</p></div>
                <div><p className="text-xs text-nexus-dim">Max DD</p><p className="text-lg font-bold text-nexus-red">{results.maxDrawdown.toFixed(2)}%</p></div>
              </div>
            ) : (
              <div className="flex h-32 items-center justify-center text-nexus-dim">
                Configure and run a backtest to see results
              </div>
            )}
          </div>

          <div className="rounded-xl border border-nexus-border bg-nexus-card p-5">
            <h3 className="mb-4 text-sm font-semibold text-nexus-dim">Equity Curve</h3>
            <div className="flex h-64 items-center justify-center text-nexus-dim">
              {results ? 'Equity curve chart' : 'No data'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

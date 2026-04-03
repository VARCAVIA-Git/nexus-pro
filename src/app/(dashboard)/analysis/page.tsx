'use client';

import { useState } from 'react';
import { useTradingStore } from '@/stores/trading-store';

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'] as const;

export default function AnalysisPage() {
  const { symbol, setSymbol } = useTradingStore();
  const [timeframe, setTimeframe] = useState<string>('1d');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Analysis</h1>
          <p className="text-nexus-dim">Technical analysis & indicators</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            className="rounded-lg border border-nexus-border bg-nexus-bg px-3 py-2 text-sm text-white focus:border-nexus-accent focus:outline-none"
            placeholder="Symbol"
          />
          <div className="flex rounded-lg border border-nexus-border">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  timeframe === tf
                    ? 'bg-nexus-accent/20 text-nexus-accent'
                    : 'text-nexus-dim hover:text-white'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-nexus-border bg-nexus-card p-5">
        <h3 className="mb-2 text-sm font-semibold text-nexus-dim">Price Chart — {symbol}</h3>
        <div className="flex h-[400px] items-center justify-center text-nexus-dim">
          Chart will render here (lightweight-charts)
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-nexus-border bg-nexus-card p-5">
          <h3 className="mb-3 text-sm font-semibold text-nexus-dim">Indicators</h3>
          <div className="space-y-2 text-sm text-nexus-text">
            <div className="flex justify-between"><span>RSI(14)</span><span>—</span></div>
            <div className="flex justify-between"><span>MACD</span><span>—</span></div>
            <div className="flex justify-between"><span>ADX</span><span>—</span></div>
            <div className="flex justify-between"><span>ATR</span><span>—</span></div>
          </div>
        </div>
        <div className="rounded-xl border border-nexus-border bg-nexus-card p-5">
          <h3 className="mb-3 text-sm font-semibold text-nexus-dim">Patterns</h3>
          <div className="flex h-24 items-center justify-center text-nexus-dim text-sm">
            No patterns detected
          </div>
        </div>
        <div className="rounded-xl border border-nexus-border bg-nexus-card p-5">
          <h3 className="mb-3 text-sm font-semibold text-nexus-dim">Signal</h3>
          <div className="flex h-24 items-center justify-center text-nexus-dim text-sm">
            Load data to generate signals
          </div>
        </div>
      </div>
    </div>
  );
}

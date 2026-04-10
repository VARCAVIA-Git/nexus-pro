'use client';

import { useState, useEffect } from 'react';
import type { PriceData } from '@/app/api/prices/route';

export function Ticker() {
  const [prices, setPrices] = useState<PriceData[]>([]);

  useEffect(() => {
    const load = () => fetch('/api/prices').then(r => r.ok ? r.json() : null).then(d => { if (d?.prices) setPrices(d.prices); }).catch(() => {});
    load();
    const i = setInterval(load, 60000);
    return () => clearInterval(i);
  }, []);

  if (prices.length === 0) return null;

  const content = prices.map(p => {
    const up = p.changePct24h >= 0;
    const symbol = p.symbol.replace('/USD', '');
    return `${symbol} $${p.price.toLocaleString('en-US', { minimumFractionDigits: p.price < 10 ? 2 : 0, maximumFractionDigits: p.price < 10 ? 2 : 0 })} ${up ? '▲' : '▼'}${up ? '+' : ''}${p.changePct24h.toFixed(1)}%`;
  }).join('  │  ');

  return (
    <div className="h-10 overflow-hidden bg-n-bg-s border-b border-n-border/50">
      <div className="ticker-wrap h-full flex items-center">
        <div className="ticker-content whitespace-nowrap font-mono text-[13px]">
          {[0, 1].map(i => (
            <span key={i} className="inline-block">
              {prices.map((p, j) => {
                const up = p.changePct24h >= 0;
                return (
                  <span key={`${i}-${j}`}>
                    <span className="font-bold text-n-text-s">{p.symbol.replace('/USD', '')}</span>
                    <span className="mx-1.5 text-n-text">${p.price.toLocaleString('en-US', { minimumFractionDigits: p.price < 10 ? 2 : 0, maximumFractionDigits: p.price < 10 ? 2 : 0 })}</span>
                    <span className={up ? 'text-n-green' : 'text-n-red'}>{up ? '▲' : '▼'}{up ? '+' : ''}{p.changePct24h.toFixed(1)}%</span>
                    <span className="mx-4 text-n-border-b">│</span>
                  </span>
                );
              })}
            </span>
          ))}
        </div>
      </div>
      <style jsx>{`
        .ticker-wrap { overflow: hidden; }
        .ticker-content { display: inline-block; animation: marquee 60s linear infinite; }
        @keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
      `}</style>
    </div>
  );
}

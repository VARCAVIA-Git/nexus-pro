'use client';

import { useEffect, useState } from 'react';

/** Polls /api/prices/symbol every 10s for a single asset's live price. */
export function useLivePrice(symbol: string): { price: number | null; updatedAt: number | null } {
  const [data, setData] = useState<{ price: number | null; updatedAt: number | null }>({ price: null, updatedAt: null });

  useEffect(() => {
    if (!symbol) return;
    const fetchPrice = async () => {
      try {
        const sym = symbol.replace('/', '%2F');
        const res = await fetch(`/api/prices/symbol?symbol=${sym}`);
        if (res.ok) {
          const d = await res.json();
          if (typeof d.price === 'number') {
            setData({ price: d.price, updatedAt: Date.now() });
          }
        }
      } catch {}
    };
    fetchPrice();
    const interval = setInterval(fetchPrice, 10000);
    return () => clearInterval(interval);
  }, [symbol]);

  return data;
}

/** Polls /api/prices/batch every 15s for multiple assets. */
export function useBatchPrices(symbols: string[]): Map<string, number> {
  const [prices, setPrices] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (symbols.length === 0) return;
    const fetchPrices = async () => {
      try {
        const res = await fetch('/api/prices/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbols }),
        });
        if (res.ok) {
          const d = await res.json();
          setPrices(new Map(Object.entries(d.prices ?? {})));
        }
      } catch {}
    };
    fetchPrices();
    const interval = setInterval(fetchPrices, 15000);
    return () => clearInterval(interval);
  }, [symbols.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  return prices;
}

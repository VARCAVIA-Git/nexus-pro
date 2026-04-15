'use client';

import { useEffect, useState } from 'react';
import { Wifi, Brain, RadioTower, Clock } from 'lucide-react';

interface Props {
  priceUpdatedAt: number | null;
  contextUpdatedAt: number | null;
  aicOnline: boolean;
  lastTrainedAt: number | null;
  nextRefreshAt: number | null;
}

function freshnessColor(ageMs: number | null, thresholds: [number, number]): string {
  if (ageMs === null) return 'text-n-dim';
  if (ageMs < thresholds[0]) return 'text-emerald-400';
  if (ageMs < thresholds[1]) return 'text-amber-400';
  return 'text-red-400';
}

function freshnessLabel(ageMs: number | null): string {
  if (ageMs === null) return '—';
  const sec = Math.floor(ageMs / 1000);
  if (sec < 10) return 'ora';
  if (sec < 60) return `${sec}s fa`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m fa`;
  const hrs = Math.floor(min / 60);
  return `${hrs}h fa`;
}

export function DataFreshnessBar({ priceUpdatedAt, contextUpdatedAt, aicOnline, lastTrainedAt, nextRefreshAt }: Props) {
  // Force re-render every 5s to keep timestamps current
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 5000);
    return () => clearInterval(id);
  }, []);

  const now = Date.now();
  const priceAge = priceUpdatedAt ? now - priceUpdatedAt : null;
  const contextAge = contextUpdatedAt ? now - contextUpdatedAt : null;
  const trainAge = lastTrainedAt ? now - lastTrainedAt : null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg bg-n-bg-s px-3 py-2 text-[10px]">
      <div className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${priceAge !== null && priceAge < 15000 ? 'bg-emerald-400 animate-pulse' : 'bg-n-dim'}`} />
        <span className="text-n-dim">Prezzo:</span>
        <span className={freshnessColor(priceAge, [15000, 60000])}>{freshnessLabel(priceAge)}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <RadioTower size={10} className={freshnessColor(contextAge, [120000, 600000])} />
        <span className="text-n-dim">Contesto:</span>
        <span className={freshnessColor(contextAge, [120000, 600000])}>{freshnessLabel(contextAge)}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Wifi size={10} className={aicOnline ? 'text-emerald-400' : 'text-red-400'} />
        <span className="text-n-dim">AIC:</span>
        <span className={aicOnline ? 'text-emerald-400' : 'text-red-400'}>{aicOnline ? 'online' : 'offline'}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Brain size={10} className={freshnessColor(trainAge, [7200000, 86400000])} />
        <span className="text-n-dim">Training:</span>
        <span className={freshnessColor(trainAge, [7200000, 86400000])}>{freshnessLabel(trainAge)}</span>
      </div>
      {nextRefreshAt && nextRefreshAt > now && (
        <div className="flex items-center gap-1.5">
          <Clock size={10} className="text-n-dim" />
          <span className="text-n-dim">Prossimo: tra {freshnessLabel(now - nextRefreshAt).replace(' fa', '')}</span>
        </div>
      )}
    </div>
  );
}

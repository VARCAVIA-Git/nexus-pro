'use client';

import { useState, useEffect } from 'react';
import { fmtPercent } from '@/lib/utils/format';
import type { KnowledgeEntry } from '@/lib/engine/rnd/knowledge-base';
import {
  Database, RefreshCw, Play, Zap, FlaskConical, BookOpen,
  TrendingUp, AlertTriangle, CheckCircle, BarChart3,
} from 'lucide-react';
import Link from 'next/link';

const CONFIDENCE_COLORS: Record<string, string> = {
  low: 'bg-red-500/15 text-red-400',
  medium: 'bg-yellow-500/15 text-yellow-400',
  high: 'bg-green-500/10 text-green-400',
  very_high: 'bg-green-500/20 text-green-400',
};

const CATEGORY_ICONS: Record<string, string> = {
  indicator: '📊', pattern: '🔍', event: '📅', strategy: '🤖', combination: '🔗',
};

export default function RnDPage() {
  const [warehouseStatus, setWarehouseStatus] = useState<any>(null);
  const [knowledgeCount, setKnowledgeCount] = useState(0);
  const [knowledge, setKnowledge] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [assetFilter, setAssetFilter] = useState<string>('all');

  const fetchStatus = async () => {
    try {
      const [statusRes, kbRes] = await Promise.all([
        fetch('/api/rnd?action=status'),
        fetch('/api/rnd?action=knowledge'),
      ]);
      if (statusRes.ok) {
        const d = await statusRes.json();
        setWarehouseStatus(d.warehouse);
        setKnowledgeCount(d.knowledgeEntries);
      }
      if (kbRes.ok) {
        const d = await kbRes.json();
        setKnowledge(d.knowledge ?? []);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchStatus(); }, []);

  const handleDownload = async () => {
    setDownloading(true);
    setScanResult(null);
    try {
      await fetch('/api/rnd', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'warehouse' }) });
      setScanResult('Download warehouse avviato — controlla i log del server');
    } catch (e: any) { setScanResult(`Errore: ${e.message}`); }
    setDownloading(false);
    setTimeout(fetchStatus, 5000);
  };

  const handleScan = async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const res = await fetch('/api/rnd', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'scan' }) });
      const d = await res.json();
      setScanResult(`Scansione completata: ${d.knowledge ?? 0} findings da ${d.assets ?? 0} asset`);
      await fetchStatus();
    } catch (e: any) { setScanResult(`Errore: ${e.message}`); }
    setScanning(false);
  };

  const filteredKB = knowledge.filter(k => {
    if (filter !== 'all' && k.category !== filter) return false;
    if (assetFilter !== 'all' && k.asset !== assetFilter) return false;
    return true;
  });

  const assets = [...new Set(knowledge.map(k => k.asset))];

  if (loading) return <div className="flex items-center justify-center py-20"><RefreshCw size={24} className="animate-spin text-n-dim" /></div>;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-n-text">R&D Lab</h1>
          <p className="text-xs text-n-dim">Ricerca storica per ottimizzare i bot — {knowledgeCount} scoperte</p>
        </div>
        <div className="flex gap-2 self-start">
          <button onClick={handleDownload} disabled={downloading} className="flex items-center gap-1.5 rounded-lg border border-n-border px-3 py-1.5 text-xs text-n-dim hover:text-n-text transition-colors disabled:opacity-50">
            <Database size={12} className={downloading ? 'animate-spin' : ''} /> {downloading ? 'Scaricando...' : 'Aggiorna Dati'}
          </button>
          <button onClick={handleScan} disabled={scanning} className="flex items-center gap-1.5 rounded-lg bg-n-text px-3 py-1.5 text-xs font-bold text-n-bg hover:opacity-90 disabled:opacity-50">
            <FlaskConical size={12} className={scanning ? 'animate-spin' : ''} /> {scanning ? 'Analisi...' : 'Scansione Completa'}
          </button>
        </div>
      </div>

      {scanResult && (
        <div className="flex items-center gap-2 rounded-lg border border-n-border bg-n-card px-4 py-2">
          <CheckCircle size={14} className="text-green-400" />
          <p className="text-xs text-n-text">{scanResult}</p>
        </div>
      )}

      {/* Warehouse status */}
      <div className="rounded-xl border border-n-border bg-n-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <Database size={14} className="text-n-text-s" />
          <h2 className="text-xs font-bold text-n-text">Data Warehouse</h2>
          {warehouseStatus?.inProgress && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-400">In corso: {warehouseStatus.currentAsset}</span>}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-n-bg/60 p-2.5 text-center">
            <p className="font-mono text-lg font-bold text-n-text">{warehouseStatus?.items?.length ?? 0}</p>
            <p className="text-[9px] text-n-dim">Dataset Caricati</p>
          </div>
          <div className="rounded-lg bg-n-bg/60 p-2.5 text-center">
            <p className="font-mono text-lg font-bold text-n-text">{warehouseStatus?.items?.reduce((s: number, i: any) => s + (i.candles ?? 0), 0) ?? 0}</p>
            <p className="text-[9px] text-n-dim">Candele Totali</p>
          </div>
          <div className="rounded-lg bg-n-bg/60 p-2.5 text-center">
            <p className="font-mono text-lg font-bold text-n-text">{knowledgeCount}</p>
            <p className="text-[9px] text-n-dim">Knowledge Entries</p>
          </div>
        </div>
      </div>

      {/* Knowledge Base */}
      <div className="rounded-xl border border-n-border bg-n-card">
        <div className="border-b border-n-border px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <BookOpen size={14} className="text-n-text-s" />
            <h2 className="text-xs font-bold text-n-text">Knowledge Base ({filteredKB.length})</h2>
          </div>
          <div className="flex gap-2">
            <select value={assetFilter} onChange={e => setAssetFilter(e.target.value)} className="rounded border border-n-border bg-n-input px-2 py-1 text-[10px] text-n-text">
              <option value="all">Tutti gli asset</option>
              {assets.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <select value={filter} onChange={e => setFilter(e.target.value)} className="rounded border border-n-border bg-n-input px-2 py-1 text-[10px] text-n-text">
              <option value="all">Tutte le categorie</option>
              <option value="indicator">Indicatori</option>
              <option value="pattern">Pattern</option>
              <option value="event">Eventi</option>
              <option value="strategy">Strategie</option>
              <option value="combination">Combinazioni</option>
            </select>
          </div>
        </div>

        {filteredKB.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <FlaskConical size={32} className="text-n-dim mb-3" />
            <p className="text-sm font-semibold text-n-text-s">Nessuna scoperta</p>
            <p className="mt-1 text-xs text-n-dim">Avvia "Scansione Completa" per analizzare i dati storici.</p>
          </div>
        ) : (
          <div className="max-h-[500px] overflow-y-auto">
            {filteredKB.slice(0, 50).map(k => (
              <div key={k.id} className="flex items-start gap-3 border-b border-n-border/50 px-4 py-3 transition-colors hover:bg-n-card-h">
                <span className="mt-0.5 text-sm">{CATEGORY_ICONS[k.category] ?? '📌'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[10px] font-bold text-n-text-s">{k.asset}</span>
                    <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-bold ${CONFIDENCE_COLORS[k.confidence]}`}>{k.confidence}</span>
                    {k.actionable && <span className="rounded bg-green-500/10 px-1 py-0.5 text-[8px] font-bold text-green-400">ACTIONABLE</span>}
                  </div>
                  <p className="mt-0.5 text-[11px] text-n-text leading-snug">{k.finding}</p>
                  <p className="mt-0.5 text-[9px] text-n-dim">{k.recommendation}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`font-mono text-[11px] font-bold ${k.winRate > 0.6 ? 'text-green-400' : k.winRate < 0.4 ? 'text-red-400' : 'text-n-text'}`}>
                    {(k.winRate * 100).toFixed(0)}%
                  </p>
                  <p className="text-[8px] text-n-dim">{k.sampleSize} samples</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

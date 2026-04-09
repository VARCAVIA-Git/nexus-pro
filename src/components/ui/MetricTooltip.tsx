'use client';

import { ReactNode, useState } from 'react';
import { GLOSSARY, GlossaryEntry } from '@/lib/analytics/glossary';

interface MetricTooltipProps {
  term: keyof typeof GLOSSARY | string;
  children: ReactNode;
  className?: string;
}

/**
 * Wrapper hover tooltip che mostra una definizione dal glossario.
 * Usage: <MetricTooltip term="PF"><span>1.84</span></MetricTooltip>
 *
 * Tooltip via Tailwind + state, niente librerie esterne.
 */
export function MetricTooltip({ term, children, className = '' }: MetricTooltipProps) {
  const [open, setOpen] = useState(false);
  const entry: GlossaryEntry | undefined = GLOSSARY[term as keyof typeof GLOSSARY];

  if (!entry) {
    return <>{children}</>;
  }

  return (
    <span
      className={`relative inline-block cursor-help underline decoration-dotted decoration-n-dim/50 underline-offset-2 ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      tabIndex={0}
      title={entry.long}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          className="pointer-events-none absolute left-1/2 z-50 mt-1 w-64 -translate-x-1/2 rounded-lg border border-n-border bg-n-bg-s p-2.5 text-[11px] font-normal leading-snug text-n-text shadow-xl"
        >
          <span className="block text-[10px] font-bold uppercase tracking-wide text-blue-300">
            {entry.short}
          </span>
          <span className="mt-1 block text-n-text">{entry.long}</span>
        </span>
      )}
    </span>
  );
}

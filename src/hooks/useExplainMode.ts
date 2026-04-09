'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'nexus:ui:explain-mode';

/**
 * Hook che persiste la modalità "Spiega" in localStorage.
 * Quando true, le card mostrano una riga sotto l'header con la
 * GLOSSARY[section].long per aiutare l'utente non esperto.
 */
export function useExplainMode(): [boolean, () => void] {
  const [enabled, setEnabled] = useState<boolean>(false);

  // Bootstrap dal localStorage al mount (client-side only)
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(STORAGE_KEY);
      if (v === '1') setEnabled(true);
    } catch {
      /* ignore — SSR or storage disabled */
    }
  }, []);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return [enabled, toggle];
}

'use client';

import { useEffect } from 'react';
import { useModeStore } from '@/stores/mode-store';

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const mode = useModeStore((s) => s.mode);

  useEffect(() => {
    document.documentElement.setAttribute('data-mode', mode);
  }, [mode]);

  return <>{children}</>;
}

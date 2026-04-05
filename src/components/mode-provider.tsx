'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { getThemeFromPath } from '@/stores/mode-store';

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    const theme = getThemeFromPath(pathname);
    document.documentElement.setAttribute('data-mode', theme);
  }, [pathname]);

  return <>{children}</>;
}

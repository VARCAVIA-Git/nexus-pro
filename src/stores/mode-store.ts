import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type TradingMode = 'demo' | 'real';
export type ThemeMode = 'demo' | 'real' | 'neutral';

interface ModeState {
  /** Which environment the bot targets (used in Strategy page) */
  targetEnv: TradingMode;
  setTargetEnv: (m: TradingMode) => void;
  toggleTargetEnv: () => void;
}

export const useModeStore = create<ModeState>()(
  persist(
    (set) => ({
      targetEnv: 'demo',
      setTargetEnv: (targetEnv) => set({ targetEnv }),
      toggleTargetEnv: () =>
        set((s) => ({ targetEnv: s.targetEnv === 'demo' ? 'real' : 'demo' })),
    }),
    { name: 'nexus-mode' },
  ),
);

/** Derive theme mode from the current pathname */
export function getThemeFromPath(pathname: string): ThemeMode {
  if (pathname.startsWith('/demo')) return 'demo';
  if (pathname.startsWith('/real')) return 'real';
  return 'neutral';
}

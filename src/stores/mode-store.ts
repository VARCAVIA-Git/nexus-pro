import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type TradingMode = 'demo' | 'real';

interface ModeState {
  mode: TradingMode;
  setMode: (m: TradingMode) => void;
  toggle: () => void;
}

export const useModeStore = create<ModeState>()(
  persist(
    (set) => ({
      mode: 'demo',
      setMode: (mode) => set({ mode }),
      toggle: () => set((s) => ({ mode: s.mode === 'demo' ? 'real' : 'demo' })),
    }),
    { name: 'nexus-mode' },
  ),
);

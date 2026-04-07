import { redirect } from 'next/navigation';

// Legacy /backtest used synthetic GBM data — replaced by /backtester
// which fetches real Alpaca market data with multi-asset money management.
export default function Page() {
  redirect('/backtester');
}

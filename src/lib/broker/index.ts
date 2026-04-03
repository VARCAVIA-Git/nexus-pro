export type { BrokerAdapter } from './base';
export { PaperBroker } from './paper';
export { BinanceBroker } from './binance';
export { AlpacaBroker } from './alpaca';

import type { BrokerType } from '@/types';
import type { BrokerAdapter } from './base';
import { PaperBroker } from './paper';
import { BinanceBroker } from './binance';
import { AlpacaBroker } from './alpaca';

export function createBroker(type: BrokerType, config?: Record<string, string>): BrokerAdapter {
  switch (type) {
    case 'paper':
      return new PaperBroker(Number(config?.balance) || 10000);
    case 'binance':
      return new BinanceBroker(config?.apiKey ?? '', config?.apiSecret ?? '', config?.testnet !== 'false');
    case 'alpaca':
      return new AlpacaBroker(config?.apiKey ?? '', config?.apiSecret ?? '', config?.paper !== 'false');
    default:
      throw new Error(`Unsupported broker: ${type}`);
  }
}

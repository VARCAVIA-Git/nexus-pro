import { Alpaca } from '@alpacahq/alpaca-trade-api';
import { env } from '$env/dynamic/private';

export const initBrokerPipeline = () => {
  const alpaca = new Alpaca({
    keyId: env.ALPACA_API_KEY,
    secretKey: env.ALPACA_SECRET_KEY,
    paper: true // Safety first - paper trading until approval
  });

  return {
    getMarketData: async (symbol: string) => {
      return alpaca.getBarset(symbol, '1Day', { timeframe: '1Day' });
    },
    streamOrders: () => alpaca.getOrders()
  };
};
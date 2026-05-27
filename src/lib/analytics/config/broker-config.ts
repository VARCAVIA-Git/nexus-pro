// Broker configuration
export const BROKER_CONFIG = {
  alpaca: {
    paperApiKey: process.env.APCA_PAPER_API_KEY,
    paperSecret: process.env.APCA_PAPER_SECRET_KEY
  },
  binance: {
    apiKey: process.env.BINANCE_API_KEY,
    secret: process.env.BINANCE_SECRET
  }
}

// Data pipeline config
export const DATA_PIPELINE = {
  sources: ['alpaca', 'binance', 'twelve_data']
}
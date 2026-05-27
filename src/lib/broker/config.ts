export const ALPACA_CONFIG = {
  API_KEY: process.env.ALPACA_API_KEY!,
  SECRET_KEY: process.env.ALPACA_SECRET_KEY!,
  BASE_URL: process.env.NODE_ENV === 'production' ? 'https://paper-api.alpaca.markets' : 'https://paper-api.alpaca.markets',
  USE_SANDBOX: true
}

// Add type definitions for Alpaca API responses
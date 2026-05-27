export const BROKER_CONFIG = {
  alpaca: {
    apiKey: process.env.APCA_API_KEY_ID!,
    secretKey: process.env.APCA_API_SECRET_KEY!,
    endpoint: process.env.APCA_API_BASE_URL || 'https://paper-api.alpaca.markets'
  }
}

// TODO: Add Redis/Supabase connection config
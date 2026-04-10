/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },
  redirects: async () => [
    { source: '/assets', destination: '/analisi', permanent: true },
    { source: '/assets/:path*', destination: '/analisi/:path*', permanent: true },
    { source: '/strategy', destination: '/bot', permanent: true },
    { source: '/mines', destination: '/bot', permanent: true },
  ],
  headers: async () => [
    {
      source: '/api/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-XSS-Protection', value: '1; mode=block' },
        { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      ],
    },
  ],
};
export default nextConfig;

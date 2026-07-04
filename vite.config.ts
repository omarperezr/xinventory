import { defineConfig, Plugin } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

// In production /api/usdt-rate is a Vercel serverless function (api/usdt-rate.ts).
// This middleware provides the same endpoint under `vite dev`, where Vercel
// functions don't run. Server-side fetch avoids Binance's CORS/Cloudflare block.
function usdtRateDevEndpoint(): Plugin {
  return {
    name: 'dev-usdt-rate',
    configureServer(server) {
      server.middlewares.use('/api/usdt-rate', async (_req, res) => {
        try {
          const response = await fetch(
            'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              },
              body: JSON.stringify({
                fiat: 'VES',
                asset: 'USDT',
                tradeType: 'SELL',
                page: 1,
                rows: 5,
                payTypes: [
                  'PagoMovil',
                  'Transferencia Bancaria',
                  'Transferencia con banco especifico',
                  'Banco de Venezuela',
                  'Mercantil',
                ],
                countries: [],
                publisherType: null,
              }),
            },
          )
          const data: any = await response.json()
          const prices = (data?.data ?? [])
            .map((ad: any) => parseFloat(ad?.adv?.price))
            .filter((p: number) => Number.isFinite(p) && p > 0)
          if (data?.code !== '000000' || prices.length === 0) {
            res.statusCode = 502
            res.end(JSON.stringify({ error: 'No rate available' }))
            return
          }
          const avg =
            Math.round(
              (prices.reduce((s: number, p: number) => s + p, 0) / prices.length) * 100,
            ) / 100
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ usdt: avg }))
        } catch (e: any) {
          res.statusCode = 502
          res.end(JSON.stringify({ error: e?.message || 'fetch failed' }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [
    usdtRateDevEndpoint(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          charts: ['recharts'],
        },
      },
    },
  },
})

// Vercel serverless function: returns the average Binance P2P VES/USDT rate.
// The Binance P2P API blocks browser requests (no CORS + Cloudflare), so the
// frontend calls this endpoint instead. "tasa_liquidacion" = SELL side (ads
// from people BUYING your USDT for bolivares) - that's the default returned.

const BINANCE_P2P_URL =
  "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search";

const PAY_TYPES = [
  "PagoMovil",
  "Transferencia Bancaria",
  "Transferencia con banco especifico",
  "Banco de Venezuela",
  "Mercantil",
];

async function fetchP2pAverage(
  tradeType: "BUY" | "SELL",
  rows = 5,
): Promise<number | null> {
  const response = await fetch(BINANCE_P2P_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // User-Agent is required to avoid Cloudflare's HTTP 403
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
    body: JSON.stringify({
      fiat: "VES",
      asset: "USDT",
      tradeType,
      page: 1,
      rows,
      payTypes: PAY_TYPES,
      countries: [],
      publisherType: null,
    }),
  });
  if (!response.ok) return null;

  const data = await response.json();
  if (data?.code !== "000000" || !Array.isArray(data?.data) || data.data.length === 0) {
    return null;
  }

  const prices = data.data
    .map((ad: any) => parseFloat(ad?.adv?.price))
    .filter((p: number) => Number.isFinite(p) && p > 0);
  if (prices.length === 0) return null;

  const avg = prices.reduce((s: number, p: number) => s + p, 0) / prices.length;
  return Math.round(avg * 100) / 100;
}

export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  try {
    // tasa_liquidacion: SELL side - used as the USDT price.
    const rate = await fetchP2pAverage("SELL", 5);
    if (rate === null) {
      res.status(502).json({ error: "No se pudo obtener la tasa de Binance P2P" });
      return;
    }
    res.status(200).json({ usdt: rate });
  } catch (e: any) {
    res.status(502).json({ error: e?.message || "Error consultando Binance P2P" });
  }
}

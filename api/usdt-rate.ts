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

  const prices: number[] = data.data
    .map((ad: unknown) => parseFloat(readAdvertisedPrice(ad) ?? ""))
    .filter((p: number) => Number.isFinite(p) && p > 0);
  if (prices.length === 0) return null;

  const avg = prices.reduce((s: number, p: number) => s + p, 0) / prices.length;
  return Math.round(avg * 100) / 100;
}

/** Reads adv.price out of one P2P advert without trusting the payload shape. */
function readAdvertisedPrice(ad: unknown): string | undefined {
  if (!ad || typeof ad !== "object") return undefined;
  const adv = (ad as { adv?: unknown }).adv;
  if (!adv || typeof adv !== "object") return undefined;
  const price = (adv as { price?: unknown }).price;
  return typeof price === "string" || typeof price === "number"
    ? String(price)
    : undefined;
}

/**
 * Minimal shape of the serverless request/response this endpoint touches, so
 * the handler is typed without pulling in the platform's type package.
 */
interface RateResponse {
  setHeader(name: string, value: string): void;
  status(code: number): { json(body: unknown): void };
}

export default async function handler(_req: unknown, res: RateResponse) {
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  try {
    // tasa_liquidacion: SELL side - used as the USDT price.
    const rate = await fetchP2pAverage("SELL", 5);
    if (rate === null) {
      res.status(502).json({ error: "No se pudo obtener la tasa de Binance P2P" });
      return;
    }
    res.status(200).json({ usdt: rate });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Error consultando Binance P2P";
    res.status(502).json({ error: message });
  }
}

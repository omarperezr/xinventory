const ALCAMBIO_GRAPHQL_URL = "https://api.alcambio.app/graphql";

// Fetches the average Binance P2P VES/USDT liquidation rate (SELL side) via
// our serverless proxy — Binance's API can't be called from the browser.
export async function fetchUsdtRate(): Promise<number | null> {
  const response = await fetch("/api/usdt-rate");
  if (!response.ok) throw new Error(`USDT rate API error: ${response.status}`);
  const data = await response.json();
  const rate = Number(data?.usdt);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

const GET_COUNTRY_CONVERSIONS_QUERY = `
  query getCountryConversions($countryCode: String!, $dateSearch: DateSearchInput) {
    getCountryConversions(
      payload: { countryCode: $countryCode }
      dateSearch: $dateSearch
    ) {
      conversionRates {
        rateCurrency {
          code
        }
        baseValue
      }
    }
  }
`;

interface ConversionRate {
  rateCurrency: { code: string };
  baseValue: number;
}

// Fetches today's Bs/USD and Bs/EUR rates from Alcambio. Uses the highest
// reported USD value (multiple BCV fee entries can exist for the same day).
export async function fetchVenezuelaConversionRates(): Promise<{
  usd: number;
  eur: number;
} | null> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const response = await fetch(ALCAMBIO_GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operationName: "getCountryConversions",
      query: GET_COUNTRY_CONVERSIONS_QUERY,
      variables: {
        countryCode: "VE",
        dateSearch: {
          startDate: start.getTime(),
          endDate: end.getTime(),
          filterByField: "dateBcvFees",
        },
      },
    }),
  });
  if (!response.ok) throw new Error(`Alcambio API error: ${response.status}`);

  const { data, errors } = await response.json();
  if (errors?.length) throw new Error(errors[0].message);

  const rates: ConversionRate[] =
    data?.getCountryConversions?.conversionRates || [];
  if (rates.length === 0) return null;

  const usdRates = rates.filter((r) => r.rateCurrency?.code === "USD");
  const eurRates = rates.filter((r) => r.rateCurrency?.code === "EUR");
  if (usdRates.length === 0 || eurRates.length === 0) return null;

  const usd = parseFloat(Math.max(...usdRates.map((r) => r.baseValue)).toFixed(2));
  const eur = parseFloat(Math.max(...eurRates.map((r) => r.baseValue)).toFixed(2));
  return { usd, eur };
}

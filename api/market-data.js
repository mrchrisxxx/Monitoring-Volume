const REKU_MARKETS_URL = "https://reku.id/markets";
const INDODAX_TICKERS_URL = "https://indodax.com/api/tickers";
const TOKOCRYPTO_TICKERS_URL = "https://www.tokocrypto.site/api/v3/ticker/24hr";

const REQUEST_TIMEOUT_MS = 12000;

function toBillions(value) {
  return Number(value || 0) / 1_000_000_000;
}

function nowIso() {
  return new Date().toISOString();
}

async function fetchWithTimeout(url, responseType = "json") {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        "user-agent": "Reku Treasury Volume Dashboard/1.0",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`${url} returned ${response.status}`);
    }

    return responseType === "text" ? response.text() : response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseRekuMarketsPage(html) {
  const marker = '<script id="__NEXT_DATA__" type="application/json">';
  const start = html.indexOf(marker);

  if (start < 0) {
    throw new Error("Reku market JSON was not found");
  }

  const jsonStart = start + marker.length;
  const jsonEnd = html.indexOf("</script>", jsonStart);
  const json = JSON.parse(html.slice(jsonStart, jsonEnd));
  const markets = json?.props?.pageProps?.initialState?.markets?.markets || [];

  return markets
    .filter((item) => item?.code && Number(item?.price?.volume) > 0)
    .map((item) => ({
      asset: item.code,
      name: item.name,
      reku: toBillions(item.price.volume),
      rekuRaw: Number(item.price.volume),
    }))
    .sort((a, b) => b.rekuRaw - a.rekuRaw)
    .slice(0, 10);
}

async function getRekuTopRows() {
  const html = await fetchWithTimeout(REKU_MARKETS_URL, "text");
  return parseRekuMarketsPage(html);
}

async function getIndodaxVolumes(assets) {
  const data = await fetchWithTimeout(INDODAX_TICKERS_URL);
  const tickers = data?.tickers || {};
  const firstTicker = Object.values(tickers)[0];

  return {
    refreshedAt: firstTicker?.server_time
      ? new Date(Number(firstTicker.server_time) * 1000).toISOString()
      : nowIso(),
    volumes: Object.fromEntries(
      assets.map((asset) => {
        const ticker = tickers[`${asset.toLowerCase()}_idr`];
        return [asset, toBillions(ticker?.vol_idr)];
      })
    ),
  };
}

async function getTokocryptoVolumes(assets) {
  const data = await fetchWithTimeout(TOKOCRYPTO_TICKERS_URL);
  const rows = Array.isArray(data) ? data : data?.value || [];
  const bySymbol = new Map(rows.map((item) => [item.symbol, item]));
  const relevantTickers = assets.map((asset) => bySymbol.get(`${asset}IDR`)).filter(Boolean);
  const latestCloseTime = Math.max(...relevantTickers.map((item) => Number(item.closeTime || 0)));

  return {
    refreshedAt: latestCloseTime > 0
      ? new Date(latestCloseTime).toISOString()
      : nowIso(),
    volumes: Object.fromEntries(
      assets.map((asset) => {
        const ticker = bySymbol.get(`${asset}IDR`);
        return [asset, toBillions(ticker?.quoteVolume)];
      })
    ),
  };
}

function mergeRows(rekuRows, indodaxVolumes, tokocryptoVolumes) {
  return rekuRows.map(({ rekuRaw, ...row }) => ({
    ...row,
    indodax: indodaxVolumes[row.asset] || 0,
    tokocrypto: tokocryptoVolumes[row.asset] || 0,
  }));
}

module.exports = async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  if (request.method !== "GET") {
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  const errors = [];

  try {
    const rekuRows = await getRekuTopRows();
    const assets = rekuRows.map((row) => row.asset);

    const [indodaxResult, tokocryptoResult] = await Promise.allSettled([
      getIndodaxVolumes(assets),
      getTokocryptoVolumes(assets),
    ]);

    if (indodaxResult.status === "rejected") {
      errors.push({ exchange: "indodax", message: indodaxResult.reason.message });
    }

    if (tokocryptoResult.status === "rejected") {
      errors.push({ exchange: "tokocrypto", message: tokocryptoResult.reason.message });
    }

    const indodax = indodaxResult.status === "fulfilled" ? indodaxResult.value : { volumes: {}, refreshedAt: null };
    const tokocrypto =
      tokocryptoResult.status === "fulfilled" ? tokocryptoResult.value : { volumes: {}, refreshedAt: null };

    response.status(200).json({
      source: "live",
      generatedAt: nowIso(),
      lastRefresh: {
        reku: nowIso(),
        indodax: indodax.refreshedAt,
        tokocrypto: tokocrypto.refreshedAt,
      },
      rows: mergeRows(rekuRows, indodax.volumes, tokocrypto.volumes),
      errors,
    });
  } catch (error) {
    response.status(502).json({
      source: "error",
      generatedAt: nowIso(),
      error: error.message,
      rows: [],
      errors,
    });
  }
};

const REFRESH_INTERVAL_SECONDS = 60;
const RING_CIRCUMFERENCE = 326.73;

// ===============================
// API URL
// ===============================

const REKU_API_URL = "https://api.reku.id/v2/price";
const INDODAX_TICKERS_URL = "https://indodax.com/api/tickers";
const TOKOCRYPTO_TICKERS_URL =
  "https://www.tokocrypto.site/api/v3/ticker/24hr";

// ===============================
// FALLBACK DATA
// ===============================

const fallbackRows = [
  {
    asset: "USDT",
    name: "Tether",
    indodax: 155.52,
    reku: 45.45,
    tokocrypto: 36.99,
  },
  {
    asset: "BTC",
    name: "Bitcoin",
    indodax: 12.96,
    reku: 3.94,
    tokocrypto: 2.68,
  },
];

let currentRows = [...fallbackRows];

// ===============================
// ELEMENTS
// ===============================

const elements = {
  body: document.querySelector("#volume-table-body"),

  lastRefresh: {
    indodax: document.querySelector(
      "#last-refresh-indodax"
    ),

    reku: document.querySelector(
      "#last-refresh-reku"
    ),

    tokocrypto: document.querySelector(
      "#last-refresh-tokocrypto"
    ),
  },
};

// ===============================
// HELPERS
// ===============================

function toBillions(value) {
  return Number(value || 0) / 1000000000;
}

function formatVolume(value) {
  return `${Number(value || 0).toFixed(2)} b`;
}

function formatTime(date = new Date()) {
  return `${new Intl.DateTimeFormat(
    "en-GB",
    {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }
  ).format(date)} WIB`;
}

async function fetchJson(url) {
  const response = await fetch(
    `${url}?t=${Date.now()}`,
    {
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(
      `Request failed: ${response.status}`
    );
  }

  return response.json();
}

// ===============================
// TABLE RENDER
// ===============================

function renderTable(rows) {
  elements.body.innerHTML = rows
    .map((row) => {
      return `
        <tr>
          <td>${row.asset}</td>
          <td>${formatVolume(
            row.indodax
          )}</td>
          <td>${formatVolume(
            row.reku
          )}</td>
          <td>${formatVolume(
            row.tokocrypto
          )}</td>
          <td>Live</td>
        </tr>
      `;
    })
    .join("");
}

// ===============================
// REKU API
// ===============================

async function getRekuTopRows() {
  console.log(
    "Fetching Reku Official API..."
  );

  const data = await fetchJson(
    REKU_API_URL
  );

  const rows = Object.entries(data)
    .filter(([symbol, item]) => {
      return (
        symbol.endsWith("_IDR") &&
        Number(item?.vol_idr || 0) > 0
      );
    })
    .map(([symbol, item]) => ({
      asset: symbol.replace("_IDR", ""),
      name: symbol.replace("_IDR", ""),
      reku: toBillions(item.vol_idr),
    }))
    .sort((a, b) => b.reku - a.reku)
    .slice(0, 10);

  return rows;
}

// ===============================
// INDODAX API
// ===============================

async function getIndodaxVolumes(
  assets
) {
  const data = await fetchJson(
    INDODAX_TICKERS_URL
  );

  const tickers = data?.tickers || {};

  return Object.fromEntries(
    assets.map((asset) => {
      const ticker =
        tickers[
          `${asset.toLowerCase()}_idr`
        ];

      return [
        asset,
        toBillions(ticker?.vol_idr),
      ];
    })
  );
}

// ===============================
// TOKOCRYPTO API
// ===============================

async function getTokocryptoVolumes(
  assets
) {
  const data = await fetchJson(
    TOKOCRYPTO_TICKERS_URL
  );

  const rows = Array.isArray(data)
    ? data
    : [];

  const bySymbol = new Map(
    rows.map((item) => [
      item.symbol,
      item,
    ])
  );

  return Object.fromEntries(
    assets.map((asset) => {
      const ticker = bySymbol.get(
        `${asset}IDR`
      );

      return [
        asset,
        toBillions(
          ticker?.quoteVolume
        ),
      ];
    })
  );
}

// ===============================
// MERGE DATA
// ===============================

function mergeRows(
  rekuRows,
  indodaxVolumes,
  tokocryptoVolumes
) {
  return rekuRows.map((row) => ({
    ...row,

    indodax:
      indodaxVolumes[row.asset] ?? 0,

    tokocrypto:
      tokocryptoVolumes[row.asset] ??
      0,
  }));
}

// ===============================
// REFRESH DASHBOARD
// ===============================

async function refreshDashboard() {
  try {
    console.log(
      "Refreshing Dashboard..."
    );

    const rekuRows =
      await getRekuTopRows();

    const assets = rekuRows.map(
      (row) => row.asset
    );

    const [
      indodaxVolumes,
      tokocryptoVolumes,
    ] = await Promise.all([
      getIndodaxVolumes(assets),

      getTokocryptoVolumes(assets),
    ]);

    currentRows = mergeRows(
      rekuRows,
      indodaxVolumes,
      tokocryptoVolumes
    );

    renderTable(currentRows);

    elements.lastRefresh.reku.textContent =
      formatTime();

    elements.lastRefresh.indodax.textContent =
      formatTime();

    elements.lastRefresh.tokocrypto.textContent =
      formatTime();

    console.log(
      "Dashboard Live Success",
      currentRows
    );
  } catch (error) {
    console.error(
      "Dashboard Error:",
      error
    );

    renderTable(currentRows);

    elements.lastRefresh.reku.textContent =
      "Snapshot fallback";
  }
}

// ===============================
// AUTO REFRESH
// ===============================

refreshDashboard();

setInterval(() => {
  refreshDashboard();
}, REFRESH_INTERVAL_SECONDS * 1000);

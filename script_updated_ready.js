const REFRESH_INTERVAL_SECONDS = 60;

// ===============================
// API URL
// ===============================

const REKU_API_URL =
  "https://api.reku.id/v3/market";

const REKU_MARKET_HTML =
  "https://reku.id/markets";

const INDODAX_TICKERS_URL =
  "https://indodax.com/api/tickers";

const TOKOCRYPTO_TICKERS_URL =
  "https://www.tokocrypto.site/api/v3/ticker/24hr";

// ===============================
// FALLBACK DATA
// ===============================

const fallbackRows = [
  {
    asset: "USDT",
    name: "Tether",
    image:
      "https://s2.coinmarketcap.com/static/img/coins/64x64/825.png",
    indodax: 155.52,
    reku: 45.45,
    tokocrypto: 36.99,
  },
];

// ===============================
// GLOBAL
// ===============================

let currentRows = [...fallbackRows];

// ===============================
// ELEMENTS
// ===============================

const elements = {
  body: document.querySelector(
    "#volume-table-body"
  ),

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
  return `${Number(value || 0).toFixed(
    2
  )} b`;
}

function formatTime(
  date = new Date()
) {
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

          <td>
            <div style="
              display:flex;
              align-items:center;
              gap:10px;
            ">

              <img
                src="${row.image}"
                alt="${row.asset}"
                style="
                  width:28px;
                  height:28px;
                  border-radius:50%;
                  object-fit:cover;
                "
              />

              <div>

                <div style="
                  font-weight:700;
                ">
                  ${row.asset}
                </div>

                <div style="
                  font-size:12px;
                  opacity:0.7;
                ">
                  ${row.name}
                </div>

              </div>

            </div>
          </td>

          <td>
            ${formatVolume(
              row.indodax
            )}
          </td>

          <td>
            ${formatVolume(
              row.reku
            )}
          </td>

          <td>
            ${formatVolume(
              row.tokocrypto
            )}
          </td>

          <td>
            Live
          </td>

        </tr>
      `;
    })
    .join("");
}

// ===============================
// REKU API SOURCE
// ===============================

async function getRekuApiRows() {

  console.log(
    "Fetching Reku API v3..."
  );

  const response = await fetch(
    REKU_API_URL
  );

  const json =
    await response.json();

  console.log(
    "REKU RAW:",
    json
  );

  const data =
    Array.isArray(json)
      ? json
      : json.data ||
        json.result ||
        json.markets ||
        [];

  if (!Array.isArray(data)) {

    throw new Error(
      "Invalid Reku API structure"
    );
  }

  return data

    .filter((item) => {

      const symbol =
        item.symbol ||
        item.pair ||
        item.code ||
        "";

      return symbol.includes(
        "IDR"
      );
    })

    .map((item) => {

      const symbol =
        item.symbol ||
        item.pair ||
        item.code ||
        "";

      return {

        asset: symbol
          .replace(
            "_IDR",
            ""
          )
          .replace(
            "IDR",
            ""
          ),

        name:
          item.name ||
          symbol,

        image:
          item.logo ||
          item.image ||
          item.icon ||
          "https://via.placeholder.com/28",

        reku: toBillions(
          item.volume_idr ||
            item.vol_idr ||
            item.volume ||
            0
        ),
      };
    })

    .sort(
      (a, b) =>
        b.reku - a.reku
    )

    .slice(0, 10);
}

// ===============================
// HTML FALLBACK
// ===============================

async function getRekuHtmlRows() {

  try {

    const response =
      await fetch(
        REKU_MARKET_HTML
      );

    await response.text();

    console.log(
      "Using Reku HTML fallback..."
    );

    return fallbackRows;

  } catch (error) {

    console.error(
      "HTML fallback failed"
    );

    return fallbackRows;
  }
}

// ===============================
// DUAL SOURCE SYSTEM
// ===============================

async function getRekuTopRows() {

  try {

    console.log(
      "Trying Reku API v3..."
    );

    return await getRekuApiRows();

  } catch (apiError) {

    console.warn(
      "API failed, using HTML fallback..."
    );

    return await getRekuHtmlRows();
  }
}

// ===============================
// INDODAX
// ===============================

async function getIndodaxVolumes(
  assets
) {

  const data =
    await fetchJson(
      INDODAX_TICKERS_URL
    );

  const tickers =
    data?.tickers || {};

  return Object.fromEntries(

    assets.map((asset) => {

      const ticker =
        tickers[
          `${asset.toLowerCase()}_idr`
        ];

      return [

        asset,

        toBillions(
          ticker?.vol_idr
        ),
      ];
    })
  );
}

// ===============================
// TOKOCRYPTO
// ===============================

async function getTokocryptoVolumes(
  assets
) {

  const data =
    await fetchJson(
      TOKOCRYPTO_TICKERS_URL
    );

  const rows =
    Array.isArray(data)
      ? data
      : [];

  const bySymbol =
    new Map(

      rows.map((item) => [
        item.symbol,
        item,
      ])
    );

  return Object.fromEntries(

    assets.map((asset) => {

      const ticker =
        bySymbol.get(
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

  return rekuRows.map(
    (row) => ({

      ...row,

      indodax:
        indodaxVolumes[
          row.asset
        ] ?? 0,

      tokocrypto:
        tokocryptoVolumes[
          row.asset
        ] ?? 0,
    })
  );
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

    const assets =
      rekuRows.map(
        (row) => row.asset
      );

    const [

      indodaxVolumes,
      tokocryptoVolumes,

    ] = await Promise.all([

      getIndodaxVolumes(
        assets
      ),

      getTokocryptoVolumes(
        assets
      ),

    ]);

    currentRows =
      mergeRows(

        rekuRows,

        indodaxVolumes,

        tokocryptoVolumes
      );

    renderTable(
      currentRows
    );

    elements.lastRefresh.reku.textContent =
      formatTime();

    elements.lastRefresh.indodax.textContent =
      formatTime();

    elements.lastRefresh.tokocrypto.textContent =
      formatTime();

    console.log(
      "Dashboard Live Success"
    );

  } catch (error) {

    console.error(
      "Dashboard Error:",
      error
    );

    renderTable(
      currentRows
    );

    elements.lastRefresh.reku.textContent =
      "Snapshot fallback";
  }
}

// ===============================
// GLOBAL ERROR LOGGER
// ===============================

window.onerror = function(
  msg
) {

  console.error(
    "GLOBAL ERROR:",
    msg
  );
};

// ===============================
// AUTO REFRESH
// ===============================

refreshDashboard();

setInterval(() => {

  refreshDashboard();

}, REFRESH_INTERVAL_SECONDS * 1000);

const REFRESH_INTERVAL_SECONDS = 60;
const RING_CIRCUMFERENCE = 326.73;

const REKU_API_URL =
  "https://api.reku.id/v2/price";

const INDODAX_API_URL =
  "https://indodax.com/api/tickers";

const TOKOCRYPTO_API_URL =
  "https://www.tokocrypto.site/api/v3/ticker/24hr";

let currentRows = [];
let countdown = REFRESH_INTERVAL_SECONDS;
let refreshTimerId = null;

const elements = {
  body: document.querySelector("#volume-table-body"),
  countdown: document.querySelector("#countdown"),
  ring: document.querySelector("#ring-progress"),
  status: document.querySelector("#refresh-status"),
  sourceStatus: document.querySelector("#source-status"),
  manualRefresh: document.querySelector("#manual-refresh"),
  tableCard: document.querySelector(".table-card"),

  lastRefresh: {
    indodax: document.querySelector("#last-refresh-indodax"),
    reku: document.querySelector("#last-refresh-reku"),
    tokocrypto: document.querySelector("#last-refresh-tokocrypto"),
  },

  summary: {
    rekuVolume: document.querySelector("#summary-reku-volume"),
    increase: document.querySelector("#summary-increase"),
    reduce: document.querySelector("#summary-reduce"),
    maintain: document.querySelector("#summary-maintain"),
  },
};

function calculateAction(indodax, reku, tokocrypto) {

  const x = Number(indodax || 0);
  const y = Number(tokocrypto || 0);
  const z = Number(reku || 0);

  const d = x - y;
  const absd = Math.abs(d);

  const betaPos =
    0.7 +
    (1 - 0.7) *
      (1 / (1 + Math.exp(-0.015 * (d - 350))));

  const alphaPos =
    0.007 *
    (1 -
      1 / (1 + Math.exp(-0.015 * (d - 350))));

  const betaNeg =
    0.007 *
    (1 -
      1 / (1 + Math.exp(0.1 * (d + 150))));

  const alphaNeg =
    0.7 +
    (0.9 - 0.7) *
      (1 / (1 + Math.exp(0.1 * (d + 150))));

  const upperPos = x - betaPos * absd;
  const lowerPos = y - alphaPos * absd;

  const upperNeg = y - alphaNeg * absd;
  const lowerNeg = x + betaNeg * absd;

  if (d > 10) {

    if (z > upperPos)
      return "Reduce";

    if (z < lowerPos)
      return "Increase";

    return "Maintain";
  }

  if (d <= -10) {

    if (z > upperNeg)
      return "Reduce";

    if (z < lowerNeg)
      return "Increase";

    return "Maintain";
  }

  if (z < Math.min(x, y) - 5)
    return "Increase";

  if (z > Math.max(x, y) + 5)
    return "Reduce";

  return "Maintain";
}

function formatVolume(value) {

  return `${Number(
    value || 0
  ).toFixed(2)} b`;
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

function toBillions(value) {

  return (
    Number(value || 0) /
    1_000_000_000
  );
}

function setLoading(
  isLoading,
  message = ""
) {

  elements.status.textContent =
    isLoading
      ? "Updating"
      : "Live";

  elements.sourceStatus.textContent =
    message;

  elements.tableCard.classList.toggle(
    "is-loading",
    isLoading
  );

  elements.manualRefresh.disabled =
    isLoading;
}

function renderCountdown() {

  elements.countdown.textContent =
    countdown;

  elements.ring.style.strokeDashoffset =
    RING_CIRCUMFERENCE *
    (1 -
      countdown /
        REFRESH_INTERVAL_SECONDS);
}

function getSortedRows(rows) {

  return [...rows]
    .sort(
      (a, b) => b.reku - a.reku
    )
    .slice(0, 10);
}

function renderSummary(rows) {

  const actions =
    rows.map((row) =>
      calculateAction(
        row.indodax,
        row.reku,
        row.tokocrypto
      )
    );

  const totalReku =
    rows.reduce(
      (sum, row) =>
        sum + row.reku,
      0
    );

  elements.summary.rekuVolume.textContent =
    formatVolume(totalReku);

  elements.summary.increase.textContent =
    `${
      actions.filter(
        (a) =>
          a === "Increase"
      ).length
    } assets`;

  elements.summary.reduce.textContent =
    `${
      actions.filter(
        (a) =>
          a === "Reduce"
      ).length
    } assets`;

  elements.summary.maintain.textContent =
    `${
      actions.filter(
        (a) =>
          a === "Maintain"
      ).length
    } assets`;
}

function renderTable(rows) {

  const sortedRows =
    getSortedRows(rows);

  elements.body.innerHTML =
    sortedRows
      .map((row) => {

        const action =
          calculateAction(
            row.indodax,
            row.reku,
            row.tokocrypto
          );

        return `
          <tr>
            <td>
              <span class="asset-cell">
                <span class="asset-icon">
                  ${row.asset.slice(0, 2)}
                </span>
                ${row.asset}
              </span>
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
              <span class="badge badge-${action.toLowerCase()}">
                ${action}
              </span>
            </td>
          </tr>
        `;
      })
      .join("");

  renderSummary(sortedRows);
}

async function fetchJson(url) {

  const response =
    await fetch(
      `${url}?t=${Date.now()}`,
      {
        cache: "no-store",
      }
    );

  if (!response.ok) {

    throw new Error(
      `Fetch failed ${response.status}`
    );
  }

  return response.json();
}

async function getRekuVolumes() {

  const data =
    await fetchJson(
      REKU_API_URL
    );

  return data
    .filter(
      (coin) =>
        coin.cd &&
        Number(coin.v) > 0
    )
    .map((coin) => ({
      asset:
        coin.cd.toUpperCase(),

      name:
        coin.nm ||
        coin.cd,

      reku:
        toBillions(
          coin.v
        ),
    }))
    .sort(
      (a, b) =>
        b.reku - a.reku
    )
    .slice(0, 10);
}

async function getIndodaxVolumes(
  assets
) {

  const data =
    await fetchJson(
      INDODAX_API_URL
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

async function getTokocryptoVolumes(
  assets
) {

  const data =
    await fetchJson(
      TOKOCRYPTO_API_URL
    );

  const rows =
    Array.isArray(data)
      ? data
      : data?.value || [];

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

function mergeRows(
  rekuRows,
  indodaxVolumes,
  tokocryptoVolumes
) {

  return rekuRows.map((row) => ({
    ...row,

    indodax:
      indodaxVolumes[
        row.asset
      ] ?? 0,

    tokocrypto:
      tokocryptoVolumes[
        row.asset
      ] ?? 0,
  }));
}

async function refreshDashboard() {

  try {

    setLoading(
      true,
      "Fetching live exchange data"
    );

    const rekuRows =
      await getRekuVolumes();

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

    renderTable(currentRows);

    const now =
      formatTime();

    elements.lastRefresh.reku.textContent =
      now;

    elements.lastRefresh.indodax.textContent =
      now;

    elements.lastRefresh.tokocrypto.textContent =
      now;

    setLoading(
      false,
      "Live top 10 updated"
    );

  } catch (error) {

    console.error(error);

    setLoading(
      false,
      "Failed fetching live data"
    );
  }

  countdown =
    REFRESH_INTERVAL_SECONDS;

  renderCountdown();
}

function startCountdown() {

  window.clearInterval(
    refreshTimerId
  );

  refreshTimerId =
    window.setInterval(() => {

      countdown--;

      if (countdown <= 0) {

        refreshDashboard();

        return;
      }

      renderCountdown();

    }, 1000);
}

function initDashboard() {

  renderCountdown();

  startCountdown();

  refreshDashboard();

  elements.manualRefresh
    .addEventListener(
      "click",
      refreshDashboard
    );
}

document.addEventListener(
  "DOMContentLoaded",
  initDashboard
);

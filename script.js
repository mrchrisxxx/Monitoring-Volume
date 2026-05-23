const REFRESH_INTERVAL_SECONDS = 60;
const RING_CIRCUMFERENCE = 326.73;

let countdown = REFRESH_INTERVAL_SECONDS;
let currentData = [];

const elements = {
  tableBody: document.querySelector("#volume-table-body"),
  countdown: document.querySelector("#countdown"),
  ringProgress: document.querySelector(".ring-progress"),
  loadingState: document.querySelector("#refresh-status"),
  refreshButton: document.querySelector("#manual-refresh"),

  refreshTimes: {
    indodax: document.querySelector("#last-refresh-indodax"),
    reku: document.querySelector("#last-refresh-reku"),
    tokocrypto: document.querySelector("#last-refresh-tokocrypto"),
  },

  summary: {
    total: document.querySelector("#summary-reku-volume"),
    increase: document.querySelector("#summary-increase"),
    reduce: document.querySelector("#summary-reduce"),
    maintain: document.querySelector("#summary-maintain"),
  },
};

function formatVolume(value) {
  return `${Number(value).toFixed(2)} b`;
}

function formatTime(date = new Date()) {
  return `${new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date)} WIB`;
}

function getActionClass(action) {
  return `action-${action.toLowerCase()}`;
}

function calculateAction(indodax, reku, tokocrypto) {

  const x = indodax;
  const y = tokocrypto;
  const z = reku;

  const d = x - y;
  const absd = Math.abs(d);

  const betaPos =
    0.7 + (1 - 0.7) *
    (1 / (1 + Math.exp(-0.015 * (d - 350))));

  const alphaPos =
    0.007 *
    (1 - 1 / (1 + Math.exp(-0.015 * (d - 350))));

  const betaNeg =
    0.007 *
    (1 - 1 / (1 + Math.exp(0.1 * (d + 150))));

  const alphaNeg =
    0.7 + (0.9 - 0.7) *
    (1 / (1 + Math.exp(0.1 * (d + 150))));

  const upperPos = x - betaPos * absd;
  const lowerPos = y - alphaPos * absd;

  const upperNeg = y - alphaNeg * absd;
  const lowerNeg = x + betaNeg * absd;

  if (d > 10) {

    if (z > upperPos) return "Reduce";

    if (z < lowerPos) return "Increase";

    return "Maintain";
  }

  if (d <= -10) {

    if (z > upperNeg) return "Reduce";

    if (z < lowerNeg) return "Increase";

    return "Maintain";
  }

  if (z < Math.min(x, y) - 5)
    return "Increase";

  if (z > Math.max(x, y) + 5)
    return "Reduce";

  return "Maintain";
}

async function fetchRekuData() {

  try {

    const response = await fetch(
      "https://api.reku.id/v2/price"
    );

    const data = await response.json();

    return data
      .map((coin) => ({

        asset:
          coin.cd?.toUpperCase(),

        // FIX FINAL REKU
        reku:
          Number(coin.v || 0) /
          1000000000,

      }))
      .filter(
        (coin) =>
          coin.asset &&
          coin.reku > 0
      );

  } catch (error) {

    console.error(
      "Reku Error:",
      error
    );

    return [];
  }
}

async function fetchIndodaxData() {

  try {

    const response = await fetch(
      "https://corsproxy.io/?https://indodax.com/api/summaries"
    );

    const data = await response.json();

    const tickers =
      data.tickers || {};

    return Object.entries(tickers)
      .filter(([pair]) =>
        pair.endsWith("_idr")
      )
      .map(([pair, value]) => ({

        asset:
          pair
            .replace("_idr", "")
            .toUpperCase(),

        indodax:
          Number(
            value.vol_idr || 0
          ) /
          1000000000,

      }));

  } catch (error) {

    console.error(
      "Indodax Error:",
      error
    );

    return [];
  }
}

async function fetchTokocryptoData() {

  try {

    const response = await fetch(
      "https://corsproxy.io/?https://www.tokocrypto.com/open/v1/ticker/24hr"
    );

    const json =
      await response.json();

    const list =
      json.data || [];

    return list
      .filter((item) =>
        item.symbol?.endsWith("IDR")
      )
      .map((item) => ({

        asset:
          item.symbol
            .replace("IDR", "")
            .toUpperCase(),

        tokocrypto:
          Number(
            item.quoteVolume || 0
          ) /
          1000000000,

      }));

  } catch (error) {

    console.error(
      "Tokocrypto Error:",
      error
    );

    return [];
  }
}

function mergeMarketData(
  rekuData,
  indodaxData,
  tokocryptoData
) {

  return rekuData.map(
    (rekuCoin) => {

      const indoMatch =
        indodaxData.find(
          (item) =>
            item.asset ===
            rekuCoin.asset
        );

      const tokoMatch =
        tokocryptoData.find(
          (item) =>
            item.asset ===
            rekuCoin.asset
        );

      return {

        asset:
          rekuCoin.asset,

        reku:
          rekuCoin.reku || 0,

        indodax:
          indoMatch?.indodax || 0,

        tokocrypto:
          tokoMatch?.tokocrypto || 0,
      };
    }
  );
}

function renderSummary(data) {

  const total =
    data.reduce(
      (sum, item) =>
        sum + item.reku,
      0
    );

  let increase = 0;
  let reduce = 0;
  let maintain = 0;

  data.forEach((item) => {

    const action =
      calculateAction(
        item.indodax,
        item.reku,
        item.tokocrypto
      );

    if (
      action === "Increase"
    )
      increase++;

    if (
      action === "Reduce"
    )
      reduce++;

    if (
      action === "Maintain"
    )
      maintain++;
  });

  elements.summary.total.textContent =
    formatVolume(total);

  elements.summary.increase.textContent =
    `${increase} assets`;

  elements.summary.reduce.textContent =
    `${reduce} assets`;

  elements.summary.maintain.textContent =
    `${maintain} assets`;
}

function renderTable(data) {

  const rows =
    data.map((item) => {

      const action =
        calculateAction(
          item.indodax,
          item.reku,
          item.tokocrypto
        );

      return `
        <tr>

          <td>
            <span class="asset-cell">

              <span class="asset-icon">
                ${item.asset.slice(0, 2)}
              </span>

              ${item.asset}

            </span>
          </td>

          <td>
            ${formatVolume(item.indodax)}
          </td>

          <td>
            ${formatVolume(item.reku)}
          </td>

          <td>
            ${formatVolume(item.tokocrypto)}
          </td>

          <td>

            <span class="
              action-badge
              ${getActionClass(action)}
            ">

              ${action}

            </span>

          </td>

        </tr>
      `;
    }).join("");

  elements.tableBody.innerHTML =
    rows;
}

function renderRefreshTimes() {

  const now =
    formatTime();

  elements.refreshTimes.indodax.textContent =
    now;

  elements.refreshTimes.reku.textContent =
    now;

  elements.refreshTimes.tokocrypto.textContent =
    now;
}

function updateCountdownVisual() {

  elements.countdown.textContent =
    countdown;

  const progressRatio =
    countdown /
    REFRESH_INTERVAL_SECONDS;

  elements.ringProgress.style.strokeDashoffset =
    RING_CIRCUMFERENCE *
    (1 - progressRatio);
}

async function refreshDashboard() {

  try {

    elements.loadingState.textContent =
      "Updating";

    const [
      rekuData,
      indodaxData,
      tokocryptoData
    ] = await Promise.all([

      fetchRekuData(),

      fetchIndodaxData(),

      fetchTokocryptoData(),

    ]);

    const merged =
      mergeMarketData(
        rekuData,
        indodaxData,
        tokocryptoData
      );

    const top10 =
      merged
        .sort(
          (a, b) =>
            b.reku - a.reku
        )
        .slice(0, 10);

    currentData =
      top10;

    renderTable(top10);

    renderSummary(top10);

    renderRefreshTimes();

    elements.loadingState.textContent =
      "Live";

  } catch (error) {

    console.error(error);

    elements.loadingState.textContent =
      "API Error";
  }
}

function startAutoRefresh() {

  setInterval(() => {

    countdown--;

    if (
      countdown <= 0
    ) {

      countdown =
        REFRESH_INTERVAL_SECONDS;

      refreshDashboard();
    }

    updateCountdownVisual();

  }, 1000);
}

async function initDashboard() {

  await refreshDashboard();

  updateCountdownVisual();

  startAutoRefresh();

  elements.refreshButton.addEventListener(
    "click",
    async () => {

      countdown =
        REFRESH_INTERVAL_SECONDS;

      updateCountdownVisual();

      await refreshDashboard();
    }
  );
}

document.addEventListener(
  "DOMContentLoaded",
  initDashboard
);

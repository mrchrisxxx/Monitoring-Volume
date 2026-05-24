const REFRESH_INTERVAL_SECONDS = 60;

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

// =========================
// AUTO REFRESH
// =========================

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

// =========================
// INIT
// =========================

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

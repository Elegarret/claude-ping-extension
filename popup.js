// Claude Limit Resetter — Popup Script

const $ = (sel) => document.querySelector(sel);

const statusDot = $("#statusDot");
const statusLabel = $("#statusLabel");
const lastPingEl = $("#lastPing");
const lastResultEl = $("#lastResult");
const countdownSection = $("#countdownSection");
const countdownTime = $("#countdownTime");
const intervalInput = $("#intervalInput");
const btnStart = $("#btnStart");
const btnPingNow = $("#btnPingNow");
const logToggle = $("#logToggle");
const logEntries = $("#logEntries");

let countdownInterval = null;

// ── Init ──────────────────────────────────────────────────────

loadState();

btnStart.addEventListener("click", toggleEnabled);
btnPingNow.addEventListener("click", pingNow);
logToggle.addEventListener("click", () => {
  logEntries.classList.toggle("open");
  logToggle.textContent = logEntries.classList.contains("open")
    ? "▾ Activity Log"
    : "▸ Activity Log";
});

// Poll state every second for countdown
setInterval(updateCountdown, 1000);

// ── State ─────────────────────────────────────────────────────

function loadState() {
  chrome.storage.local.get(
    ["enabled", "intervalMinutes", "lastPing", "lastStatus", "log"],
    (data) => {
      const enabled = data.enabled ?? false;
      const interval = data.intervalMinutes ?? 295;

      intervalInput.value = interval;
      updateStatusUI(enabled, data.lastStatus);
      updateLastPing(data.lastPing);
      updateLastResult(data.lastStatus);
      updateButtonUI(enabled);
      renderLog(data.log || []);

      if (enabled) {
        countdownSection.style.display = "block";
        startCountdown(data.lastPing, interval);
      } else {
        countdownSection.style.display = "none";
      }
    }
  );
}

function toggleEnabled() {
  chrome.storage.local.get(["enabled"], (data) => {
    const wasEnabled = data.enabled ?? false;

    if (wasEnabled) {
      // Stop
      chrome.runtime.sendMessage({ type: "stop" }, () => {
        addLog("Disabled");
        loadState();
      });
    } else {
      // Start
      const interval = parseInt(intervalInput.value) || 295;
      chrome.runtime.sendMessage(
        { type: "start", intervalMinutes: interval },
        () => {
          addLog(`Enabled — interval: ${interval}m`);
          loadState();
        }
      );
    }
  });
}

function pingNow() {
  btnPingNow.textContent = "Pinging…";
  btnPingNow.disabled = true;
  chrome.runtime.sendMessage({ type: "ping-now" }, () => {
    addLog("Manual ping triggered");
    setTimeout(() => {
      btnPingNow.textContent = "Ping Now";
      btnPingNow.disabled = false;
      loadState();
    }, 8000);
  });
}

// ── UI Updates ────────────────────────────────────────────────

function updateStatusUI(enabled, lastStatus) {
  statusDot.className = "status-dot";
  if (!enabled) {
    statusDot.classList.add("dot-idle");
    statusLabel.textContent = "Disabled";
  } else if (lastStatus === "pinging...") {
    statusDot.classList.add("dot-active");
    statusLabel.textContent = "Pinging…";
  } else if (lastStatus === "success") {
    statusDot.classList.add("dot-active");
    statusLabel.textContent = "Active";
  } else if (lastStatus?.startsWith("error")) {
    statusDot.classList.add("dot-inactive");
    statusLabel.textContent = "Error";
  } else {
    statusDot.classList.add("dot-active");
    statusLabel.textContent = "Active";
  }
}

function updateLastPing(timestamp) {
  if (!timestamp) {
    lastPingEl.textContent = "—";
    return;
  }
  const d = new Date(timestamp);
  lastPingEl.textContent = d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function updateLastResult(status) {
  if (!status || status === "installed") {
    lastResultEl.textContent = "—";
    lastResultEl.style.color = "var(--text-dim)";
  } else if (status === "success") {
    lastResultEl.textContent = "✓ Sent";
    lastResultEl.style.color = "var(--green)";
  } else if (status === "pinging...") {
    lastResultEl.textContent = "⟳ Sending…";
    lastResultEl.style.color = "var(--accent)";
  } else {
    lastResultEl.textContent = status.replace("error: ", "✗ ");
    lastResultEl.style.color = "var(--red)";
  }
}

function updateButtonUI(enabled) {
  if (enabled) {
    btnStart.textContent = "Disable";
    btnStart.className = "btn btn-danger";
    intervalInput.disabled = true;
  } else {
    btnStart.textContent = "Enable";
    btnStart.className = "btn btn-primary";
    intervalInput.disabled = false;
  }
}

// ── Countdown ─────────────────────────────────────────────────

function startCountdown(lastPing, intervalMinutes) {
  updateCountdown();
}

function updateCountdown() {
  chrome.storage.local.get(
    ["enabled", "lastPing", "intervalMinutes"],
    (data) => {
      if (!data.enabled) {
        countdownSection.style.display = "none";
        return;
      }
      countdownSection.style.display = "block";

      const interval = (data.intervalMinutes ?? 295) * 60 * 1000;

      // If no ping yet, estimate from when alarm was created
      const base = data.lastPing ? new Date(data.lastPing).getTime() : Date.now();
      const nextPing = base + interval;
      const remaining = Math.max(0, nextPing - Date.now());

      const h = Math.floor(remaining / 3600000);
      const m = Math.floor((remaining % 3600000) / 60000);
      const s = Math.floor((remaining % 60000) / 1000);

      countdownTime.textContent =
        String(h).padStart(2, "0") +
        ":" +
        String(m).padStart(2, "0") +
        ":" +
        String(s).padStart(2, "0");
    }
  );
}

// ── Activity Log ──────────────────────────────────────────────

function addLog(message) {
  chrome.storage.local.get(["log"], (data) => {
    const log = data.log || [];
    log.unshift({
      time: new Date().toISOString(),
      message,
    });
    // Keep last 20 entries
    chrome.storage.local.set({ log: log.slice(0, 20) }, () => {
      renderLog(log);
    });
  });
}

function renderLog(log) {
  logEntries.innerHTML = log
    .map((entry) => {
      const t = new Date(entry.time).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      return `<div class="log-entry">${t} — ${entry.message}</div>`;
    })
    .join("");
}

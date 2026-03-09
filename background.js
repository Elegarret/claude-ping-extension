// Claude Limit Resetter — Background Service Worker
// Sends a ping to claude.ai on a schedule to anchor the rate limit window.

const DEFAULT_INTERVAL_MINUTES = 305; // 5h 5m
const ALARM_NAME = "claude-ping";
const PING_MESSAGE = "hi";
const CLAUDE_BASE_URL = "https://claude.ai";

// ── Alarm Setup ──────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["enabled", "intervalMinutes"], (data) => {
    const enabled = data.enabled ?? false;
    const interval = data.intervalMinutes ?? DEFAULT_INTERVAL_MINUTES;
    if (enabled) {
      startAlarm(interval);
    }
    chrome.storage.local.set({
      enabled,
      intervalMinutes: interval,
      lastPing: null,
      lastStatus: "installed",
    });
  });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    await addLogEntry("Auto ping triggered");
    performPing();
  }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "start") {
    const interval = msg.intervalMinutes ?? DEFAULT_INTERVAL_MINUTES;
    chrome.storage.local.set({ enabled: true, intervalMinutes: interval });
    startAlarm(interval);
    sendResponse({ ok: true });
  } else if (msg.type === "stop") {
    chrome.storage.local.set({ enabled: false });
    stopAlarm();
    sendResponse({ ok: true });
  } else if (msg.type === "ping-now") {
    performPing();
    sendResponse({ ok: true });
  } else if (msg.type === "reset-chat") {
    chrome.storage.local.remove(["pingChatId"]);
    sendResponse({ ok: true });
  }
  return true;
});

function startAlarm(intervalMinutes) {
  chrome.alarms.create(ALARM_NAME, {
    delayInMinutes: intervalMinutes,
    periodInMinutes: intervalMinutes,
  });
  console.log(`[Claude Ping] Alarm set: every ${intervalMinutes} minutes`);
}

function stopAlarm() {
  chrome.alarms.clear(ALARM_NAME);
  console.log("[Claude Ping] Alarm cleared");
}

// ── Ping Logic ───────────────────────────────────────────────

async function performPing() {
  const timestamp = new Date().toISOString();
  console.log(`[Claude Ping] Pinging at ${timestamp}`);

  chrome.storage.local.set({ lastStatus: "pinging..." });

  let tab;
  try {
    // Get stored chat ID if exists
    const data = await chrome.storage.local.get(["pingChatId"]);
    let chatUrl = data.pingChatId
      ? `${CLAUDE_BASE_URL}/chat/${data.pingChatId}`
      : `${CLAUDE_BASE_URL}/new`;

    console.log(`[Claude Ping] Opening ${chatUrl}`);

    // Open claude.ai in a new tab (uses existing session cookies)
    tab = await chrome.tabs.create({
      url: chatUrl,
      active: false,
    });

    // Wait for the page to fully load
    await waitForTabLoad(tab.id, 30000);

    // Extra wait for the SPA to hydrate
    await sleep(5000);

    // Check if we got redirected (chat might not exist anymore)
    const tabInfo = await chrome.tabs.get(tab.id);
    const currentUrl = tabInfo.url;

    // If redirected to /new or different chat, clear stored ID
    if (data.pingChatId && !currentUrl.includes(data.pingChatId)) {
      console.log("[Claude Ping] Stored chat not found, creating new one");
      await chrome.storage.local.remove(["pingChatId"]);
    }

    // Inject script that types and sends the message
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: injectPing,
      args: [PING_MESSAGE],
    });

    // Wait for the message to be sent
    await sleep(6000);

    // Extract chat ID from URL and store it for next time
    const finalTab = await chrome.tabs.get(tab.id);
    const chatIdMatch = finalTab.url.match(/\/chat\/([a-f0-9-]+)/);
    if (chatIdMatch) {
      const chatId = chatIdMatch[1];
      await chrome.storage.local.set({ pingChatId: chatId });
      console.log(`[Claude Ping] Stored chat ID: ${chatId}`);
    }

    // Close the tab
    await chrome.tabs.remove(tab.id);

    chrome.storage.local.set({
      lastPing: timestamp,
      lastStatus: "success",
    });
    console.log("[Claude Ping] Ping successful");
  } catch (err) {
    console.error("[Claude Ping] Ping failed:", err.message);
    chrome.storage.local.set({
      lastPing: timestamp,
      lastStatus: `error: ${err.message}`,
    });
    await addLogEntry(`Error: ${err.message}`);
    // Try to close tab if it was opened
    if (tab?.id) {
      try { await chrome.tabs.remove(tab.id); } catch {}
    }
  }
}

// This function runs INSIDE the claude.ai page context
function injectPing(message) {
  return new Promise((resolve, reject) => {
    try {
      // Find the contenteditable input area
      const editor =
        document.querySelector('[contenteditable="true"]') ||
        document.querySelector('div[data-placeholder]') ||
        document.querySelector('.ProseMirror') ||
        document.querySelector('fieldset .relative [contenteditable]');

      if (!editor) {
        reject(new Error("Could not find input field"));
        return;
      }

      // Focus and type the message
      editor.focus();
      editor.textContent = message;

      // Dispatch input event so the framework picks it up
      editor.dispatchEvent(new Event("input", { bubbles: true }));
      editor.dispatchEvent(new Event("change", { bubbles: true }));

      // Small delay then find and click send button
      setTimeout(() => {
        const sendButton =
          // Case-insensitive aria-label search
          [...document.querySelectorAll("button[aria-label]")].find(
            (btn) => btn.getAttribute("aria-label").toLowerCase() === "send message"
          ) ||
          document.querySelector('button[data-testid="send-button"]') ||
          // Fallback: look for the button near the input
          [...document.querySelectorAll("button")].find(
            (btn) =>
              btn.querySelector("svg") &&
              btn.closest("form, fieldset, [class*='input']")
          );

        if (sendButton && !sendButton.disabled) {
          sendButton.click();
          resolve("sent");
        } else {
          // Try pressing Enter as fallback
          editor.dispatchEvent(
            new KeyboardEvent("keydown", {
              key: "Enter",
              code: "Enter",
              keyCode: 13,
              which: 13,
              bubbles: true,
            })
          );
          resolve("sent-via-enter");
        }
      }, 1000);
    } catch (e) {
      reject(e);
    }
  });
}

// ── Helpers ──────────────────────────────────────────────────

async function addLogEntry(message) {
  const data = await chrome.storage.local.get(["log"]);
  const log = data.log || [];
  log.unshift({ time: new Date().toISOString(), message });
  if (log.length > 20) log.length = 20;
  await chrome.storage.local.set({ log });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function waitForTabLoad(tabId, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("Tab load timeout"));
    }, timeout);

    function listener(id, info) {
      if (id === tabId && info.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

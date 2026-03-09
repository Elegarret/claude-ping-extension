# Claude Limit Resetter

A Chrome extension that automatically pings Claude every 5h 05m to keep your rate limit window anchored — so it resets on a predictable schedule instead of drifting.

## The Problem

Claude's rate limits reset 5 hours after your **first message** in a window. If you don't message again until hours later, the window doesn't start until then — meaning your reset drifts later and later. This extension keeps it anchored by sending a tiny "hi" message on a fixed schedule.

## How It Works

1. Opens a background tab to `claude.ai/new` (uses your existing login session)
2. Types "hi" and sends it
3. Closes the tab
4. Repeats every 5h 05m (configurable)

**No API keys needed.** It uses your already-authenticated browser session.

## Installation

1. Download/clone this folder
2. Open Chrome → go to `chrome://extensions`
3. Enable **Developer mode** (toggle in top right)
4. Click **Load unpacked** → select this folder
5. The extension icon appears in your toolbar

## Usage

1. Click the extension icon
2. Adjust the interval if needed (default: every 305 minutes = 5h 05m)
3. Click **Enable**
4. That's it — it runs in the background

You can also click **Ping Now** to trigger a manual ping immediately.

## Privacy & Trust

- **100% client-side** — no external servers, no data collection
- **No API keys** — uses your existing browser cookies
- **Fully inspectable** — read every line of code in this folder
- **Open source** — share, modify, audit as you like

## Important Notes

- You must be logged into claude.ai in Chrome for this to work
- Chrome must be running (extensions don't work when Chrome is closed)
- The tab opens briefly in the background — you may notice it flash
- If Claude's page structure changes, the input selectors may need updating

## Troubleshooting

- **"Error: Could not find input field"** — Claude's page HTML may have changed. Check if the selectors in `background.js` (`injectPing` function) still match.
- **Tab doesn't close** — Extension may lack tab permissions. Re-install and ensure all permissions are granted.
- **Ping shows success but limit still drifted** — Check that the message actually sent by opening claude.ai and looking at recent chats.

## Files

```
├── manifest.json     # Extension config (Manifest V3)
├── background.js     # Alarm scheduling + tab automation
├── popup.html        # Extension popup UI
├── popup.js          # Popup logic & state management
├── icons/            # Extension icons
└── README.md         # This file
```

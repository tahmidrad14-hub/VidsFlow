# Vids Image Queue — Chrome Extension

Automates sequential image generation in **Google Vids** with:
- **Automatic Landscape 16:9 selection** (verified, not assumed)
- **Reliable one-at-a-time generation** with new-image verification
- **Freely movable floating dashboard** with persisted position

## Install (Load Unpacked)

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked**.
4. Select the `vids-image-queue` folder (the one containing `manifest.json`).
5. Pin the extension. Open `https://vids.google.com/` — the floating dashboard appears.

## Usage

1. Paste prompts (one per line) or import a `.txt` file.
2. Click **Start**.
3. The extension will, for each prompt:
   - Verify the image panel is present.
   - Select and **verify** Landscape 16:9.
   - Enter the prompt and confirm the field contains it.
   - Wait for Create to become enabled (re-querying the DOM).
   - Click Create **exactly once**.
   - Detect generation start, then wait for a **new image** to appear.
   - Mark the prompt Completed and advance.
4. Pause / Resume / Stop anytime. Failed prompts can be retried.

## Movable Dashboard

- Drag the **title bar** to move the panel anywhere.
- Position is saved to `chrome.storage.local` and restored on reload.
- Use the **—** button to hide; a small tab appears to reopen.
- Resize with the bottom-right handle.

## Architecture

| File | Responsibility |
|------|----------------|
| `manifest.json` | MV3 manifest, minimal permissions |
| `service-worker.js` | Downloads + ping |
| `content/storage.js` | `chrome.storage.local` wrapper + defaults |
| `content/dom.js` | All Google Vids DOM interaction, incl. aspect-ratio logic |
| `content/queue.js` | Sequential state machine, one prompt at a time |
| `content/floating-ui.js` | Shadow-DOM draggable panel |
| `content/content.js` | Wiring / single-instance guard |
| `styles/panel.css` | Shadow-DOM scoped styles |
| `popup/*` | Popup to focus the Vids tab |
| `tests/*` | Node-based logic tests |

## Test Results (static + mock)

Run:
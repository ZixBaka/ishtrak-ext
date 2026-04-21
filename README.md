# ishtrak-ext

Browser extension for [Ishtrak](https://github.com/ZixBaka/ishtrak) — receives task commands from the CLI and creates tasks on Jira, Linear, and GitHub Projects using your existing browser session or a personal access token.

Built with [WXT](https://wxt.dev) (WebExtensions framework), targets Chrome MV3 and Firefox.

## Supported platforms

| Platform | Strategy | Notes |
|----------|----------|-------|
| Jira | API token or browser session | REST API v3 |
| Linear | API token or browser session | GraphQL API |
| GitHub Projects | API token or browser session | REST API |

## How it works

The extension connects to the local Ishtrak daemon (`127.0.0.1:7474`) via HTTP long-poll. When the CLI sends a command, the daemon forwards it to the extension, which calls the platform API using the active browser session or a stored token, then returns the result.

```
ishtrak-cli  →  daemon (7474)  →  extension long-poll  →  platform API
```

## Development

```bash
npm install
npm run dev             # Chrome dev mode with hot reload
npm run dev:firefox     # Firefox dev mode
npm run build           # Production Chrome build  → .output/chrome-mv3/
npm run build:firefox   # Production Firefox build → .output/firefox-mv2/
npm run zip             # Package for store submission
```

## Installation (from source)

1. Run `npm run build` — output goes to `.output/chrome-mv3/`
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked** and select `.output/chrome-mv3/`
5. Copy the extension ID shown on the card
6. Run `ishtrak init --update-extension-id <ID>` to register the native host

## Popup

Click the extension icon to open the popup. From there you can:

- Add a **bridge** (connection to a platform host) — choose platform, auth strategy, and optionally a PAT
- Set the **active bridge** per window
- Validate connections
- Remove bridges

## Architecture

```
entrypoints/
  background.ts      WXT service worker — long-polls daemon, handles popup messages
  content.ts         Content script entry (form-fill strategy)
  popup/             React popup UI

src/
  bridges/           Per-platform API clients (jira.ts, linear.ts, github.ts)
  background/
    task-creator.ts  Orchestrates API_DIRECT and FORM_FILL strategies
    daemon-client.ts HTTP client for the local daemon
    native-host.ts   Native Messaging host protocol
    profile-store.ts Bridge config persistence (chrome.storage.local)
  content/
    form-filler.ts   DOM automation fallback for FORM_FILL strategy
  utils/
    storage.ts       Bridge config CRUD helpers
    heuristics.ts    Platform detection scoring
  types/
    messages.ts      Daemon command protocol types
```

## Related

- [ishtrak-cli](https://github.com/ZixBaka/ishtrak-cli) — Go CLI
- [ishtrak](https://github.com/ZixBaka/ishtrak) — overview and quick-start guide

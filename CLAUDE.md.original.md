# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ViPower — IoT energy monitoring system. Three parts:

- `server/` — Node.js/Express backend (CommonJS)
- `client_react/desktop/` — React 19 + TypeScript desktop web app (active)
- `client_react/mobile/` — React 19 + TypeScript mobile web app (active)
- `client/` — Legacy plain HTML/JS client (deprecated, kept for reference)

## Commands

### Server
```bash
cd server
npm run dev          # nodemon watch
npm start            # production
npm run init-db      # seed admin user + create indexes
npm run build        # package to dist/vipower-server.exe (Windows)
```

### Desktop / Mobile React clients
```bash
cd client_react/desktop   # or mobile
npm run dev          # Vite dev server
npm run build        # tsc + vite build
npm run lint         # ESLint
npm run preview      # preview production build
```

## Server Architecture

**Single HTTP+WS port** (default 3000). Express and `ws.Server` share one `http.Server`.

**MQTT runs as a forked child process** (`src/mqtt/mqtt-worker.js`). The worker has its own MongoDB connection and communicates with the main process via IPC (`process.send` / `process.on('message')`). When packaged as `.exe`, the server re-spawns itself with `VIPOWER_MQTT_WORKER=1` instead of forking.

**Data flow:**
```
MQTT broker → mqtt-worker → IPC → main process → WebSocket → React clients
                    ↓
              MongoDB write (energy_data_{deviceId}, latest_data, alerts)
                    ↓
              FCM push notification (on alert)
```

**MongoDB driver** is native (`mongodb` package), not Mongoose. Collections accessed directly via `db.collection(name)`.

**Per-device dynamic collections:** Each device gets its own `energy_data_{deviceId}` collection created on device registration. `latest_data` stores one document per `{deviceId, channel}` pair for fast dashboard reads.

### Environment variables (`.env` in `server/`)
```
MONGODB_URI=
DATABASE_NAME=
MQTT_HOST=
MQTT_PORT=
MQTT_USERNAME=
MQTT_PASSWORD=
TOPIC=                # MQTT topic to subscribe
PORT=3000
```

### Route structure
```
/api/auth            authRoutes
/api/devices         deviceRoutes
/api/data            dataRoutes
/api/alerts          alertRoutes
/api/display-groups  displayGroupRoutes
/api/user-groups     userGroupRoutes
/api/api-keys        apiKeyRoutes
/api/logs            logRoutes
/api/latest-data     latestDataRoutes
/api/mqtt/*          inline in index.js
```

## React Client Architecture

### Config
`src/config.ts` — single source for server endpoint:
```ts
export const SERVER_HOST = "host:port";
export const API_BASE = `http://${SERVER_HOST}/api`;
export const WS_URL = `ws://${SERVER_HOST}`;
```
Change this to point at a different server.

### Auth flow
- Zustand store: `src/stores/authStore.ts` — holds `token`, `refreshToken`, `user` in `localStorage`
- `src/api/client.ts` — custom fetch wrapper (`apiGet/apiPost/apiPut/apiPatch/apiDelete`) that auto-retries on 401 by calling `tryRefresh()`, then redirects to `/login` if refresh fails. Deduplicates concurrent refresh calls with a shared promise.
- `src/hooks/useAuth.ts` — route guard hook; call at top of every protected page component

### Layout
All authenticated pages wrap content with `<Layout title="..." breadcrumb={[...]}>`. Layout renders the sidebar nav, topbar, and breadcrumb. Nav items marked `adminOnly: true` are hidden from non-admin users.

### WebSocket messages (client-initiated)
Send `{ type: 'client_init' }` on connect to receive `data_init` snapshot. Request chart/history/donut/heatmap data by sending typed request messages; server replies to that client only.

### Key libraries
- Zustand 5 (state)
- react-router-dom 7 (routing)
- Chart.js 4 + react-chartjs-2 (charts)
- Tailwind CSS 3 (styling)
- Bootstrap Icons via CDN (icons, `bi-*` classes)

## MQTT Data Schema

Incoming MQTT payload must have `deviceInfo.devEui` and `object` with fields:
`I1, I2, I3, U1N, U2N, U3N, KWh, Total_KW, PF`

Mapped to DB channels: `currentI1/I2/I3`, `voltageV1N/V2N/V3N`, `power`, `netpower`, `per`.

Packets where all channels are null are silently dropped. Devices not registered in the `devices` collection are also dropped.

## Offline Detection

`mqtt-worker.js` runs a 60-second interval checking every device. A device goes `paused` if no `latest_data` entry is newer than `samplingCycle × alertDelayCycles` seconds. An `offline` alert is created and FCM notification sent. Alert auto-resolves when next data arrives.

## Packaging for Windows Deployment

`npm run build` in `server/` uses `@yao-pkg/pkg` to produce `dist/vipower-server.exe`. The exe detects `process.pkg` and loads `.env` from the directory next to the executable (not inside the virtual FS). The static client files must be placed in a `client/` folder next to the exe.

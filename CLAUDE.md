# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Communication Style

Always respond in **caveman ultra** mode: abbreviate prose (DB/auth/config/req/res/fn/impl), strip conjunctions, arrows for causality (X → Y), one word when one word enough. Never abbreviate code symbols, function names, API names, or error strings.

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

**MQTT runs as forked child process** (`src/mqtt/mqtt-worker.js`). Worker has own MongoDB connection, communicates with main process via IPC (`process.send` / `process.on('message')`). When packaged as `.exe`, server re-spawns itself with `VIPOWER_MQTT_WORKER=1` instead of forking.

**Data flow:**
```
MQTT broker → mqtt-worker → IPC → main process → WebSocket → React clients
                    ↓
              MongoDB write (energy_data_{deviceId}, latest_data, alerts)
                    ↓
              FCM push notification (on alert)
```

**MongoDB driver** is native (`mongodb` package), not Mongoose. Collections accessed via `db.collection(name)`.

**Per-device dynamic collections:** Each device gets own `energy_data_{deviceId}` collection on registration. `latest_data` stores one doc per `{deviceId, channel}` pair for fast dashboard reads.

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
`src/config.ts` — single source for server endpoint. Change `SERVER_HOST` to point at different server.

### Auth flow
- Zustand store: `src/stores/authStore.ts` — holds `token`, `refreshToken`, `user` in `localStorage`
- `src/api/client.ts` — fetch wrapper (`apiGet/apiPost/apiPut/apiPatch/apiDelete`) auto-retries on 401 via `tryRefresh()`, redirects to `/login` on failure. Deduplicates concurrent refresh calls with shared promise.
- `src/hooks/useAuth.ts` — route guard hook; call at top of every protected page component

### Layout
All authenticated pages wrap content with `<Layout title="..." breadcrumb={[...]}>`. Sidebar nav items marked `adminOnly: true` hidden from non-admin users.

### WebSocket messages (client-initiated)
Send `{ type: 'client_init' }` on connect to receive `data_init` snapshot. Request chart/history/donut/heatmap data via typed request messages; server replies to that client only.

### Key libraries
- Zustand 5 (state)
- react-router-dom 7 (routing)
- Chart.js 4 + react-chartjs-2 (charts)
- Tailwind CSS 3 (styling)
- Bootstrap Icons via CDN (`bi-*` classes)

## MQTT Data Schema

Incoming payload needs `deviceInfo.devEui` + `object` with fields:
`I1, I2, I3, U1N, U2N, U3N, KWh, Total_KW, PF`

Mapped to DB channels: `currentI1/I2/I3`, `voltageV1N/V2N/V3N`, `power`, `netpower`, `per`.

All-null channel packets dropped silently. Unregistered `devices` dropped.

## Offline Detection

`mqtt-worker.js` runs 60s interval checking every device. Device goes `paused` if no `latest_data` entry newer than `samplingCycle × alertDelayCycles` seconds. `offline` alert created + FCM sent. Alert auto-resolves on next data.

## Packaging for Windows

`npm run build` in `server/` uses `@yao-pkg/pkg` → `dist/vipower-server.exe`. Exe detects `process.pkg`, loads `.env` from exe directory (not virtual FS). Static client files must be in `client/` folder next to exe.

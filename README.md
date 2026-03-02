# Full Generic Music Streaming App

A Netlify-first music streaming app with a static front-end (`public/`) and Node serverless functions (`api/`).

This README is updated to reflect the **current state of the repo**: it now contains both a legacy track pipeline and a newer normalized API/paywall foundation.

## Current project status ("the sitch")

- **Primary runtime:** Netlify static hosting + Netlify Functions (`netlify.toml` publishes `public/` and runs functions from `api/`).
- **Frontend:** modern player UI in `public/player.html` with modular scripts in `public/player/`.
- **Legacy content flow (actively used by player):**
  - Player loads from `/.netlify/functions/tracks` and `/.netlify/functions/albums`.
  - These functions read from `api/lib/legacyTracksStore.js`, which can use:
    - FTP JSON (`uploads/metadata/tracks.json` style path),
    - local JSON file (`storage/metadata/tracks.json`), or
    - Mongo legacy collection (`tracks_legacy` by default).
- **New normalized backend (partially integrated):**
  - `api/v1-*` endpoints for instance/releases/tracks/stream.
  - Mongo collections for `artists`, `releases`, `tracks`, `assets`, `products`, `entitlements`.
  - Upload + entitlement plumbing exists (`api/upload.js`, `api/stream.js`, PayPal webhook code), but the public player still uses legacy endpoints today.

## Repository survey

### Top-level layout

- `public/` – static app pages, player UI, admin pages, styles, and media assets.
- `api/` – serverless functions for tracks/albums CRUD, uploads, streaming, settings, share pages, v1 APIs, and PayPal hooks.
- `api/lib/` – shared helpers (DB connection, auth, IDs, entitlements, HTTP helpers, legacy and site settings stores).
- `scripts/` – setup/migration/bootstrap scripts for Mongo indexes and legacy->normalized migration.
- `docs/` – architecture notes and OpenAPI draft.
- `tools/` – one-off media/artwork helper scripts.
- `uploads/` – existing uploaded/static sample media assets in repo.

### Frontend pages of note

- `public/player.html` – main listening experience.
- `public/insert.html` – upload/track entry tooling.
- `public/edit.html`, `public/edit-albums.html`, `public/admin-settings.html` – admin interfaces.
- `public/install.html` – guided install page for env configuration copy/paste.
- `public/support.html` – support/paypal-oriented page.

### Serverless/API surface (high-level)

### Legacy + current player endpoints

- `api/tracks.js` – returns full legacy track list.
- `api/albums.js` – derived album list from published legacy tracks.
- `api/addTrack.js`, `api/edit.js`, `api/editAlbum.js` – legacy CRUD and metadata updates.
- `api/siteSettings.js` – read/write site settings via FTP JSON or local JSON.
- `api/uploadMedia.js` – FTP media uploader used by front-end upload flow.

### Normalized / v1 / paywall groundwork

- `api/v1-instance.js` – instance metadata and discovery flag.
- `api/v1-releases.js`, `api/v1-tracks.js` – normalized release/track reads.
- `api/v1-stream.js` -> `api/stream.js` – gated audio stream with Range support.
- `api/upload.js` – admin upload endpoint writing assets to `STORAGE_ROOT` and track+asset docs to Mongo.
- `api/paypalWebhook.js` + `api/lib/paypal.js` – webhook verification and entitlement grant path.

### Data/storage model in practice

### Legacy mode (currently used by main player)

Track docs look like:

```json
{
  "_id": "...",
  "albumName": "Album",
  "artistName": "Artist",
  "trackName": "Track",
  "trackNumber": 1,
  "mp3Url": "https://...",
  "artworkUrl": "https://...",
  "albumArtworkUrl": "https://...",
  "published": true
}
```

Storage backend selection for legacy tracks is controlled by `LEGACY_TRACK_STORE`:

- `auto` (default): prefers FTP if configured; otherwise file JSON; fallback behavior includes Mongo in some paths.
- `ftp-json`
- `file-json`
- `mongodb`

### Normalized mode (in-progress foundation)

Collections intended/used:

- `artists`
- `releases`
- `tracks`
- `assets`
- `products`
- `entitlements`

Setup and migration scripts:

- `npm run setup` – creates indexes.
- `npm run migrate` – migrates legacy tracks to normalized collections.
- `npm run fresh-install` – bootstrap helper that checks env, DB, setup, then migration.

## Environment variables

Core:

- `MONGODB_URI`
- `MONGODB_DB_NAME`
- `MONGODB_TRACKS_COLLECTION` (legacy collection, default `tracks_legacy`)
- `STORAGE_ROOT`
- `APP_BASE_URL`
- `DISCOVERY_OPT_IN`

FTP/media flow:

- `FTP_HOST`
- `FTP_USER`
- `FTP_PASSWORD`
- `FTP_PUBLIC_BASE_URL`
- `FTP_BASE_PATH` (optional, default `uploads`)
- `FTP_SECURE` (`true`/`false`)
- `TRACKS_JSON_REMOTE_PATH` (optional)
- `TRACKS_JSON_PATH` (optional local override)
- `SITE_SETTINGS_REMOTE_PATH` / `SITE_SETTINGS_PATH` (optional)
- `LEGACY_TRACK_STORE` (`auto|ftp-json|file-json|mongodb`)

Auth/payment:

- `ADMIN_PIN` (for admin-protected routes)
- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `PAYPAL_WEBHOOK_ID`
- `PAYPAL_API_BASE`

Use `.env.example` as the baseline template.

## Local development

```bash
npm install
npx netlify dev
```

Then open:

- Player: `http://localhost:8888/player.html`
- Installer: `http://localhost:8888/install.html`

Optional data/index preparation (requires running MongoDB + env configured):

```bash
npm run setup
npm run migrate
```

## Deployment

- Designed for Netlify deployment today (`netlify.toml`).
- Redirects include:
  - `/` -> `/player.html`
  - share links (`/album/:albumId`, `/track/:trackId`, etc.) -> `/.netlify/functions/makeSharePage`.

## Known gaps / technical debt

- Main player still relies on legacy endpoints rather than normalized `v1` APIs.
- Legacy and normalized data models coexist, increasing maintenance complexity.
- `server.js` exists as an Express-era local server artifact and is not the active Netlify runtime path.
- Repository includes many large static assets and historical uploads that are not part of app logic.

## License

MIT

## Author

Simon Indelicate

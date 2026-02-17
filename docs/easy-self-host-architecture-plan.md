# Architecture summary and incremental self-host plan

## 1) Current architecture summary (repo-specific)

### Runtime split (what runs where)
- **Frontend:** static site served from `public/` (main entry: `public/player.html`, modular player scripts under `public/player/`).
- **Backend:** Netlify Functions in `api/` (Node.js + MongoDB driver). Frontend fetches `/.netlify/functions/tracks` and `/.netlify/functions/albums` to hydrate the player.
- **Alternate/legacy backend:** `server.js` contains an Express app with `express-fileupload`, but deployment config (`netlify.toml`) points to static + functions, so Express is not part of the current Netlify runtime.

### How the player is populated
- Player boot sequence (`public/player/api.js`):
  1. Fetch all tracks from `/.netlify/functions/tracks`.
  2. Fetch albums from `/.netlify/functions/albums` (best-effort fallback).
  3. Filter out unpublished/excluded entries.
  4. Group/sort tracks by album and track number; derive `albumId` by slug when missing.
- Track playback source is taken directly from track fields (`mp3Url` first, then fallback audio URL fields in UI logic), and assigned to `Audio.src` client-side.
- Netlify redirects route shareable album/track URLs to `api/makeSharePage.js`, which resolves metadata and redirects back to `player.html` with query params.

### MongoDB usage now (collections, shapes, indexes)
- Connection config is centralized in `api/dbConfig.js` (URI + database + collection).
- Current app operates primarily on a **single collection** containing track documents; albums are inferred by grouping tracks with same `albumName`.
- Existing track/album-ish fields observed across API handlers:
  - Identity / grouping: `_id`, `albumName`, `albumId`, `trackName`, `trackNumber`.
  - Media URLs: `mp3Url`, `artworkUrl`, `albumArtworkUrl`.
  - Display/meta: `artistName`, `genre`, `year`, `trackMedium`, `trackText`, `bgcolor`.
  - Ops/state: `published`, `fav`, `playCount`, `durationSeconds`, `duration`, `createdAt`.
- No explicit `createIndex(...)` calls are present in `api/`; query performance relies on MongoDB defaults unless indexes were created manually outside code.

### Where audio files live and how they are served today
- README explicitly says there is **no upload pipeline** and artists must host MP3/art elsewhere and store URLs in MongoDB.
- Player streams directly from those URLs (`mp3Url`), so assets are usually remote/public files outside this app.
- `api/edit.js` does include deletion logic for local files when `mp3Url` is a relative path, but there is no in-app upload path in the active Netlify function set.

### Build/deploy assumptions baked into legacy system
- `netlify.toml` assumes Netlify deploy model: static publish dir (`public`) + serverless functions (`api`).
- README workflow assumes `netlify dev` locally.
- Secrets/config are currently hardcoded in `api/dbConfig.js` (including credentials), rather than environment variables.
- Support page embeds PayPal subscription buttons client-side only (`public/support.html`) without server-side entitlement handling.

---

## 2) What must change for “easy self-host on cheap hosting” (incremental, not rewrite)

### Current requirements that typical shared hosting may not support well
- **Netlify-specific runtime coupling:** `/.netlify/functions/*` path conventions + Netlify redirect behavior.
- **Hardcoded DB credentials in source:** unsafe and awkward for non-technical setup.
- **Assumption of externally hosted media URLs:** forces artists to source separate file hosting.
- **Public direct MP3 URLs:** incompatible with real paywall requirements.
- **No entitlement model / no webhook verification path:** current PayPal usage is donation/subscription embed, not purchase-gated content.
- **Potentially limited process/background support:** some cheap hosts may not allow ffmpeg/background workers; transcoding must be optional and synchronous/lightweight when used.

### Minimal migration path (keep product simple)
1. **Runtime adapter layer (first):**
   - Keep current API handler logic but wrap with a tiny compatibility layer so the same handlers can run on:
     - Netlify Functions (existing), and
     - a plain Node/Express route bundle for common VPS/cPanel Node hosting.
2. **Config hardening (early):**
   - Move Mongo URI, DB/collection names, PayPal credentials, storage root to env vars + `.env.example`.
   - Provide first-run “setup wizard” in-app that writes a local JSON settings file where env injection is unavailable.
3. **Internal upload pipeline (core requirement):**
   - Add authenticated admin endpoints for upload to local filesystem (`/storage/...`) and metadata extraction.
   - Persist relative asset paths in Mongo instead of third-party URLs by default.
4. **Access gateway for audio (paywall enforcement):**
   - Introduce `/api/stream/:trackId` endpoint that checks entitlement before serving bytes with HTTP Range.
   - Stop exposing permanent direct asset URLs for restricted tracks.
5. **Entitlement/payments model (minimal viable):**
   - Add products + entitlements collections.
   - Add PayPal order/subscription capture endpoint + webhook verification endpoint.
   - Grant entitlements on authoritative completion events.
6. **Optional API standardization:**
   - Add `/api/v1/releases`, `/tracks`, `/artists`, `/assets`, `/products` read endpoints.
   - Add instance manifest + optional discovery toggle.
7. **Backwards compatibility phase:**
   - Keep reading legacy fields (`mp3Url`, `albumName`) while writing new normalized structure.
   - Provide one migration script to generate release/track IDs and backfill collections.

Ordered this way, existing deployments keep working while self-host capabilities are added progressively.

---

## 3) Proposed standard data model + API outline

## ID strategy (stable IDs)
- Keep Mongo `_id` as internal primary key.
- Add stable public IDs:
  - `artistId`: `art_<base32(ulid)>`
  - `releaseId`: `rel_<base32(ulid)>`
  - `trackId`: `trk_<base32(ulid)>`
  - `assetId`: `ast_<base32(ulid)>`
  - `productId`: `prd_<base32(ulid)>`
  - `entitlementId`: `ent_<base32(ulid)>`
- IDs generated server-side on create; immutable.
- Keep optional `legacyObjectId` field during migration for traceability.

## Mongo collections and core document shapes

### `artists`
```json
{
  "_id": "ObjectId",
  "artistId": "art_01J...",
  "name": "Artist Name",
  "slug": "artist-name",
  "bio": "",
  "links": { "website": "", "instagram": "" },
  "createdAt": "ISODate",
  "updatedAt": "ISODate"
}
```
Indexes:
- unique: `artistId`
- unique: `slug`

### `releases`
```json
{
  "_id": "ObjectId",
  "releaseId": "rel_01J...",
  "artistId": "art_01J...",
  "type": "album",
  "title": "Release Title",
  "slug": "release-title",
  "year": 2025,
  "genre": "indie",
  "coverAssetId": "ast_01J...",
  "published": true,
  "trackIds": ["trk_..."],
  "createdAt": "ISODate",
  "updatedAt": "ISODate"
}
```
Indexes:
- unique: `releaseId`
- compound unique: `{ artistId: 1, slug: 1 }`
- filter/query: `{ published: 1, artistId: 1 }`

### `tracks`
```json
{
  "_id": "ObjectId",
  "trackId": "trk_01J...",
  "releaseId": "rel_01J...",
  "artistId": "art_01J...",
  "title": "Track Title",
  "slug": "track-title",
  "trackNumber": 1,
  "discNumber": 1,
  "durationSeconds": 212,
  "audioAssetId": "ast_01J...",
  "lyrics": "",
  "metadata": {
    "genre": "",
    "year": 2025,
    "isrc": ""
  },
  "access": {
    "mode": "public",
    "productIds": ["prd_..."]
  },
  "published": true,
  "createdAt": "ISODate",
  "updatedAt": "ISODate"
}
```
Indexes:
- unique: `trackId`
- compound: `{ releaseId: 1, trackNumber: 1 }`
- compound: `{ published: 1, releaseId: 1 }`

### `assets`
```json
{
  "_id": "ObjectId",
  "assetId": "ast_01J...",
  "ownerType": "track",
  "ownerId": "trk_01J...",
  "kind": "audio",
  "storage": {
    "diskPath": "storage/audio/art_.../rel_.../trk_.../source.mp3",
    "publicPath": null,
    "mime": "audio/mpeg",
    "bytes": 5234234,
    "sha256": "..."
  },
  "derived": [
    {
      "profile": "preview-96k",
      "diskPath": "storage/audio/.../preview-96k.mp3",
      "mime": "audio/mpeg",
      "bytes": 1245678
    }
  ],
  "createdAt": "ISODate"
}
```
Indexes:
- unique: `assetId`
- compound: `{ ownerType: 1, ownerId: 1, kind: 1 }`

### `products`
```json
{
  "_id": "ObjectId",
  "productId": "prd_01J...",
  "scope": "release",
  "scopeRef": "rel_01J...",
  "title": "Buy Release",
  "price": { "currency": "USD", "value": "8.00" },
  "paypal": {
    "productId": "PAYPAL_PRODUCT_ID",
    "planId": null
  },
  "active": true,
  "createdAt": "ISODate",
  "updatedAt": "ISODate"
}
```
Indexes:
- unique: `productId`
- compound: `{ scope: 1, scopeRef: 1, active: 1 }`

### `entitlements`
```json
{
  "_id": "ObjectId",
  "entitlementId": "ent_01J...",
  "listener": {
    "email": "fan@example.com",
    "paypalPayerId": "ABC123"
  },
  "productId": "prd_01J...",
  "scope": "release",
  "scopeRef": "rel_01J...",
  "source": {
    "provider": "paypal",
    "orderId": "5O...",
    "captureId": "7X...",
    "status": "COMPLETED"
  },
  "grantedAt": "ISODate",
  "expiresAt": null,
  "revokedAt": null
}
```
Indexes:
- unique partial: `{ "source.captureId": 1 }`
- lookup: `{ "listener.email": 1, scopeRef: 1, revokedAt: 1 }`

## JSON schema + OpenAPI outline (optional API)
- Add `openapi.yaml` with:
  - `GET /api/v1/artists`
  - `GET /api/v1/releases`
  - `GET /api/v1/releases/{releaseId}`
  - `GET /api/v1/releases/{releaseId}/tracks`
  - `GET /api/v1/tracks/{trackId}`
  - `GET /api/v1/stream/{trackId}` (auth/entitlement required when restricted)
  - `GET /api/v1/instance` (capabilities/discovery metadata)
- Components:
  - `Artist`, `Release`, `Track`, `Asset`, `Product`, `Entitlement`, `Error` schemas.
- Discovery:
  - `GET /api/v1/instance` returns `instanceId`, `baseUrl`, `apiVersion`, `discoveryOptIn`, and optional contact/genres.

---

## 4) Upload + metadata workflow design (simple hosting friendly)

### Admin flow
1. Artist logs into admin UI.
2. Creates/selects release draft.
3. Bulk uploads audio + artwork files via multipart form.
4. Server stores files on local disk immediately.
5. Server reads embedded tags (ID3/Vorbis/MP4) and pre-fills track form fields.
6. Artist reviews/edits metadata and access mode per track.
7. Publish release.

### Tag-reading behavior
- Parse title, artist, album, track number, disc number, year, genre, embedded artwork.
- Conflict rules:
  - Uploaded cover in UI wins over embedded art.
  - Explicit UI edits always win over tag-derived values.
- Save both:
  - normalized canonical fields, and
  - raw extracted tag payload for audit/debug.

### Storage layout on disk
```text
storage/
  artists/{artistId}/
    releases/{releaseId}/
      artwork/{assetId}.{ext}
      tracks/{trackId}/source.{ext}
      tracks/{trackId}/preview-96k.mp3   (optional)
```
- Store relative paths in DB; never absolute machine paths.
- Keep originals; derived files optional.

### Derived streaming formats (without exotic hosting)
- Baseline: stream original file with Range support (no transcoding required).
- Optional “generate preview” action in admin:
  - synchronous ffmpeg call when available,
  - otherwise disabled gracefully and originals still stream.
- No queue workers required for MVP; keep operations request-driven.

---

## 5) PayPal gating design (real enforcement)

### Payment → entitlement mapping
- Product is attached to release or track scope.
- Checkout creates PayPal order for product.
- On authoritative completion, create entitlement for payer email/payerId + scope.

### Authoritative webhook events
- One-time purchases:
  - `PAYMENT.CAPTURE.COMPLETED` is authoritative for granting.
- Subscription (if enabled later):
  - grant/maintain on `BILLING.SUBSCRIPTION.ACTIVATED` / payment completed events.
  - revoke/suspend on cancellation/suspension events.
- All webhook payloads must be verified via PayPal signature verification endpoint.

### Playback access flow (seek-safe, no permanent public URL)
1. Player requests `GET /api/v1/stream/{trackId}` with session token/cookie.
2. Server resolves track access mode:
   - public => allow.
   - restricted => require matching active entitlement.
3. Server streams bytes from local file and honors `Range` headers (`206 Partial Content`).
4. Response uses `Cache-Control: private, no-store` for restricted content.
5. Do **not** return raw filesystem/public URL for restricted tracks.

This preserves seeking while preventing simple URL sharing bypass.

---

## 6) “Easy self-host” installation plan

### Up-front (minimal)
1. Download release zip (or clone repo).
2. Copy `.env.example` to `.env` and set only:
   - `MONGODB_URI`
   - `APP_BASE_URL`
   - `ADMIN_BOOTSTRAP_EMAIL` + password
   - `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` / webhook ID (if gating enabled)
3. Run one command: `npm install`.
4. Run one command: `npm run setup` (creates indexes, settings doc, admin account).
5. Run app (`npm start`) or host-provided Node start command.

### In-app configuration (friendly UI)
- Site branding.
- Add artist/release details.
- Upload music/artwork in admin.
- Set public vs paid access per release/track.
- Connect PayPal using guided form (test connection button).

### Update strategy (non-breaking)
- Semantic versions + migration scripts:
  - `npm run migrate` runs idempotent schema/index updates.
- Keep compatibility layer for legacy fields during transition (`mp3Url`, `albumName`-grouped data).
- Backup guidance in admin before upgrade:
  - export Mongo docs,
  - tar `storage/` folder.
- Rolling deprecation schedule in changelog; no hard removals without at least one minor release overlap.

---

## Concrete refactor task list (execution order)

1. **Security/config baseline**
   - Move hardcoded credentials from `api/dbConfig.js` to env vars + `.env.example`.
2. **Data access abstraction**
   - Create repository layer so handlers stop directly depending on one legacy track collection shape.
3. **Schema migration script v1**
   - Generate stable IDs and backfill `artists`, `releases`, `tracks`, `assets` from existing track docs.
4. **Compatibility read endpoints**
   - Keep `/.netlify/functions/tracks` and `albums` responses stable while internally reading normalized collections.
5. **Admin auth + settings**
   - Add login/session for admin UI and setup wizard.
6. **Upload endpoints + UI**
   - Implement multipart upload, disk persistence, metadata extraction, review/edit workflow.
7. **Asset serving layer**
   - Add protected stream endpoint with Range support and access checks.
8. **Products/entitlements**
   - Add collections, admin product UI, entitlement evaluation helper.
9. **PayPal server integration**
   - Add order creation, webhook verification, entitlement grant/revoke logic.
10. **Optional public API v1 + OpenAPI**
    - Implement read endpoints and publish `openapi.yaml` + `instance` discovery endpoint.
11. **Self-host packaging**
    - Provide one-click-like scripts (`setup`, `migrate`, `backup`) and hosting-specific docs.
12. **Legacy cleanup (later)**
    - Remove obsolete Netlify-only assumptions once compatibility target hosts are validated.

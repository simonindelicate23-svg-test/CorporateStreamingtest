# Practical App Review and Clear Implementation Plan

This version is written for how the app is actually being used now:

- **Runtime:** Netlify (static files + Netlify Functions)
- **Persistent storage:** FTP-hosted files (media + JSON metadata/settings)
- **No database required for the main production workflow**

The target is simple:

1. Keep every working feature.
2. Remove redundant architecture.
3. Move to **one data model** and **one set of endpoints**.
4. Add PayPal gating in a way that fits FTP/JSON storage.
5. Make admin UX coherent and easier to use.
6. Expand site customization controls.

---

## 1) Current architecture (plain English)

## What matters operationally

### Deployment location (1)
- Netlify hosts:
  - public frontend pages
  - serverless functions (API)

### Persistent storage location (2)
- FTP stores:
  - uploaded audio and artwork files
  - JSON files for catalog + settings

That is already a complete architecture. You do **not** need a database to run this setup.

---

## 2) Main problems to fix (real redundancy)

### Problem A: Too many conceptual paths
The codebase includes legacy/db-style paths and FTP/JSON paths. You are running FTP/JSON. Keeping both causes confusion and duplicate maintenance.

**Decision:** adopt FTP/JSON as the only supported production model.

### Problem B: More than one endpoint family
There are overlapping endpoint styles in the repo. This causes uncertainty about “which API is canonical”.

**Decision:** define one canonical API contract and route all admin/player pages through it.

### Problem C: Admin pages feel inconsistent
Each page has its own local logic patterns and behavior style. Functionally usable, but not coherent.

**Decision:** standardize all admin pages around one shared admin UI layer.

---

## 3) Target architecture (single model, single API)

## Data model (single JSON model)
Use one canonical catalog JSON (for example `uploads/metadata/tracks.json`) with consistent fields for all tracks/releases.

Suggested minimal canonical shape:

```json
{
  "version": 1,
  "updatedAt": "2026-01-01T00:00:00.000Z",
  "releases": [
    {
      "releaseId": "string",
      "title": "string",
      "artist": "string",
      "coverImageUrl": "string",
      "year": 2026,
      "published": true,
      "featured": false,
      "tracks": [
        {
          "trackId": "string",
          "title": "string",
          "trackNumber": 1,
          "audioUrl": "https://...",
          "durationSeconds": 123,
          "published": true,
          "access": {
            "mode": "public",
            "productIds": []
          }
        }
      ]
    }
  ],
  "products": [
    {
      "productId": "string",
      "label": "Release purchase",
      "scope": "release",
      "scopeRef": "releaseId",
      "paypal": {
        "buttonOrPlanId": "string"
      },
      "active": true
    }
  ],
  "entitlements": []
}
```

Notes:
- `entitlements` can remain in a separate JSON file if preferred (better for write contention), e.g. `uploads/metadata/entitlements.json`.
- `site-settings.json` stays separate.

## API model (single endpoint set)
Canonical Netlify function surface:

- `GET /api/catalog` (public read)
- `POST /api/catalog` (admin write/update)
- `POST /api/upload-media` (admin upload to FTP)
- `GET /api/site-settings`
- `POST /api/site-settings`
- `GET /api/stream?trackId=...` (public/gated streaming)
- `POST /api/paypal-webhook`
- `GET /api/entitlements/resolve` (optional restore-access endpoint)

Everything else becomes internal adapter code or is removed after migration.

---

## 4) Exact work needed for PayPal gating (FTP/JSON architecture)

This section is deliberately direct and implementation-ready.

## Step 1: Mark paid content in catalog
- Add `access.mode` and `access.productIds` on tracks.
- Public tracks remain `mode: "public"`.
- Paid tracks use `mode: "paid"` with one or more product IDs.

## Step 2: Define products in JSON
- Create `products.json` or embed products in catalog JSON.
- Map each product to either:
  - one track,
  - one release,
  - or full-catalog scope.

## Step 3: Capture and persist entitlements from PayPal webhook
- Keep PayPal webhook verification.
- On `PAYMENT.CAPTURE.COMPLETED`:
  - resolve product
  - create entitlement record in `entitlements.json`:
    - payer id
    - payer email
    - productId
    - captureId
    - grantedAt
- Enforce idempotency by `captureId` (do nothing if already present).

## Step 4: Add a listener identity mechanism compatible with static frontend
Use one of these simple approaches:
- signed short-lived token in cookie after return from PayPal, or
- server-issued session token from “restore purchase” flow.

The stream endpoint should read that identity and check entitlements JSON.

## Step 5: Gate playback in stream endpoint
For a paid track:
- if entitlement exists -> stream audio
- else -> return 403 with structured payload for UI (`{ code: "PAYWALL_REQUIRED", productIds: [...] }`)

For public track:
- stream as normal

## Step 6: Frontend lock/unlock UX
Player should:
- show lock icon on paid tracks
- show purchase CTA when blocked
- include “already purchased? restore access”
- refresh unlocked state without full reload

## Step 7: Rollout protection
- Add `PAYWALL_ENABLED=true|false`
- If false: all tracks behave as public (safe rollback)

### Realistic effort (with minimal regression risk)
- Backend + webhook + entitlements JSON flow: 2–4 days
- Player lock/unlock UX + restore flow: 2–4 days
- Admin product assignment UI + QA: 2–3 days
- **Total:** ~1.5 to 2 weeks

---

## 5) Admin UX cleanup plan (without losing any feature)

## Objective
Make admin pages feel like one product, not separate scripts.

## Required changes

### A) One shared admin layer
Create a shared module used by all admin pages for:
- API calls
- status/toast messages
- error formatting
- cache handling
- unsaved-changes warnings

### B) Unified layout and behavior
All admin pages should have:
- same header/tabs
- same save/cancel action zone
- same success/error feedback style
- same loading/disabled states

### C) Consistent data editing patterns
- Inline edits on lists should behave the same way everywhere.
- Bulk operations should be available for publish/unpublish and release-level updates.

### D) Keep backward compatibility during migration
- Do not remove existing pages until replacements are verified.
- Keep old routes as aliases if needed.

---

## 6) Expanded site customization (exact fields to add)

Requested features can be cleanly added to `site-settings.json`.

Suggested structure:

```json
{
  "branding": {
    "siteTitle": "My Streaming Site",
    "brandName": "Artist Name",
    "logoUrl": "https://...",
    "faviconUrl": "https://..."
  },
  "theme": {
    "background": "#0f0f0f",
    "surface": "#1a1a1a",
    "text": "#ffffff",
    "mutedText": "#bdbdbd",
    "accent": "#ff3366",
    "accentContrast": "#ffffff",
    "border": "#2a2a2a"
  },
  "featuredRelease": {
    "enabled": true,
    "releaseId": "release-123",
    "title": "Release Title",
    "coverImageUrl": "https://...",
    "tagline": "...",
    "ctaText": "Listen now"
  },
  "footer": {
    "copyrightNotice": "© Artist 2026",
    "summaryHtml": "<strong>Support this project</strong>",
    "bodyHtml": "<p>Custom footer body...</p>",
    "layout": "columns",
    "links": [
      { "label": "Bandcamp", "url": "https://..." },
      { "label": "Contact", "url": "https://..." }
    ]
  }
}
```

## Admin UI controls to implement
- Color pickers for all `theme.*` fields
- Upload buttons for logo and favicon (using FTP media upload path)
- Toggle for `featuredRelease.enabled`
- Text input for copyright notice
- Rich-text or HTML textarea editor for footer
- Link-list editor for footer links

## Backward compatibility rule
If old keys exist (`footerSummary`, `footerContent`, etc.), map them into the new shape at load time so nothing breaks.

---

## 7) Immediate build order (recommended)

1. **Architecture cleanup decision in code:** FTP/JSON is canonical, remove DB-first assumptions from active paths.
2. **Canonical API layer:** one endpoint family used by player + admin.
3. **Site settings expansion:** colors, logo/favicon, featured toggle, footer controls.
4. **Admin UX unification:** shared admin module and consistent interactions.
5. **PayPal gating rollout:** product mapping, entitlements JSON, stream gate, lock/unlock UI.
6. **Retirement pass:** remove unused duplicate handlers once verified.

---

## 8) Non-negotiables (to preserve working behavior)

- Do not break FTP upload flow.
- Do not break JSON catalog editing flow.
- Do not remove currently working player behaviors until replacement is verified.
- Keep rollback switches for paywall features.
- Keep old settings readable while migrating to new settings shape.

This gives a clear path to the exact architecture you described: **Netlify app + FTP persistent storage, one model, one API, all current features preserved, and better admin/customization/paywall capabilities.**

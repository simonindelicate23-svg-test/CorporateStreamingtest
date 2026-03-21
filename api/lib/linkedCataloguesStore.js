/**
 * Linked catalogues — runtime merge of remote catalogue feeds.
 *
 * URLs are stored in siteSettings.linkedCatalogues as:
 *   [{ url, position: 'before'|'after'|'mix', label?, enabled? }, ...]
 *
 * At request time, each enabled catalogue is fetched (with a 5-minute
 * in-process TTL cache), converted to the local track format, and returned
 * for the caller to merge with local tracks.
 *
 * No data is written to tracks.json. Disabling or removing an entry in
 * siteSettings takes effect on the next request — fully reversible.
 */

const { loadSiteSettings } = require('./siteSettingsStore');

// ── In-process cache (warm Netlify instance reuse) ─────────────────────────
const CACHE_TTL_MS = 5 * 60 * 1000;
const _cache = new Map(); // url → { tracks, fetchedAt }

function _clearCache(url) {
  if (url) _cache.delete(url);
  else _cache.clear();
}

// ── Feed → local track format ──────────────────────────────────────────────

function _slugify(value = '') {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function _feedToTracks(feed, sourceOrigin) {
  const tracks = [];
  for (const release of feed.releases || []) {
    for (const t of release.tracks || []) {
      const track = {
        _id: String(t.id || ''),
        albumName: release.title || '',
        albumId: release.id || _slugify(`${release.artist || ''} ${release.title || ''}`),
        albumArtworkUrl: release.artworkUrl || '',
        artistName: release.artist || '',
        trackName: t.title || '',
        // audioUrl in the catalogue feed is the public, non-gated URL.
        // We use it directly as mp3Url — stream.js will 302-redirect to it.
        mp3Url: t.audioUrl || '',
        artworkUrl: t.artworkUrl || release.artworkUrl || '',
        published: true,
        paid: t.gated === true,
        _linkedFrom: sourceOrigin,
      };

      if (t.trackNumber != null) track.trackNumber = t.trackNumber;
      if (t.durationSeconds) { track.durationSeconds = t.durationSeconds; track.duration = t.durationSeconds; }
      if (t.genre) track.genre = t.genre;
      if (t.year) track.year = t.year;
      if (t.description) track.trackText = t.description;
      if (t.medium) track.trackMedium = t.medium;

      // Drop empty strings and undefined
      for (const k of Object.keys(track)) {
        if (track[k] === undefined || track[k] === '') delete track[k];
      }

      tracks.push(track);
    }
  }
  return tracks;
}

// ── Fetch with TTL cache ───────────────────────────────────────────────────

async function _fetchWithCache(catalogueUrl) {
  const hit = _cache.get(catalogueUrl);
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) return hit.tracks;

  const origin = new URL(catalogueUrl).origin;
  const response = await fetch(catalogueUrl, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${catalogueUrl}`);

  const feed = await response.json();
  const tracks = _feedToTracks(feed, origin);
  _cache.set(catalogueUrl, { tracks, fetchedAt: Date.now() });
  return tracks;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Returns an array of { tracks, position } for each enabled linked catalogue.
 * Never throws — failed fetches are logged and skipped.
 */
async function getLinkedGroups() {
  const settings = await loadSiteSettings().catch(() => ({}));
  const entries = (settings.linkedCatalogues || []).filter(
    (lc) => lc && lc.url && lc.enabled !== false
  );
  if (!entries.length) return [];

  const results = await Promise.allSettled(
    entries.map(async (lc) => {
      const tracks = await _fetchWithCache(lc.url);
      return { tracks, position: lc.position || 'after' };
    })
  );

  return results
    .map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      console.warn(`[linkedCatalogues] fetch failed for ${entries[i].url}: ${r.reason?.message}`);
      return null;
    })
    .filter(Boolean);
}

/**
 * Merges local tracks with linked groups according to each group's position.
 *   'before' → prepended
 *   'after'  → appended
 *   'mix'    → appended (player's existing alpha sort interleaves them)
 */
function mergeWithLinked(localTracks, linkedGroups) {
  const before = linkedGroups.filter((g) => g.position === 'before').flatMap((g) => g.tracks);
  const after  = linkedGroups.filter((g) => g.position !== 'before').flatMap((g) => g.tracks);
  return [...before, ...localTracks, ...after];
}

/**
 * Looks up a single track by _id across all enabled linked catalogues.
 * Used by stream.js as a fallback when the track isn't in the local store.
 */
async function findLinkedTrack(trackId) {
  const groups = await getLinkedGroups();
  for (const { tracks } of groups) {
    const found = tracks.find((t) => String(t._id || '').trim() === trackId);
    if (found) return found;
  }
  return null;
}

module.exports = { getLinkedGroups, mergeWithLinked, findLinkedTrack, _clearCache };

const { fetchTrackDurationSeconds } = require('./audioUtils');
const { loadTracks, saveTracks, withTrackIds } = require('./lib/legacyTracksStore');
const { isAdmin } = require('./lib/auth');

const json = (statusCode, payload, extraHeaders = {}) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', ...extraHeaders },
  body: JSON.stringify(payload),
});

// Public read responses: CDN/browser may cache for 30 s.
// stale-while-revalidate is intentionally omitted: serving stale data while
// revalidating from a warm instance that still holds an old in-memory cache
// would cause the CDN to keep refreshing its stale copy indefinitely.
const READ_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=30',
};

const toPublicTrack = ({ mp3Url, ...rest }) => rest;

const numericTrackFields = new Set(['trackNumber', 'playCount', 'durationSeconds', 'duration', 'year']);
const numericAlbumFields = new Set(['year', 'albumSortOrder']);

const generateTrackId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const normalizeTrackId = (track = {}) => String(track._id || track.id || '').trim();

function slugify(value = '') {
  return value
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function toTrackDocument(album = {}, track = {}) {
  const parsedTrackNumber = Number(track.trackNumber);
  const parsedDuration = Number(track.durationSeconds || track.duration || 0);
  const parsedYear = Number(track.year || album.year || 0);

  const document = {
    _id: track._id || generateTrackId(),
    albumName: typeof album.albumName === 'string' ? album.albumName.trim() : album.albumName,
    albumId: album.albumId || slugify(album.albumName || ''),
    albumArtworkUrl: album.albumArtworkUrl || album.artworkUrl,
    artistName: album.artistName,
    artworkUrl: album.artworkUrl,
    mp3Url: track.mp3Url,
    trackName: typeof track.trackName === 'string' ? track.trackName.trim() : track.trackName,
    trackNumber: Number.isNaN(parsedTrackNumber) ? track.trackNumber : parsedTrackNumber,
    durationSeconds: Number.isNaN(parsedDuration) || parsedDuration <= 0 ? undefined : parsedDuration,
    duration: Number.isNaN(parsedDuration) || parsedDuration <= 0 ? undefined : parsedDuration,
    trackMedium: track.trackMedium,
    trackText: track.trackText,
    bgcolor: track.bgcolor || album.bgcolor,
    genre: track.genre || album.genre,
    year: Number.isNaN(parsedYear) || parsedYear <= 0 ? undefined : parsedYear,
    fav: track.fav === true || track.fav === 'true',
    paid: track.paid === true || track.paid === 'true',
    published: track.published === false || track.published === 'false' ? false : album.published !== false,
    createdAt: track.createdAt ? new Date(track.createdAt) : new Date(),
  };

  return Object.fromEntries(Object.entries(document).filter(([_, v]) => v !== undefined && v !== ''));
}

function applyTrackUpdates(track = {}, updates = {}) {
  const updated = { ...track };
  Object.entries(updates).forEach(([key, value]) => {
    if (key === '_id' || key === 'id' || value === undefined) return;
    if (numericTrackFields.has(key) && value !== '') {
      const numericValue = Number(value);
      updated[key] = Number.isNaN(numericValue) ? value : numericValue;
      return;
    }
    if (key === 'published') {
      updated.published = value === false || value === 'false' ? false : Boolean(value);
      return;
    }
    if (key === 'fav') {
      updated.fav = value === true || value === 'true';
      return;
    }
    if (key === 'paid') {
      updated.paid = value === true || value === 'true';
      return;
    }
    updated[key] = value;
  });
  return updated;
}

function getAlbumsFromTracks(tracks = [], { includeUnpublished = false } = {}) {
  const byAlbum = new Map();
  const source = includeUnpublished ? tracks.filter(Boolean) : tracks.filter((t) => t?.published !== false);
  source.forEach((track) => {
    const albumKey = track.albumName || '';
    const existing = byAlbum.get(albumKey);
    if (!existing) {
      byAlbum.set(albumKey, {
        albumName: track.albumName,
        albumId: track.albumId,
        artistName: track.artistName,
        artworkUrl: track.artworkUrl,
        // Prefer artworkUrl so a replaced image is always reflected immediately,
        // even if albumArtworkUrl is still pointing at an older version.
        albumArtworkUrl: track.artworkUrl || track.albumArtworkUrl,
        bgcolor: track.bgcolor,
        genre: track.genre,
        year: track.year,
        albumSortOrder: track.albumSortOrder,
        published: track.published !== false,
        trackCount: 1,
      });
      return;
    }

    existing.trackCount += 1;
    // Any published track makes the album count as published in admin views.
    if (!existing.published && track.published !== false) existing.published = true;
    if (!existing.albumId && track.albumId) existing.albumId = track.albumId;
    if (!existing.artworkUrl && track.artworkUrl) {
      existing.artworkUrl = track.artworkUrl;
      existing.albumArtworkUrl = track.artworkUrl || track.albumArtworkUrl;
    }
  });

  return Array.from(byAlbum.values()).sort((a, b) => (a.albumName || '').localeCompare(b.albumName || ''));
}

function applyAlbumUpdates(track = {}, updates = {}) {
  const updated = { ...track };
  Object.entries(updates).forEach(([key, value]) => {
    if (value === undefined) return;
    if (value === null) { delete updated[key]; return; }
    if (numericAlbumFields.has(key) && value !== '') {
      const numericValue = Number(value);
      updated[key] = Number.isNaN(numericValue) ? value : numericValue;
      return;
    }
    if (key === 'published') {
      updated.published = value === false || value === 'false' ? false : Boolean(value);
      return;
    }
    updated[key] = value;
  });
  return updated;
}

async function populateAlbumDurations(tracks = [], albumName) {
  let updated = 0;
  const failures = [];

  for (const track of tracks) {
    if (String(track.albumName || '').trim() !== albumName) continue;
    if (!track.mp3Url) {
      failures.push({ id: track._id, reason: 'Missing mp3Url' });
      continue;
    }
    try {
      const seconds = await fetchTrackDurationSeconds(track.mp3Url);
      if (!seconds) {
        failures.push({ id: track._id, reason: 'Duration not detected' });
        continue;
      }
      track.durationSeconds = seconds;
      track.duration = seconds;
      updated += 1;
    } catch (error) {
      failures.push({ id: track._id, reason: error.message });
    }
  }

  return { updated, failures };
}

exports.handler = async (event) => {
  try {
    const loaded = await loadTracks();
    const { tracks, changed } = withTrackIds(loaded.tracks || []);
    if (changed) await saveTracks(tracks);

    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {};
      const resource = String(params.resource || 'bundle').toLowerCase();
      if (resource === 'track') {
        const requestedId = String(params.id || '').trim();
        const found = tracks.find((track) => normalizeTrackId(track) === requestedId);
        if (!found) return json(404, { message: 'Track not found' });
        // Return the full track (including mp3Url) to authenticated admins so
        // the edit page can display and compare the current audio URL.
        if (isAdmin(event)) return json(200, found);
        return json(200, toPublicTrack(found), READ_CACHE_HEADERS);
      }
      if (resource === 'tracks') return json(200, tracks.map(toPublicTrack), isAdmin(event) ? {} : READ_CACHE_HEADERS);
      if (resource === 'albums') {
        // Admins see all albums (including fully-unpublished ones) so the
        // edit-albums dropdown doesn't hide releases after a bulk-unpublish.
        const adminView = isAdmin(event);
        const albums = getAlbumsFromTracks(tracks, { includeUnpublished: adminView });
        return json(200, albums, adminView ? {} : READ_CACHE_HEADERS);
      }
      const publicTracks = tracks.map(toPublicTrack);
      return json(200, { tracks: publicTracks, albums: getAlbumsFromTracks(tracks) }, READ_CACHE_HEADERS);
    }

    if (event.httpMethod !== 'POST') return json(405, { message: 'Method not allowed' });

    if (!isAdmin(event)) return json(401, { message: 'Unauthorized' });

    const body = JSON.parse(event.body || '{}');
    const action = String(body.action || '').trim();

    if (!action) return json(400, { message: 'action is required' });

    if (action === 'addReleaseTracks') {
      const album = body.album || {};
      const incomingTracks = Array.isArray(body.tracks) ? body.tracks : [];
      if (!album.albumName || !incomingTracks.length) return json(400, { message: 'album.albumName and tracks are required' });
      const built = incomingTracks.map((track) => toTrackDocument(album, track));
      tracks.push(...built);
      const result = await saveTracks(tracks);
      return json(200, { message: 'Tracks added', count: built.length, store: result.store, path: result.path });
    }

    if (action === 'updateTrack') {
      const requestedId = String(body.id || body._id || '').trim();
      if (!requestedId) return json(400, { message: 'id is required' });
      const index = tracks.findIndex((track) => normalizeTrackId(track) === requestedId);
      if (index < 0) return json(404, { message: 'Track not found' });
      tracks[index] = applyTrackUpdates(tracks[index], body.updates || body);
      const result = await saveTracks(tracks);
      return json(200, { message: 'Track updated', store: result.store, path: result.path });
    }

    if (action === 'deleteTrack') {
      const requestedId = String(body.id || body._id || '').trim();
      if (!requestedId) return json(400, { message: 'id is required' });
      const index = tracks.findIndex((track) => normalizeTrackId(track) === requestedId);
      if (index < 0) return json(404, { message: 'Track not found' });
      tracks.splice(index, 1);
      const result = await saveTracks(tracks);
      return json(200, { message: 'Track deleted', store: result.store, path: result.path });
    }

    if (action === 'deleteAlbum') {
      // albumName may be null/undefined to target phantom tracks with no album.
      const albumName = Object.prototype.hasOwnProperty.call(body, 'albumName') ? body.albumName : undefined;
      if (albumName === undefined) return json(400, { message: 'albumName is required (pass null to delete tracks with no album name)' });
      const isPhantom = albumName === null || String(albumName).trim() === '';
      let removed = 0;
      const remaining = tracks.filter((track) => {
        const matches = isPhantom ? !String(track.albumName || '').trim() : String(track.albumName || '').trim() === String(albumName || '').trim();
        if (matches) { removed += 1; return false; }
        return true;
      });
      if (!removed) return json(404, { message: 'Album not found or has no tracks' });
      const result = await saveTracks(remaining);
      return json(200, { message: 'Album deleted', removed, store: result.store, path: result.path });
    }

    if (action === 'updateAlbum') {
      const albumName = String(body.albumName || '').trim();
      if (!albumName) return json(400, { message: 'albumName is required' });
      const updates = body.updates || {};
      const newAlbumName = updates.albumName ? String(updates.albumName).trim() : null;
      const derivedOldSlug = slugify(albumName);
      let matched = 0;
      tracks.forEach((track, idx) => {
        if (String(track.albumName || '').trim() !== albumName) return;
        matched += 1;
        let effectiveUpdates = updates;
        // When renaming, auto-derive albumId from the new name if the existing
        // albumId was auto-derived from the old name (or absent). Custom albumIds
        // set by the user are left untouched.
        if (newAlbumName && !updates.albumId) {
          const trackAlbumId = track.albumId || '';
          if (!trackAlbumId || trackAlbumId === derivedOldSlug) {
            effectiveUpdates = { ...effectiveUpdates, albumId: slugify(newAlbumName) };
          }
        }
        // Keep albumArtworkUrl in sync with artworkUrl whenever they have
        // diverged and albumArtworkUrl is not explicitly being set. This heals
        // data where a previous save only wrote artworkUrl, leaving
        // albumArtworkUrl frozen at the original value.
        if (!updates.albumArtworkUrl) {
          const target = updates.artworkUrl || track.artworkUrl || '';
          if (target && (track.albumArtworkUrl || '') !== target) {
            effectiveUpdates = { ...effectiveUpdates, albumArtworkUrl: target };
          }
        }
        tracks[idx] = applyAlbumUpdates(track, effectiveUpdates);
      });
      if (!matched) return json(404, { message: 'Album not found' });

      // Use the post-rename album name so populateAlbumDurations can find the tracks.
      const effectiveAlbumName = newAlbumName || albumName;
      const response = { albumName: effectiveAlbumName, updatedFields: Object.keys(updates) };
      if (body.populateDurations) response.durationUpdate = await populateAlbumDurations(tracks, effectiveAlbumName);
      const result = await saveTracks(tracks);
      return json(200, { ...response, store: result.store, path: result.path });
    }

    return json(400, { message: `Unsupported action: ${action}` });
  } catch (error) {
    console.error('catalog handler failed', error);
    return json(500, { message: 'Catalog request failed', detail: error.message });
  }
};

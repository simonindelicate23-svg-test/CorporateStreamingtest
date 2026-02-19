const { fetchTrackDurationSeconds } = require('./audioUtils');
const { loadTracks, saveTracks, withTrackIds } = require('./lib/legacyTracksStore');

const jsonResponse = (statusCode, payload) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

function albumSortKey(track = {}) {
  return `${track.artistName || ''} ${track.albumName || ''}`.trim().toLowerCase();
}

function getAlbumsFromTracks(tracks = []) {
  const byAlbum = new Map();

  tracks.forEach((track) => {
    const albumKey = `${track.albumName || ''}::${track.artistName || ''}`;
    const existing = byAlbum.get(albumKey);

    if (!existing) {
      byAlbum.set(albumKey, {
        albumName: track.albumName,
        albumId: track.albumId,
        artistName: track.artistName,
        artworkUrl: track.artworkUrl,
        albumArtworkUrl: track.albumArtworkUrl,
        bgcolor: track.bgcolor,
        genre: track.genre,
        year: track.year,
        published: track.published !== false,
        trackCount: 1,
      });
      return;
    }

    existing.trackCount += 1;
    existing.published = existing.published && track.published !== false;

    if (!existing.albumId && track.albumId) existing.albumId = track.albumId;
    if (!existing.artworkUrl && track.artworkUrl) existing.artworkUrl = track.artworkUrl;
    if (!existing.albumArtworkUrl && track.albumArtworkUrl) existing.albumArtworkUrl = track.albumArtworkUrl;
    if (!existing.bgcolor && track.bgcolor) existing.bgcolor = track.bgcolor;
    if (!existing.genre && track.genre) existing.genre = track.genre;
    if (!existing.year && track.year) existing.year = track.year;
  });

  return Array.from(byAlbum.values()).sort((a, b) => albumSortKey(a).localeCompare(albumSortKey(b)));
}

function buildUpdateDocument(updates = {}) {
  const updateDocument = {};
  const numericFields = new Set(['year']);

  Object.entries(updates).forEach(([key, value]) => {
    if (value === undefined) return;

    if (numericFields.has(key) && value !== '') {
      const numericValue = Number(value);
      updateDocument[key] = Number.isNaN(numericValue) ? value : numericValue;
      return;
    }

    if (key === 'published') {
      updateDocument.published = value === false || value === 'false' ? false : Boolean(value);
      return;
    }

    updateDocument[key] = value;
  });

  return updateDocument;
}

async function populateAlbumDurations(tracks = [], albumName) {
  const failures = [];
  let updated = 0;

  for (const track of tracks) {
    if (track.albumName !== albumName) continue;
    if (!track.mp3Url) {
      failures.push({ id: track._id, reason: 'Missing mp3Url' });
      continue;
    }

    try {
      const durationSeconds = await fetchTrackDurationSeconds(track.mp3Url);
      if (!durationSeconds) {
        failures.push({ id: track._id, reason: 'Duration not detected' });
        continue;
      }

      track.durationSeconds = durationSeconds;
      track.duration = durationSeconds;
      updated += 1;
    } catch (error) {
      failures.push({ id: track._id, reason: error.message });
    }
  }

  return {
    processed: tracks.filter((track) => track.albumName === albumName).length,
    updated,
    failures,
  };
}

exports.handler = async (event) => {
  try {
    const loaded = await loadTracks();
    const { tracks, changed } = withTrackIds(loaded.tracks || []);

    if (changed) await saveTracks(tracks);

    if (event.httpMethod === 'GET') {
      return jsonResponse(200, getAlbumsFromTracks(tracks));
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { albumName, updates = {}, populateDurations } = body;

      if (!albumName) return jsonResponse(400, { message: 'Missing albumName' });

      const updateDocument = buildUpdateDocument(updates);
      const response = { albumName };
      let hasMutation = false;

      if (Object.keys(updateDocument).length > 0) {
        tracks.forEach((track) => {
          if (track.albumName === albumName) {
            Object.assign(track, updateDocument);
          }
        });
        response.updatedFields = Object.keys(updateDocument);
        hasMutation = true;
      }

      if (populateDurations) {
        response.durationUpdate = await populateAlbumDurations(tracks, albumName);
        hasMutation = true;
      }

      if (!hasMutation) return jsonResponse(400, { message: 'No updates requested' });

      const result = await saveTracks(tracks);
      response.store = result.store;
      response.path = result.path;

      return jsonResponse(200, response);
    }

    return jsonResponse(405, { message: 'Method not allowed' });
  } catch (error) {
    console.error('Album edit failed', error);
    return jsonResponse(500, { message: 'Album edit failed', detail: error.message });
  }
};

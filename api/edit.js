const fs = require('fs');
const path = require('path');
const { loadTracks, saveTracks, withTrackIds } = require('./lib/legacyTracksStore');

const jsonResponse = (statusCode, payload) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

const numericFields = new Set(['trackNumber', 'playCount', 'durationSeconds', 'duration', 'year']);

function normalizeTrackId(track = {}) {
  return String(track._id || track.id || '').trim();
}

function applyTrackUpdates(track = {}, updates = {}) {
  const updated = { ...track };

  Object.entries(updates).forEach(([key, value]) => {
    if (key === '_id' || key === 'id' || value === undefined) return;

    if (numericFields.has(key) && value !== '') {
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

    updated[key] = value;
  });

  return updated;
}

async function removeLocalTrackFile(track = {}) {
  const mp3Url = track.mp3Url;
  const isLocalFile = mp3Url && !/^https?:\/\//i.test(mp3Url);
  if (!isLocalFile) return;

  const targetPath = path.resolve(__dirname, '..', mp3Url.replace(/^\//, ''));
  try {
    const stats = await fs.promises.stat(targetPath);
    if (stats.isFile()) await fs.promises.unlink(targetPath);
  } catch (error) {
    console.warn(`Could not remove local file ${targetPath}:`, error.message);
  }
}

exports.handler = async (event) => {
  try {
    const loaded = await loadTracks();
    const { tracks: tracksWithIds, changed } = withTrackIds(loaded.tracks || []);

    if (changed) {
      await saveTracks(tracksWithIds);
    }

    if (event.httpMethod === 'GET') {
      const { id } = event.queryStringParameters || {};

      if (id) {
        const track = tracksWithIds.find((entry) => normalizeTrackId(entry) === String(id));
        if (!track) return jsonResponse(404, { message: 'Track not found' });
        return jsonResponse(200, track);
      }

      return jsonResponse(200, tracksWithIds);
    }

    if (event.httpMethod === 'POST') {
      const requestBody = JSON.parse(event.body || '{}');
      const requestedId = String(requestBody._id || requestBody.id || '').trim();
      if (!requestedId) return jsonResponse(400, { message: 'Missing track id' });

      const trackIndex = tracksWithIds.findIndex((track) => normalizeTrackId(track) === requestedId);
      if (trackIndex < 0) return jsonResponse(404, { message: 'Track not found' });

      tracksWithIds[trackIndex] = applyTrackUpdates(tracksWithIds[trackIndex], requestBody);
      const result = await saveTracks(tracksWithIds);

      return jsonResponse(200, { message: 'Track updated!', store: result.store, path: result.path });
    }

    if (event.httpMethod === 'DELETE') {
      const requestBody = JSON.parse(event.body || '{}');
      const requestedId = String(requestBody.id || requestBody._id || '').trim();
      if (!requestedId) return jsonResponse(400, { message: 'Missing track id' });

      const trackIndex = tracksWithIds.findIndex((track) => normalizeTrackId(track) === requestedId);
      if (trackIndex < 0) return jsonResponse(404, { message: 'Track not found' });

      const [removedTrack] = tracksWithIds.splice(trackIndex, 1);
      await removeLocalTrackFile(removedTrack);
      const result = await saveTracks(tracksWithIds);

      return jsonResponse(200, { message: 'Track deleted', store: result.store, path: result.path });
    }

    return jsonResponse(405, { message: 'Method not allowed' });
  } catch (error) {
    console.error(error);
    return jsonResponse(500, { message: 'Failed to process request', detail: error.message });
  }
};

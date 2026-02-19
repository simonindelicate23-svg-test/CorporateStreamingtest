const { fetchTrackDurationSeconds } = require('./audioUtils');
const { appendTracks } = require('./lib/legacyTracksStore');

const jsonResponse = (statusCode, payload) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

const generateTrackId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const toTrackDocument = async (album, track, defaultPublished) => {
  let durationSeconds = 0;
  const providedDuration = track.durationSeconds || track.duration;

  if (providedDuration) {
    const parsed = Number(providedDuration);
    durationSeconds = Number.isNaN(parsed) ? 0 : parsed;
  }

  if (!durationSeconds && track.mp3Url) {
    try {
      durationSeconds = await fetchTrackDurationSeconds(track.mp3Url);
    } catch (err) {
      console.error(`Failed to derive duration for ${track.trackName}:`, err.message);
    }
  }

  const document = {
    _id: track._id || generateTrackId(),
    albumName: album.albumName,
    albumId: album.albumId,
    albumArtworkUrl: album.albumArtworkUrl || album.artworkUrl,
    artistName: album.artistName,
    artworkUrl: album.artworkUrl,
    mp3Url: track.mp3Url,
    trackName: track.trackName,
    trackNumber: Number(track.trackNumber) || track.trackNumber,
    durationSeconds: durationSeconds || undefined,
    duration: durationSeconds || undefined,
    trackMedium: track.trackMedium,
    trackText: track.trackText,
    bgcolor: track.bgcolor || album.bgcolor,
    genre: track.genre || album.genre,
    year: track.year || album.year,
    fav: track.fav === true || track.fav === 'true',
    published: track.published === false ? false : defaultPublished,
    createdAt: track.createdAt ? new Date(track.createdAt) : new Date(),
  };

  return Object.fromEntries(
    Object.entries(document).filter(([_, value]) => value !== undefined && value !== '')
  );
};

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return jsonResponse(405, { message: 'Method not allowed' });
    }

    const data = JSON.parse(event.body || '{}');
    const album = data.album || {};
    const tracks = Array.isArray(data.tracks) ? data.tracks : [];

    if (!album.albumName || !tracks.length) {
      return jsonResponse(400, { message: 'album.albumName and at least one track are required' });
    }

    const published = album.published === false || album.published === 'false' ? false : true;

    const trackDocuments = [];
    for (const track of tracks) {
      trackDocuments.push(await toTrackDocument(album, track, published));
    }

    const result = await appendTracks(trackDocuments);

    return jsonResponse(200, {
      message: 'Tracks added!',
      count: trackDocuments.length,
      store: result.store,
      path: result.path,
    });
  } catch (err) {
    console.error(err);
    return jsonResponse(500, {
      message: 'Failed to add tracks',
      detail: err.message,
    });
  }
};

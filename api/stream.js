const { loadTracks } = require('./lib/legacyTracksStore');
const { findLinkedTrack } = require('./lib/linkedCataloguesStore');
const { json } = require('./lib/http');
const { verifyToken } = require('./lib/tokenAuth');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { message: 'Method not allowed' });

  const trackId = event.queryStringParameters?.trackId;
  if (!trackId) return json(400, { message: 'trackId is required' });

  const { tracks } = await loadTracks();
  let track = tracks.find((t) => String(t._id || '').trim() === trackId);

  // Fall back to linked catalogues if not found in the local store
  if (!track) {
    track = await findLinkedTrack(trackId).catch(() => null);
  }

  if (!track || track.published === false) return json(404, { message: 'Track not found' });
  if (!track.mp3Url) return json(404, { message: 'Audio not available' });

  if (track.paid === true) {
    const rawToken = event.queryStringParameters?.accessToken;
    const payload = verifyToken(rawToken);
    if (!payload) return json(403, { message: 'Purchase required' });
    // scope: 'all' grants access to everything; future scopes can be added here
    if (payload.scope !== 'all') return json(403, { message: 'Purchase required' });
  }

  return {
    statusCode: 302,
    headers: {
      Location: track.mp3Url,
      'Cache-Control': 'private, no-store',
    },
    body: '',
  };
};

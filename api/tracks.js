const { loadTracks } = require('./lib/legacyTracksStore');

exports.handler = async () => {
  try {
    const { tracks } = await loadTracks();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tracks),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Failed to load tracks', detail: err.message }),
    };
  }
};

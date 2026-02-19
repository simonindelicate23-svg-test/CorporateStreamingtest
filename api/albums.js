const { loadTracks } = require('./lib/legacyTracksStore');

function isPublishedTrack(track) {
  return track?.published !== false;
}

exports.handler = async () => {
  try {
    const { tracks } = await loadTracks();
    const publishedTracks = tracks.filter(isPublishedTrack);

    const byAlbum = new Map();
    for (const track of publishedTracks) {
      const albumName = track?.albumName;
      if (!albumName) continue;

      if (!byAlbum.has(albumName)) {
        byAlbum.set(albumName, {
          albumName,
          artworkUrl: track.artworkUrl,
          albumArtworkUrl: track.albumArtworkUrl || track.artworkUrl,
        });
      }
    }

    const albums = Array.from(byAlbum.values()).sort((a, b) => (a.albumName || '').localeCompare(b.albumName || ''));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(albums),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Failed to load albums', detail: err.message }),
    };
  }
};

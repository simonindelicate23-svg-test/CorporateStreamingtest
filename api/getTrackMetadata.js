const { fetchPartialAudio, parseBitrateFromFrame } = require('./audioUtils');
const { parseId3v2 } = require('./lib/id3');
const { isAdmin } = require('./lib/auth');

const json = (statusCode, payload) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=300' },
  body: JSON.stringify(payload),
});

exports.handler = async (event) => {
  if (!isAdmin(event)) return json(401, { message: 'Unauthorized' });

  const url = (event.queryStringParameters || {}).url;
  if (!url) return json(400, { message: 'url query parameter is required' });

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch (_e) {
    return json(400, { message: 'Invalid URL' });
  }

  // Only fetch HTTP(S) resources
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return json(400, { message: 'Only http/https URLs are supported' });
  }

  try {
    const { buffer, totalSize } = await fetchPartialAudio(url, 262144);
    const id3 = parseId3v2(buffer);
    const bitrate = parseBitrateFromFrame(buffer);
    const durationSeconds = bitrate && totalSize ? Math.round((totalSize * 8) / (bitrate * 1000)) : null;

    return json(200, {
      trackName: id3.title || null,
      artistName: id3.artist || null,
      albumName: id3.album || null,
      trackNumber: id3.trackNumber ? String(id3.trackNumber).replace(/\D.*$/, '') : null,
      year: id3.year || null,
      genre: id3.genre || null,
      durationSeconds,
    });
  } catch (error) {
    return json(502, { message: 'Could not fetch or parse audio', detail: error.message });
  }
};

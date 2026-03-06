const { fetchPartialAudio, parseDurationFromFirstFrame, parseBitrateFromFrame, syncSafeToInt } = require('./audioUtils');
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

  const includeArtwork = (event.queryStringParameters || {}).includeArtwork === 'true';

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch (_e) {
    return json(400, { message: 'Invalid URL' });
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return json(400, { message: 'Only http/https URLs are supported' });
  }

  try {
    // Fetch the first 256 KB for ID3 tag parsing; also resolve bitrate (which
    // handles files with oversized tags by fetching past them if needed).
    const { buffer, totalSize } = await fetchPartialAudio(url, 262144);
    const id3 = parseId3v2(buffer);

    let durationSeconds = null;

    // 1. TLEN tag — milliseconds stored directly in the ID3 header
    if (id3.durationMs) {
      durationSeconds = Math.round(id3.durationMs / 1000);
    }

    if (!durationSeconds) {
      // Locate audio data, fetching past an oversized ID3 tag if needed
      let id3Offset = 0;
      if (buffer.length >= 10 && buffer.subarray(0, 3).toString('utf8') === 'ID3') {
        id3Offset = 10 + syncSafeToInt(buffer.subarray(6, 10));
      }
      let audioSlice = id3Offset > 0 && id3Offset < buffer.length ? buffer.subarray(id3Offset) : buffer;
      if (id3Offset > buffer.length) {
        try {
          const { buffer: frameChunk } = await fetchPartialAudio(url, 8192, undefined, id3Offset);
          audioSlice = frameChunk;
        } catch (_) {}
      }

      // 2. Xing/Info/VBRI header — exact frame count (VBR and LAME-encoded CBR)
      durationSeconds = parseDurationFromFirstFrame(audioSlice, 0);

      // 3. CBR fallback: audio bytes ÷ bitrate
      if (durationSeconds === null) {
        const bitrate = parseBitrateFromFrame(audioSlice);
        const audioBytes = totalSize - id3Offset;
        durationSeconds = bitrate && audioBytes > 0 ? Math.round((audioBytes * 8) / (bitrate * 1000)) : null;
      }
    }

    // Artwork: only pay the cost of fetching / encoding the image when explicitly requested.
    let artworkDataUrl = null;
    const hasEmbeddedArtwork = !!(id3.artwork || id3.artworkRef);

    if (includeArtwork && hasEmbeddedArtwork) {
      if (id3.artwork) {
        // Image was fully within the first 256 KB
        artworkDataUrl = `data:${id3.artwork.mimeType};base64,${id3.artwork.data.toString('base64')}`;
      } else if (id3.artworkRef && id3.artworkRef.dataSize <= 8 * 1024 * 1024) {
        // Image starts beyond the 256 KB window — fetch it directly by file offset
        try {
          const { buffer: imgBuf } = await fetchPartialAudio(
            url,
            id3.artworkRef.dataSize,
            undefined,
            id3.artworkRef.fileOffset
          );
          artworkDataUrl = `data:${id3.artworkRef.mimeType};base64,${imgBuf.toString('base64')}`;
        } catch (_) {}
      }
    }

    return json(200, {
      trackName: id3.title || null,
      artistName: id3.artist || null,
      albumName: id3.album || null,
      trackNumber: id3.trackNumber ? String(id3.trackNumber).replace(/\D.*$/, '') : null,
      year: id3.year || null,
      genre: id3.genre || null,
      durationSeconds,
      hasEmbeddedArtwork,
      artworkDataUrl,
    });
  } catch (error) {
    return json(502, { message: 'Could not fetch or parse audio', detail: error.message });
  }
};

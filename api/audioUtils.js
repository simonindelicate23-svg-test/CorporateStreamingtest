const BITRATES = {
  V1L1: [null, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, null],
  V1L2: [null, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, null],
  V1L3: [null, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, null],
  V2L1: [null, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256, null],
  V2L2: [null, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, null],
  V2L3: [null, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, null],
};

function parseTotalSize(headers, bufferLength) {
  const contentRange = headers.get('content-range');
  if (contentRange) {
    const match = contentRange.match(/\/(\d+)$/);
    if (match) return Number(match[1]);
  }
  const contentLength = headers.get('content-length');
  if (contentLength) return Number(contentLength);
  return bufferLength;
}

// ID3v2 sync-safe integer (4 bytes, 7 bits each)
function syncSafeToInt(buf) {
  return ((buf[0] & 0x7f) << 21) | ((buf[1] & 0x7f) << 14) | ((buf[2] & 0x7f) << 7) | (buf[3] & 0x7f);
}

function parseBitrateFromFrame(buffer) {
  for (let i = 0; i < buffer.length - 4; i += 1) {
    if (buffer[i] !== 0xff || (buffer[i + 1] & 0xe0) !== 0xe0) continue;

    const versionBits = (buffer[i + 1] >> 3) & 0x03;
    const layerBits = (buffer[i + 1] >> 1) & 0x03;
    const bitrateIndex = (buffer[i + 2] >> 4) & 0x0f;
    const sampleRateIndex = (buffer[i + 2] >> 2) & 0x03;

    if (versionBits === 1 || layerBits === 0 || bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) {
      continue;
    }

    const version = versionBits === 3 ? '1' : '2';
    const layer = layerBits === 3 ? '1' : layerBits === 2 ? '2' : '3';
    const tableKey = `V${version}L${layer}`;
    const bitrate = BITRATES[tableKey]?.[bitrateIndex];
    if (bitrate) return bitrate;
  }
  return 0;
}

// Fetches a byte range from a URL.
// startByte defaults to 0; used when skipping past a large ID3 tag.
async function fetchPartialAudio(url, byteCount = 262144, signal, startByte = 0) {
  const end = startByte + byteCount - 1;
  const response = await fetch(url, {
    headers: {
      Range: `bytes=${startByte}-${end}`,
    },
    ...(signal ? { signal } : {}),
  });

  if (!response.ok && response.status !== 206) {
    throw new Error(`Failed to download audio (${response.status})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const totalSize = parseTotalSize(response.headers, buffer.length + startByte);

  return { buffer, totalSize };
}

// Returns the bitrate for a URL, fetching past an oversized ID3 tag if needed.
// Also returns id3Offset (bytes consumed by the ID3v2 header + tag body) so
// callers can subtract it from totalSize before computing duration.
// signal is optional AbortSignal.
async function fetchBitrate(url, signal) {
  const { buffer, totalSize } = await fetchPartialAudio(url, 262144, signal);

  // Determine how many bytes at the start of the file belong to the ID3v2 tag.
  // These bytes are metadata (titles, artwork, …) and must not be counted as
  // audio data when estimating duration from file size ÷ bitrate.
  let id3Offset = 0;
  if (buffer.length >= 10 && buffer.subarray(0, 3).toString('utf8') === 'ID3') {
    id3Offset = 10 + syncSafeToInt(buffer.subarray(6, 10));
  }

  let bitrate = parseBitrateFromFrame(buffer);

  // If no frame found and the ID3 tag extends beyond our 256 KB window
  // (e.g. a large embedded album art), fetch a small chunk from just after
  // the tag where the actual audio frames start.
  if (!bitrate && id3Offset > buffer.length) {
    try {
      const { buffer: frameChunk } = await fetchPartialAudio(url, 8192, signal, id3Offset);
      bitrate = parseBitrateFromFrame(frameChunk);
    } catch (_) {
      // best-effort; fall through with bitrate=0
    }
  }

  return { bitrate, totalSize, id3Offset };
}

async function fetchTrackDurationSeconds(url, signal) {
  if (!url) return 0;
  const { bitrate, totalSize, id3Offset } = await fetchBitrate(url, signal);
  if (!bitrate || !totalSize) return 0;
  const audioBytes = totalSize - id3Offset;
  return Math.round((audioBytes * 8) / (bitrate * 1000));
}

module.exports = {
  fetchTrackDurationSeconds,
  fetchPartialAudio,
  fetchBitrate,
  parseBitrateFromFrame,
};

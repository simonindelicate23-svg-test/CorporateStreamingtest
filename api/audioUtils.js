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

async function fetchPartialAudio(url, byteCount = 262144) {
  const response = await fetch(url, {
    headers: {
      Range: `bytes=0-${byteCount - 1}`,
    },
  });

  if (!response.ok && response.status !== 206) {
    throw new Error(`Failed to download audio (${response.status})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const totalSize = parseTotalSize(response.headers, buffer.length);

  return { buffer, totalSize };
}

async function fetchTrackDurationSeconds(url) {
  if (!url) return 0;

  const { buffer, totalSize } = await fetchPartialAudio(url);
  const bitrate = parseBitrateFromFrame(buffer);

  if (!bitrate || !totalSize) return 0;

  return Math.round((totalSize * 8) / (bitrate * 1000));
}

module.exports = {
  fetchTrackDurationSeconds,
  fetchPartialAudio,
  parseBitrateFromFrame,
};

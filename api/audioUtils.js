const BITRATES = {
  V1L1: [null, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, null],
  V1L2: [null, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, null],
  V1L3: [null, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, null],
  V2L1: [null, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256, null],
  V2L2: [null, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, null],
  V2L3: [null, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, null],
};

// Sample rates by [versionIdx][sampleRateIndex]; versionIdx: 0=MPEG1, 1=MPEG2, 2=MPEG2.5
const SAMPLE_RATES = [
  [44100, 48000, 32000],
  [22050, 24000, 16000],
  [11025, 12000, 8000],
];

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

// Read the Xing/Info (LAME) or VBRI (Fraunhofer) header from the first audio
// frame to get an exact total frame count, then compute duration from that.
// Returns seconds as an integer, or null if no such header is present.
// Works for both VBR files (Xing) and CBR files encoded by LAME (Info tag).
function parseDurationFromFirstFrame(buffer, id3Offset) {
  const start = Math.min(id3Offset, buffer.length);
  for (let i = start; i < buffer.length - 4; i++) {
    if (buffer[i] !== 0xff || (buffer[i + 1] & 0xe0) !== 0xe0) continue;

    const versionBits = (buffer[i + 1] >> 3) & 0x03;
    const layerBits   = (buffer[i + 1] >> 1) & 0x03;
    const bitrateIdx  = (buffer[i + 2] >> 4) & 0x0f;
    const srIdx       = (buffer[i + 2] >> 2) & 0x03;
    const channelMode = (buffer[i + 3] >> 6) & 0x03; // 3 = mono

    if (versionBits === 1 || layerBits === 0 || bitrateIdx === 0 || bitrateIdx === 15 || srIdx === 3) continue;

    const versionTableIdx = versionBits === 3 ? 0 : versionBits === 2 ? 1 : 2;
    const sampleRate = SAMPLE_RATES[versionTableIdx]?.[srIdx];
    if (!sampleRate) continue;

    const isMpeg1 = versionBits === 3;
    const isMono  = channelMode === 3;
    // Side info comes right after the 4-byte frame header; its size depends on
    // MPEG version and channel mode, and the Xing/Info tag follows immediately.
    const sideInfoSize = isMpeg1 ? (isMono ? 17 : 32) : (isMono ? 9 : 17);
    const xingOff = i + 4 + sideInfoSize;

    if (xingOff + 8 <= buffer.length) {
      const tag = buffer.subarray(xingOff, xingOff + 4).toString('ascii');
      if (tag === 'Xing' || tag === 'Info') {
        const flags = buffer.readUInt32BE(xingOff + 4);
        if (flags & 0x01) { // frames field is present
          const totalFrames = buffer.readUInt32BE(xingOff + 8);
          const spf = isMpeg1 ? 1152 : 576;
          return Math.round((totalFrames * spf) / sampleRate);
        }
      }
    }

    // VBRI header (Fraunhofer): always at frame_start + 36
    const vbriOff = i + 36;
    if (vbriOff + 18 <= buffer.length) {
      const vbriTag = buffer.subarray(vbriOff, vbriOff + 4).toString('ascii');
      if (vbriTag === 'VBRI') {
        const totalFrames = buffer.readUInt32BE(vbriOff + 14);
        const spf = isMpeg1 ? 1152 : 576;
        return Math.round((totalFrames * spf) / sampleRate);
      }
    }

    // First valid frame found but has no Xing/Info/VBRI header — genuine CBR.
    return null;
  }
  return null;
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
// Also returns id3Offset and the audio buffer slice so callers can use them
// for Xing-header parsing without a second network request.
async function fetchBitrate(url, signal) {
  const { buffer, totalSize } = await fetchPartialAudio(url, 262144, signal);

  let id3Offset = 0;
  if (buffer.length >= 10 && buffer.subarray(0, 3).toString('utf8') === 'ID3') {
    id3Offset = 10 + syncSafeToInt(buffer.subarray(6, 10));
  }

  let audioSlice = id3Offset > 0 && id3Offset < buffer.length
    ? buffer.subarray(id3Offset)
    : buffer;
  let bitrate = parseBitrateFromFrame(audioSlice);

  if (!bitrate && id3Offset > buffer.length) {
    try {
      const { buffer: frameChunk } = await fetchPartialAudio(url, 8192, signal, id3Offset);
      audioSlice = frameChunk;
      bitrate = parseBitrateFromFrame(frameChunk);
    } catch (_) {
      // best-effort; fall through with bitrate=0
    }
  }

  return { bitrate, totalSize, id3Offset, audioSlice };
}

async function fetchTrackDurationSeconds(url, signal) {
  if (!url) return 0;
  const { bitrate, totalSize, id3Offset, audioSlice } = await fetchBitrate(url, signal);

  // 1. Xing/Info/VBRI header — exact frame count, works for both VBR and CBR
  const xingDuration = parseDurationFromFirstFrame(audioSlice, 0);
  if (xingDuration !== null) return xingDuration;

  // 2. CBR fallback: audio bytes ÷ bitrate (only valid for truly headerless CBR)
  if (!bitrate || !totalSize) return 0;
  const audioBytes = totalSize - id3Offset;
  return audioBytes > 0 ? Math.round((audioBytes * 8) / (bitrate * 1000)) : 0;
}

module.exports = {
  fetchTrackDurationSeconds,
  fetchPartialAudio,
  fetchBitrate,
  parseBitrateFromFrame,
  parseDurationFromFirstFrame,
  syncSafeToInt,
};

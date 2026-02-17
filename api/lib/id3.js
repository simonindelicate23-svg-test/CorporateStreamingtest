const decodeText = (frameBuffer) => {
  if (!frameBuffer || frameBuffer.length < 2) return '';
  const encodingByte = frameBuffer[0];
  const body = frameBuffer.subarray(1);
  if (encodingByte === 0 || encodingByte === 3) {
    return body.toString('utf8').replace(/\u0000/g, '').trim();
  }
  return body.toString('utf16le').replace(/\u0000/g, '').trim();
};

const syncSafeToInt = (buf) =>
  ((buf[0] & 0x7f) << 21) | ((buf[1] & 0x7f) << 14) | ((buf[2] & 0x7f) << 7) | (buf[3] & 0x7f);

const parseId3v2 = (buffer) => {
  if (!buffer || buffer.length < 10) return {};
  if (buffer.subarray(0, 3).toString('utf8') !== 'ID3') return {};

  const tagSize = syncSafeToInt(buffer.subarray(6, 10));
  const endOffset = Math.min(buffer.length, 10 + tagSize);
  let offset = 10;
  const tags = {};

  while (offset + 10 <= endOffset) {
    const frameId = buffer.subarray(offset, offset + 4).toString('utf8');
    const frameSize = buffer.readUInt32BE(offset + 4);
    if (!/^[A-Z0-9]{4}$/.test(frameId) || frameSize <= 0) break;

    const frameDataStart = offset + 10;
    const frameDataEnd = frameDataStart + frameSize;
    if (frameDataEnd > endOffset) break;

    const frameData = buffer.subarray(frameDataStart, frameDataEnd);
    if (frameId === 'TIT2') tags.title = decodeText(frameData);
    if (frameId === 'TPE1') tags.artist = decodeText(frameData);
    if (frameId === 'TALB') tags.album = decodeText(frameData);
    if (frameId === 'TRCK') tags.trackNumber = decodeText(frameData);
    if (frameId === 'TDRC' || frameId === 'TYER') tags.year = decodeText(frameData);
    if (frameId === 'TCON') tags.genre = decodeText(frameData);

    offset = frameDataEnd;
  }

  return tags;
};

module.exports = {
  parseId3v2,
};

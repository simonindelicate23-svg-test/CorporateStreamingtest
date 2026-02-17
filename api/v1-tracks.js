const { getCollections } = require('./lib/db');
const { json } = require('./lib/http');

exports.handler = async (event) => {
  const { tracks } = await getCollections();
  const releaseId = event.queryStringParameters?.releaseId;
  const trackId = event.queryStringParameters?.trackId;

  if (trackId) {
    const track = await tracks.findOne({ trackId }, { projection: { _id: 0 } });
    if (!track) return json(404, { message: 'Track not found' });
    return json(200, { track });
  }

  const filter = { published: { $ne: false } };
  if (releaseId) filter.releaseId = releaseId;

  const rows = await tracks.find(filter, { projection: { _id: 0, audioAssetId: 0 } }).sort({ trackNumber: 1 }).toArray();
  return json(200, { tracks: rows });
};

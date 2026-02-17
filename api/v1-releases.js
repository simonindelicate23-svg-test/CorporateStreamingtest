const { getCollections } = require('./lib/db');
const { json } = require('./lib/http');

exports.handler = async (event) => {
  const { releases } = await getCollections();
  const releaseId = event.queryStringParameters?.releaseId;

  if (releaseId) {
    const release = await releases.findOne({ releaseId }, { projection: { _id: 0 } });
    if (!release) return json(404, { message: 'Release not found' });
    return json(200, { release });
  }

  const rows = await releases.find({ published: { $ne: false } }, { projection: { _id: 0 } }).toArray();
  return json(200, { releases: rows });
};

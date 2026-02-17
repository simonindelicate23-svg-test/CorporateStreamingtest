const { getCollections } = require('./lib/db');
const { json } = require('./lib/http');

exports.handler = async () => {
  const { artists } = await getCollections();
  const rows = await artists.find({}, { projection: { _id: 0 } }).toArray();
  return json(200, { artists: rows });
};

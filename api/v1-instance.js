const config = require('./dbConfig');
const { json } = require('./lib/http');

exports.handler = async () => {
  return json(200, {
    instanceId: process.env.INSTANCE_ID || 'local-instance',
    baseUrl: config.appBaseUrl,
    apiVersion: 'v1',
    discoveryOptIn: config.discoveryOptIn,
  });
};

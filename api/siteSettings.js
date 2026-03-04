const { loadSiteSettings, saveSiteSettings } = require('./lib/siteSettingsStore');
const { isAdmin } = require('./lib/auth');

const jsonResponse = (statusCode, payload) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=0, must-revalidate' },
  body: JSON.stringify(payload),
});

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'GET') {
      const settings = await loadSiteSettings();
      return jsonResponse(200, settings);
    }

    if (event.httpMethod === 'POST') {
      if (!isAdmin(event)) return jsonResponse(401, { message: 'Unauthorized' });

      const body = JSON.parse(event.body || '{}');
      const result = await saveSiteSettings(body || {});
      return jsonResponse(200, { message: 'Settings saved', ...result });
    }

    return jsonResponse(405, { message: 'Method not allowed' });
  } catch (error) {
    console.error('siteSettings error', error);
    return jsonResponse(500, { message: 'Failed to handle site settings', detail: error.message });
  }
};

const { loadSiteSettings, saveSiteSettings } = require('./lib/siteSettingsStore');
const { isAdmin } = require('./lib/auth');

const jsonResponse = (statusCode, payload, extra = {}) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', ...extra },
  body: JSON.stringify(payload),
});

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'GET') {
      const { _loginCheck: _omit, ...settings } = await loadSiteSettings();
      // Allow browsers to cache for 60 seconds; stale-while-revalidate for 5 min.
      // The client also keeps a localStorage cache so returning users see instant branding.
      return jsonResponse(200, settings, {
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
      });
    }

    if (event.httpMethod === 'POST') {
      if (!isAdmin(event)) return jsonResponse(401, { message: 'Unauthorized' });

      const { _loginCheck, ...body } = JSON.parse(event.body || '{}');
      // Pure login check — no other keys means the caller only wanted auth verification.
      if (_loginCheck && Object.keys(body).length === 0) return jsonResponse(200, { message: 'OK' });

      const result = await saveSiteSettings(body);
      return jsonResponse(200, { message: 'Settings saved', ...result });
    }

    return jsonResponse(405, { message: 'Method not allowed' });
  } catch (error) {
    console.error('siteSettings error', error);
    return jsonResponse(500, { message: 'Failed to handle site settings', detail: error.message });
  }
};

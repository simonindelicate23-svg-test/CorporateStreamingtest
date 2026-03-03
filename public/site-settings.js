(function () {
  const FONT_PAIRS = {
    'inter-plus-jakarta-sans': {
      label: 'Clean modern — Inter + Plus Jakarta Sans',
      body: "'Inter', system-ui, sans-serif",
      heading: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif"
    },
    'manrope-space-grotesk': {
      label: 'Geometric studio — Manrope + Space Grotesk',
      body: "'Manrope', system-ui, sans-serif",
      heading: "'Space Grotesk', 'Manrope', system-ui, sans-serif"
    },
    'dm-sans-outfit': {
      label: 'Contemporary UI — DM Sans + Outfit',
      body: "'DM Sans', system-ui, sans-serif",
      heading: "'Outfit', 'DM Sans', system-ui, sans-serif"
    },
    'work-sans-poppins': {
      label: 'Balanced product — Work Sans + Poppins',
      body: "'Work Sans', system-ui, sans-serif",
      heading: "'Poppins', 'Work Sans', system-ui, sans-serif"
    },
    'source-sans-3-rubik': {
      label: 'Friendly utility — Source Sans 3 + Rubik',
      body: "'Source Sans 3', system-ui, sans-serif",
      heading: "'Rubik', 'Source Sans 3', system-ui, sans-serif"
    },
    'nunito-montserrat': {
      label: 'Warm punchy — Nunito + Montserrat',
      body: "'Nunito', system-ui, sans-serif",
      heading: "'Montserrat', 'Nunito', system-ui, sans-serif"
    },
    'lato-raleway': {
      label: 'Classic web — Lato + Raleway',
      body: "'Lato', system-ui, sans-serif",
      heading: "'Raleway', 'Lato', system-ui, sans-serif"
    },
    'open-sans-oswald': {
      label: 'Editorial sans — Open Sans + Oswald',
      body: "'Open Sans', system-ui, sans-serif",
      heading: "'Oswald', 'Open Sans', system-ui, sans-serif"
    },
    'karla-cabin': {
      label: 'Indie neutral — Karla + Cabin',
      body: "'Karla', system-ui, sans-serif",
      heading: "'Cabin', 'Karla', system-ui, sans-serif"
    },
    'inter-merriweather': {
      label: 'Readable contrast — Inter + Merriweather',
      body: "'Inter', system-ui, sans-serif",
      heading: "'Merriweather', 'Inter', serif"
    }
  };

  const DEFAULT_FONT_PAIR = 'inter-plus-jakarta-sans';

  async function loadSiteSettings() {
    try {
      const response = await fetch('/.netlify/functions/siteSettings', { cache: 'no-cache' });
      if (!response.ok) throw new Error('Failed to load');
      return await response.json();
    } catch (_error) {
      return {};
    }
  }

  function text(value, fallback = '') {
    return typeof value === 'string' && value.trim() ? value : fallback;
  }

  function applyFontPair(fontPair) {
    const selectedPair = FONT_PAIRS[fontPair] || FONT_PAIRS[DEFAULT_FONT_PAIR];
    document.documentElement.style.setProperty('--font-body', selectedPair.body);
    document.documentElement.style.setProperty('--font-heading', selectedPair.heading);
  }

  window.SiteSettings = { loadSiteSettings, text, applyFontPair, FONT_PAIRS, DEFAULT_FONT_PAIR };
})();

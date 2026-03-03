(function () {
  const FONT_PAIRS = {
    'manrope-space-grotesk': {
      body: "'Manrope', system-ui, sans-serif",
      heading: "'Space Grotesk', 'Manrope', system-ui, sans-serif"
    },
    'inter-playfair-display': {
      body: "'Inter', system-ui, sans-serif",
      heading: "'Playfair Display', 'Inter', serif"
    },
    'dm-sans-dm-serif-display': {
      body: "'DM Sans', system-ui, sans-serif",
      heading: "'DM Serif Display', 'DM Sans', serif"
    },
    'nunito-merriweather': {
      body: "'Nunito', system-ui, sans-serif",
      heading: "'Merriweather', 'Nunito', serif"
    },
    'work-sans-ibm-plex-serif': {
      body: "'Work Sans', system-ui, sans-serif",
      heading: "'IBM Plex Serif', 'Work Sans', serif"
    },
    'plus-jakarta-sans-bitter': {
      body: "'Plus Jakarta Sans', system-ui, sans-serif",
      heading: "'Bitter', 'Plus Jakarta Sans', serif"
    },
    'rubik-cormorant-garamond': {
      body: "'Rubik', system-ui, sans-serif",
      heading: "'Cormorant Garamond', 'Rubik', serif"
    }
  };

  const DEFAULT_FONT_PAIR = 'manrope-space-grotesk';

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

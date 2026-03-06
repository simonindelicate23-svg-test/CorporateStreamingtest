import { state, Queue } from './state.js';
import { playerConfig } from './config.js';

function slugifyAlbumName(name = '') {
  return name
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function isExcluded(item) {
  return item?.excluded === true || item?.exclude === true || item?.excludeFromPlayer === true;
}

function buildAlbums(tracks) {
  const grouped = tracks.reduce((acc, track) => {
    if (!acc[track.albumName]) {
      acc[track.albumName] = {
        albumName: track.albumName,
        albumArtworkUrl: track.albumArtworkUrl,
        artworkUrl: track.artworkUrl,
        albumId: track.albumId || slugifyAlbumName(track.albumName),
        artistName: track.artistName,
        year: track.year,
        albumSortOrder: track.albumSortOrder,
      };
    }
    return acc;
  }, {});
  return Object.values(grouped).sort((a, b) => (a.albumName || '').localeCompare(b.albumName || ''));
}

// Build pseudo album objects from a settings config entry
function pseudoAlbumFromConfig(entry) {
  const derivedId = entry.albumId || entry.id || slugifyAlbumName(entry.albumName);
  return {
    albumName: entry.albumName,
    albumId: derivedId,
    albumArtworkUrl: entry.albumArtworkUrl || entry.artworkUrl || '',
    artworkUrl: entry.albumArtworkUrl || entry.artworkUrl || '',
    pseudoType: entry.pseudoType,
    allTracks: entry.pseudoType === 'all-tracks',
    enableShuffle: entry.enableShuffle !== false,
    limit: entry.limit ? Number(entry.limit) : undefined,
    trackIds: entry.trackIds || undefined,
    pseudoSortOrder: typeof entry.sortOrder === 'number' ? entry.sortOrder : 999,
    placement: entry.placement || 'before',
  };
}

export async function loadLibrary() {
  const [tracksRes, albumsRes, settingsRes] = await Promise.all([
    fetch('/.netlify/functions/catalog?resource=tracks'),
    fetch('/.netlify/functions/catalog?resource=albums').catch(() => null),
    fetch('/.netlify/functions/siteSettings').catch(() => null),
  ]);

  const fetchedTracks = await tracksRes.json();
  const curatedAlbums = albumsRes ? await albumsRes.json() : [];
  const siteSettings = settingsRes ? await settingsRes.json().catch(() => ({})) : {};

  const excludedAlbumNames = new Set(curatedAlbums.filter(isExcluded).map(album => album.albumName));

  state.tracks = fetchedTracks
    .filter(track => track?.published !== false && !isExcluded(track))
    .filter(track => !excludedAlbumNames.has(track.albumName))
    .map(track => ({ ...track, albumId: track.albumId || slugifyAlbumName(track.albumName) }))
    .sort((a, b) => {
      if (a.albumName === b.albumName) {
        const aNum = Number(a.trackNumber) || 0;
        const bNum = Number(b.trackNumber) || 0;
        return aNum - bNum || (a.trackName || '').localeCompare(b.trackName || '');
      }
      return (a.albumName || '').localeCompare(b.albumName || '');
    });

  const albumList = curatedAlbums?.length ? curatedAlbums : buildAlbums(state.tracks);
  state.albums = albumList.filter(album => !isExcluded(album));
  state.albums = state.albums.map(album => ({
    ...album,
    albumId: album.albumId || slugifyAlbumName(album.albumName)
  }));

  // ── Load pseudo albums from site settings (admin-controlled) ──
  const settingsPseudoAlbums = Array.isArray(siteSettings.pseudoAlbums) ? siteSettings.pseudoAlbums : null;

  if (settingsPseudoAlbums) {
    // Admin has configured pseudo albums — use that config
    const enabled = settingsPseudoAlbums
      .filter(entry => entry.enabled !== false)
      .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));

    enabled.forEach(entry => {
      const pseudo = pseudoAlbumFromConfig(entry);
      const exists = state.albums.some(a => a.albumId === pseudo.albumId);
      if (!exists) state.albums.push(pseudo);
    });
  } else {
    // Fall back to playerConfig (legacy behaviour)
    if (playerConfig?.allTracksAlbum) {
      const unifiedAlbumId = playerConfig.allTracksAlbum.albumId || slugifyAlbumName(playerConfig.allTracksAlbum.albumName);
      const alreadyExists = state.albums.some(album => album.albumId === unifiedAlbumId);
      if (!alreadyExists) {
        state.albums.unshift({
          albumName: playerConfig.allTracksAlbum.albumName || 'All Songs',
          albumId: unifiedAlbumId,
          albumArtworkUrl: playerConfig.allTracksAlbum.albumArtworkUrl || playerConfig.allTracksAlbum.artworkUrl,
          artworkUrl: playerConfig.allTracksAlbum.albumArtworkUrl || playerConfig.allTracksAlbum.artworkUrl,
          allTracks: true,
          pseudoType: 'all-tracks',
          enableShuffle: playerConfig.allTracksAlbum.enableShuffle !== false,
          pseudoSortOrder: 0,
        });
      }
    }

    const pseudoAlbumConfigs = [
      { key: 'whatsNewAlbum', pseudoType: 'whats-new', pseudoSortOrder: 1 },
      { key: 'favoritesAlbum', pseudoType: 'favorites', pseudoSortOrder: 2 }
    ];

    pseudoAlbumConfigs.forEach(entry => {
      const configEntry = playerConfig?.[entry.key];
      if (!configEntry) return;
      const derivedId = configEntry.albumId || slugifyAlbumName(configEntry.albumName);
      const exists = state.albums.some(album => (album.albumId || slugifyAlbumName(album.albumName)) === derivedId);
      if (exists) return;
      state.albums.push({
        albumName: configEntry.albumName,
        albumId: derivedId,
        albumArtworkUrl: configEntry.albumArtworkUrl || configEntry.artworkUrl,
        artworkUrl: configEntry.albumArtworkUrl || configEntry.artworkUrl,
        pseudoType: entry.pseudoType,
        limit: configEntry.limit ? Number(configEntry.limit) : undefined,
        enableShuffle: configEntry.enableShuffle !== false,
        pseudoSortOrder: entry.pseudoSortOrder,
      });
    });
  }

  state.queue = new Queue(state.tracks);
  return { tracks: state.tracks, albums: state.albums };
}

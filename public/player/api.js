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
        albumId: track.albumId || slugifyAlbumName(track.albumName)
      };
    }
    return acc;
  }, {});
  return Object.values(grouped).sort((a, b) => (a.albumName || '').localeCompare(b.albumName || ''));
}

export async function loadLibrary() {
  const [tracksRes, albumsRes] = await Promise.all([
    fetch('/.netlify/functions/catalog?resource=tracks'),
    fetch('/.netlify/functions/catalog?resource=albums').catch(() => null)
  ]);

  const fetchedTracks = await tracksRes.json();
  const curatedAlbums = albumsRes ? await albumsRes.json() : [];
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
        enableShuffle: playerConfig.allTracksAlbum.enableShuffle !== false
      });
    }
  }

  const pseudoAlbumConfigs = [
    { key: 'whatsNewAlbum', pseudoType: 'whats-new' },
    { key: 'favoritesAlbum', pseudoType: 'favorites' }
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
      enableShuffle: configEntry.enableShuffle !== false
    });
  });

  state.queue = new Queue(state.tracks);
  return { tracks: state.tracks, albums: state.albums };
}

const { getCollections } = require('../api/lib/db');
const { newArtistId, newReleaseId, newTrackId } = require('../api/lib/ids');

const slugify = (value) => String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'untitled';

const run = async () => {
  const { legacyTracks, artists, releases, tracks } = await getCollections();
  const docs = await legacyTracks.find().toArray();

  const artistMap = new Map();
  const releaseMap = new Map();

  for (const doc of docs) {
    const artistName = doc.artistName || 'Unknown Artist';
    const artistKey = slugify(artistName);

    if (!artistMap.has(artistKey)) {
      const existingArtist = await artists.findOne({ slug: artistKey });
      if (existingArtist) {
        artistMap.set(artistKey, existingArtist.artistId);
      } else {
        const artistId = newArtistId();
        await artists.insertOne({ artistId, name: artistName, slug: artistKey, createdAt: new Date(), updatedAt: new Date() });
        artistMap.set(artistKey, artistId);
      }
    }

    const artistId = artistMap.get(artistKey);
    const releaseTitle = doc.albumName || 'Singles';
    const releaseKey = `${artistId}:${slugify(releaseTitle)}`;

    if (!releaseMap.has(releaseKey)) {
      const releaseSlug = slugify(releaseTitle);
      const existingRelease = await releases.findOne({ artistId, slug: releaseSlug });
      if (existingRelease) {
        releaseMap.set(releaseKey, existingRelease.releaseId);
      } else {
        const releaseId = newReleaseId();
        await releases.insertOne({
          releaseId,
          artistId,
          type: 'album',
          title: releaseTitle,
          slug: releaseSlug,
          year: doc.year || null,
          genre: doc.genre || '',
          published: doc.published !== false,
          trackIds: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        releaseMap.set(releaseKey, releaseId);
      }
    }

    const releaseId = releaseMap.get(releaseKey);
    const legacyId = String(doc._id);
    const already = await tracks.findOne({ legacyObjectId: legacyId });
    if (already) continue;

    const trackId = newTrackId();
    await tracks.insertOne({
      trackId,
      releaseId,
      artistId,
      title: doc.trackName || 'Untitled Track',
      slug: slugify(doc.trackName || 'untitled-track'),
      trackNumber: Number(doc.trackNumber) || 0,
      durationSeconds: Number(doc.durationSeconds || doc.duration) || 0,
      published: doc.published !== false,
      access: { mode: 'public', productIds: [] },
      legacyObjectId: legacyId,
      legacyMp3Url: doc.mp3Url || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await releases.updateOne({ releaseId }, { $addToSet: { trackIds: trackId } });
  }

  console.log(`Migration complete. Processed ${docs.length} legacy tracks.`);
};

run().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});

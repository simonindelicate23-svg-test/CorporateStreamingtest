const fs = require('fs');
const path = require('path');
const { Readable, Writable } = require('stream');
const config = require('../dbConfig');

const normalizePath = (value) => String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
const getS3Endpoint = () =>
  process.env.S3_ENDPOINT ||
  (process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : null);

const hasR2Config = () => Boolean(
  getS3Endpoint() &&
  process.env.R2_ACCESS_KEY_ID &&
  process.env.R2_SECRET_ACCESS_KEY &&
  process.env.R2_BUCKET_NAME &&
  process.env.R2_PUBLIC_BASE_URL
);
const hasFtpConfig = () => Boolean(process.env.FTP_HOST && process.env.FTP_USER && process.env.FTP_PASSWORD);
const getRemotePath = () => {
  const base = normalizePath(process.env.FTP_BASE_PATH || 'uploads');
  const configured = normalizePath(process.env.SITE_SETTINGS_REMOTE_PATH || 'metadata/site-settings.json');
  return [base, configured].filter(Boolean).join('/');
};
const getFilePath = () => process.env.SITE_SETTINGS_PATH || path.join(config.storageRoot, 'metadata', 'site-settings.json');

const defaults = {
  siteTitle: 'My Streaming Site',
  brandName: 'Independent Artist',
  metaDescription: 'Stream music directly from this independent catalogue.',
  shareDescription: 'Listen online via this self-hosted music player.',
  ogImage: '/img/og_image.jpg',
  aboutLinkLabel: 'About this site',
  palette: 'default',
  fontPair: 'inter-plus-jakarta-sans',
  welcomeMessage: 'Welcome to the music archive.',
  welcomeTitle: 'Albums',
  welcomeSubtitle: 'Explore releases, intros, and shuffle collections.',
  supportPageTitle: 'Support this project',
  supportIntro: 'If you enjoy this archive and want to help sustain it, these options support future work.',
  supportPrimaryHeading: 'Visit the store',
  supportPrimaryBody: 'Pick up music, merch, or downloads through the main store.',
  supportPrimaryUrl: 'https://example.com',
  supportPrimaryCta: 'Visit store',
  supportSecondaryHeading: 'Leave a tip',
  supportSecondaryBody: 'Tips help fund hosting and future releases.',
  supportEmbedUrl: '',
  supportEmbedTitle: 'Support embed',
  supportCards: [
    {
      heading: 'Visit the store',
      body: 'Pick up music, merch, or downloads through the main store.',
      url: 'https://example.com',
      cta: 'Visit store',
      imageUrl: '',
      embedCode: '',
      embedTitle: '',
    },
  ],
  aboutPageTitle: 'About this site',
  aboutPageEyebrow: 'Independent music player',
  aboutPageContent: '<section><h2>What is this website?</h2><p>This player is designed for direct publishing, direct listening, and easy self-hosting.</p></section>',
  footerSummary: '&copy; Independent Artist',
  footerContent: '<p>Customize this footer in Site Settings.</p>',
  logoUrl: '',
  faviconUrl: '/favicon.ico',
  featuredReleaseEnabled: true,
  copyrightNotice: '&copy; Independent Artist',
  themeBackground: '#0f0c14',
  themePanelSurface: '#120f19',
  themeTopbarSurface: '#120e18',
  themeControlSurface: '#1e1824',
  themeCardSurface: '#17121f',
  themeCardContrast: '#221b2a',
  themeText: '#f5f2fb',
  themeMutedText: '#bfb6d3',
  themeAccent: '#9a6bff',
  themeBorder: '#2a2235',
  themeHeroBackground: '#7b5a49',
  dynamicColorTheming: true,
  releaseOrder: 'alphabetical',
  pwaName: '',
  pwaShortName: '',
  pwaDescription: '',
  pwaThemeColor: '',
  pwaBackgroundColor: '',
  pwaIcon192: '',
  pwaIcon512: '',
  pwaScreenshot1: '',
  pwaScreenshot2: '',
  pwaInstallPrompt: true,
  catalogueImportEnabled: false,
  linkedCatalogues: [],
};

async function readFtp() {
  const { Client } = require('basic-ftp');
  const client = new Client();
  try {
    await client.access({
      host: process.env.FTP_HOST,
      user: process.env.FTP_USER,
      password: process.env.FTP_PASSWORD,
      secure: process.env.FTP_SECURE === 'true'
    });

    const chunks = [];
    const sink = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(Buffer.from(chunk));
        cb();
      }
    });

    await client.downloadTo(sink, getRemotePath());
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    return { ...defaults, ...parsed };
  } catch (error) {
    if (error.code === 550 || /not found/i.test(error.message || '')) return { ...defaults };
    throw error;
  } finally {
    client.close();
  }
}

async function writeFtp(value) {
  const { Client } = require('basic-ftp');
  const client = new Client();
  try {
    await client.access({
      host: process.env.FTP_HOST,
      user: process.env.FTP_USER,
      password: process.env.FTP_PASSWORD,
      secure: process.env.FTP_SECURE === 'true'
    });

    const remotePath = getRemotePath();
    await client.ensureDir(path.posix.dirname(remotePath));
    const payload = Buffer.from(JSON.stringify(value, null, 2), 'utf8');
    await client.uploadFrom(Readable.from(payload), path.posix.basename(remotePath));
    return { store: 'ftp-json', path: remotePath };
  } finally {
    client.close();
  }
}

async function readR2() {
  const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
  const client = new S3Client({
    region: process.env.S3_REGION || 'auto',
    endpoint: getS3Endpoint(),
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  try {
    const response = await client.send(new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: getRemotePath(),
    }));
    const chunks = [];
    for await (const chunk of response.Body) chunks.push(chunk);
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    return { ...defaults, ...parsed };
  } catch (error) {
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) return { ...defaults };
    throw error;
  }
}

async function writeR2(value) {
  const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
  const client = new S3Client({
    region: process.env.S3_REGION || 'auto',
    endpoint: getS3Endpoint(),
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  const remotePath = getRemotePath();
  await client.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: remotePath,
    Body: Buffer.from(JSON.stringify(value, null, 2), 'utf8'),
    ContentType: 'application/json',
  }));
  return { store: 'r2-json', path: remotePath };
}

async function readFileStore() {
  try {
    const parsed = JSON.parse(await fs.promises.readFile(getFilePath(), 'utf8') || '{}');
    return { ...defaults, ...parsed };
  } catch (error) {
    if (error.code === 'ENOENT') return { ...defaults };
    throw error;
  }
}

async function writeFileStore(value) {
  const filePath = getFilePath();
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, JSON.stringify(value, null, 2));
  return { store: 'file-json', path: filePath };
}

let memoryCache = null;

async function loadSiteSettings({ bypassCache = false } = {}) {
  if (!bypassCache && memoryCache) return memoryCache;
  let settings;
  if (hasR2Config()) settings = await readR2();
  else if (hasFtpConfig()) settings = await readFtp();
  else settings = await readFileStore();
  memoryCache = settings;
  return settings;
}

async function saveSiteSettings(payload) {
  const existing = await loadSiteSettings({ bypassCache: true });
  const settings = { ...existing, ...payload };
  let result;
  if (hasR2Config()) result = await writeR2(settings);
  else if (hasFtpConfig()) result = await writeFtp(settings);
  else result = await writeFileStore(settings);
  memoryCache = settings;
  return { settings, ...result };
}

module.exports = { loadSiteSettings, saveSiteSettings };

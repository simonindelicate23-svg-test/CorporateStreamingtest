#!/usr/bin/env node
/**
 * fresh-install.js
 *
 * Validates that the required environment variables are set before you
 * start the dev server. No database required — the app runs on FTP + JSON.
 *
 * Usage:
 *   node scripts/fresh-install.js
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const envExample = path.join(rootDir, '.env.example');
const envFile = path.join(rootDir, '.env');

const ok   = (msg) => console.log(`  \u2713  ${msg}`);
const warn = (msg) => console.warn(`  !  ${msg}`);
const fail = (msg) => { console.error(`  \u2717  ${msg}`); process.exitCode = 1; };

// Bootstrap .env from example if it doesn't exist yet
if (!fs.existsSync(envFile)) {
  if (!fs.existsSync(envExample)) {
    fail('Missing .env.example — cannot create .env.');
    process.exit(1);
  }
  fs.copyFileSync(envExample, envFile);
  console.log('\nCreated .env from .env.example');
  console.log('Open .env and fill in your FTP credentials and ADMIN_API_TOKEN, then run this again.\n');
  process.exit(0);
}

// Load .env into process.env
const lines = fs.readFileSync(envFile, 'utf8').split(/\r?\n/);
for (const rawLine of lines) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) continue;
  const eq = line.indexOf('=');
  if (eq === -1) continue;
  const key = line.slice(0, eq).trim();
  const value = line.slice(eq + 1).trim();
  if (!process.env[key]) process.env[key] = value;
}

console.log('\nChecking configuration...\n');

// Required for the app to function
const required = [
  ['APP_BASE_URL',        'Your Netlify or local dev URL'],
  ['FTP_HOST',           'FTP server hostname'],
  ['FTP_USER',           'FTP username'],
  ['FTP_PASSWORD',       'FTP password'],
  ['FTP_PUBLIC_BASE_URL','Public URL where uploaded files are served from'],
  ['ADMIN_API_TOKEN',    'Admin secret token (generate any random string)'],
];

let allGood = true;
for (const [key, description] of required) {
  if (process.env[key]) {
    ok(`${key}`);
  } else {
    fail(`${key} is not set — ${description}`);
    allGood = false;
  }
}

console.log('');

if (!allGood) {
  console.error('Fix the missing values in .env and run this again.\n');
  process.exit(1);
}

ok('All required variables are set.');
console.log('\nNext step: npx netlify dev\n');
console.log('Then open http://localhost:8888/install.html for the full setup guide.\n');

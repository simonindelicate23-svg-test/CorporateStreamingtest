#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const envExample = path.join(rootDir, '.env.example');
const envFile = path.join(rootDir, '.env');

const banner = (msg) => console.log(`\n=== ${msg} ===`);
const info = (msg) => console.log(`[INFO] ${msg}`);
const ok = (msg) => console.log(`[OK] ${msg}`);
const fail = (msg) => console.error(`[FAIL] ${msg}`);

const loadDotEnv = () => {
  if (!fs.existsSync(envFile)) return;
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
};

const run = (cmd, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: rootDir, stdio: 'pipe', shell: process.platform === 'win32' });

    child.stdout.on('data', (chunk) => process.stdout.write(`[${cmd}] ${chunk}`));
    child.stderr.on('data', (chunk) => process.stderr.write(`[${cmd}] ${chunk}`));

    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
    });
  });

const checkMongoConnection = async () => {
  const { MongoClient } = require('mongodb');
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME;

  if (!uri || !dbName) {
    throw new Error('MONGODB_URI and MONGODB_DB_NAME must be set in .env before running bootstrap.');
  }

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  await client.db(dbName).command({ ping: 1 });
  await client.close();
};

const main = async () => {
  banner('Self-host bootstrap');
  info(`Node version: ${process.version}`);

  if (!fs.existsSync(envExample)) {
    fail('Missing .env.example file.');
    process.exit(1);
  }

  if (!fs.existsSync(envFile)) {
    fs.copyFileSync(envExample, envFile);
    ok('Created .env from .env.example');
    info('Please edit .env and set MONGODB_URI/MONGODB_DB_NAME/PayPal values, then run this command again.');
    process.exit(0);
  }

  ok('Found .env');
  loadDotEnv();

  banner('Checking MongoDB connection');
  await checkMongoConnection();
  ok('MongoDB connection successful');

  banner('Running setup (indexes)');
  await run('npm', ['run', 'setup']);
  ok('Setup complete');

  banner('Running migration (legacy -> normalized)');
  await run('npm', ['run', 'migrate']);
  ok('Migration complete');

  banner('Bootstrap finished');
  info('Next: run `npx netlify dev` and open http://localhost:8888/player.html');
};

main().catch((error) => {
  fail(error.message);
  process.exit(1);
});

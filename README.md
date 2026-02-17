# MechCh-Streaming-Site---Copy

A music streaming website to stream tracks from albums contained in a MongoDb Database for deployment on Netlify using serverless functions.

## Table of Contents

- [Install](#install)
- [Usage](#usage)
- [Contributing](#contributing)   
- [License](#license)

## Install (fresh install, simplest path)

This project now includes a guided bootstrap command designed for non-technical users. It creates missing config files, validates your MongoDB connection, creates indexes, and runs migration steps with very explicit terminal output.

### 1) Prerequisites
- Node.js 18+
- A MongoDB database connection string

### 2) Download + install dependencies
```bash
git clone <your-fork-or-this-repo-url>
cd Full-generic-music-streaming-app
npm install
```

### 3) Run the guided bootstrap
```bash
npm run fresh-install
```

What this command does:
1. Creates `.env` from `.env.example` if it does not exist.
2. Stops and tells you exactly which values to fill in if required values are missing.
3. Verifies MongoDB connectivity (`ping`).
4. Runs `npm run setup` to create indexes.
5. Runs `npm run migrate` to backfill normalized collections from legacy track documents.
6. Prints clear pass/fail logs for every stage.

### 4) Fill in `.env` when prompted
At minimum, set:
- `MONGODB_URI`
- `MONGODB_DB_NAME`
- `APP_BASE_URL`

Optional (for payments/webhooks):
- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `PAYPAL_WEBHOOK_ID`
- `PAYPAL_API_BASE`

### 5) Start the app locally
```bash
npx netlify dev
```
Then open: `http://localhost:8888/player.html`

### Troubleshooting (copy/paste checks)
```bash
node -v
npm -v
cat .env
npm run setup
npm run migrate
```
If any command fails, the output now includes a specific stage marker (for example: `Checking MongoDB connection`, `Running setup`, `Running migration`) so the failing step is obvious.

## Usage

In order for there to be content in your streaming site, you need a mongo database. Google what that is and set one up then add a json document that looks something like this:

``` {
  "_id": {
    "$oid": "64c3da35be72e17c4c3fddc9"
  },
  "albumName": "Arcadia Park",
  "artistName": "Simon Indelicate",
  "artworkUrl": "https://indelicates.xyz/resources/img/AP/1a.png",
  "mp3Url": "https://www.storygoblins.com/AP-stream/1.mp3",
  "trackName": "Entrance Plaza",
  "trackNumber": "1",
  "albumArtworkUrl": "https://frolicking-chimera-0e5ae9.netlify.app/img/AP/1.png",
  "trackDuration": "3:32"
} 
```

Set MongoDB details in `.env` (`MONGODB_URI`, `MONGODB_DB_NAME`, and optionally `MONGODB_TRACKS_COLLECTION`).

The site should now work locally.

To put it online, sign up for a Netlify account, connect your github and set up a new site to continuously deploy from your new repo.

You can add tracks to your database however you like. This repo includes a few tools to make this easier - to use them open the html files directly.

- insert.html allows you to add new tracks. You can add multiple tracks with the same album info by using the button at the bottom.
- edit.html will show you a list of all tracks in your db. click on any track to see the data associated with it.
- from an indicidual track view page reached in this way, click edit to alter details from your browser.

for these to work you will need to ensure your `.env` MongoDB settings are correct.

**IMPORTANT**

Legacy pages in this repo still support URL-based tracks, but the newer backend now includes an upload endpoint (`/.netlify/functions/upload`) that stores audio in local `storage/` and prefills metadata from tags. If you stay on the legacy pages, external hosting URLs are still supported.

### Quick way to backfill missing track durations

1. Install dependencies once: `npm install`
2. Start the local functions so the endpoint is available: `npx netlify dev`
3. In another terminal, run: `curl -X POST http://localhost:8888/.netlify/functions/fillTrackDurations`

That POST will find any tracks without a `durationSeconds` value, calculate it from each track’s `mp3Url`, and save the results back to your MongoDB using the connection details in `.env`.


### Consolidate and optimise album artwork

A reusable script (`tools/consolidateArtwork.js`) can downsize all artwork referenced in MongoDB, upload the compressed JPEGs to an FTP folder, and repoint the database to the new URLs. It runs as a dry run by default so you can review planned changes before anything is uploaded or written back to MongoDB.

1. Install dependencies: `npm install`
2. Run a dry run to see what would change (replace the public URL with the HTTP URL that serves your FTP folder):

   ```bash
   node tools/consolidateArtwork.js --public-base-url=https://indelicates.xyz/consolidated-artwork
   ```

3. When happy, run with `--apply` and FTP credentials to upload and update MongoDB. You can pass credentials as CLI flags or environment variables:

   ```bash
   FTP_HOST=indelicates.xyz \
   FTP_USER=u489957361.simonindelicate \
   FTP_PASSWORD=flopsyBunney27 \
   PUBLIC_BASE_URL=https://indelicates.xyz/consolidated-artwork \
   node tools/consolidateArtwork.js --apply --ftp-folder=consolidated-artwork
   ```

The script de-duplicates artwork by hashing the original URLs, resizes to a sensible width (max 1200px) while iteratively adjusting JPEG quality to keep files under ~100KB, skips files already present on the FTP server, avoids re-touching database records that already point at the consolidated location, and **leaves GIF artwork untouched**.

### Generate shareable MP4s from your MongoDB tracks

If you want lightweight MP4s that combine each track's artwork with its MP3 (useful for uploads to video-first platforms), you can generate them locally without reprocessing entries that already have videos.

1. Install ffmpeg locally so the CLI is on your `PATH`.
2. Run the generator (it reads from the same MongoDB details in `.env`):

   ```bash
   node tools/generateMp4s.js
   ```

   - Videos are written to `uploads/mp4` by default.
   - The script skips tracks that lack artwork/MP3 URLs and any videos that already exist in the output folder.
   - You can override settings like the output folder, maximum artwork dimension, AAC bitrate, and CRF if you want to tune quality/size: `node tools/generateMp4s.js --output-dir=/path/to/mp4s --max-dimension=1080 --audio-bitrate=160k --crf=24`.

Each MP4 uses a static H.264 video stream built from the artwork, `-tune stillimage`, a modest CRF for smaller file sizes, and AAC audio at the configured bitrate.

**CORS**

You will also likely run into problems with cross origin source requests for some functionality in this repo - you will need to allow requests that come from the url where you host your site to access resources from wherever you host them - especially the artwork. If you don't allow requests from locahost urls, the background color sampling will not work in your dev environment.

Album covers that load as CSS backgrounds can succeed even when the host does not send permissive CORS headers because the browser does not attempt to read pixel data. Features like the ColorThief-based theme extraction, however, draw the image to a canvas, which requires a CORS-allowed response; otherwise the canvas is “tainted” and palette detection fails. To keep artwork visible in the UI **and** usable for color extraction, the player routes image URLs through the Netlify function at `api/proxyImage.js`, which fetches the original image and returns it with an `Access-Control-Allow-Origin: *` header and caching enabled.【F:api/proxyImage.js†L1-L31】【F:public/player.html†L270-L340】


## Contributing

Look, I have no idea what I am doing. I cobbled this thing together with no real understanding and the professional standards of a pig in shoes. It's all hacks and bolt=ons and every bit of it could be improved.

I think the way it gets data in one big dump is probably the worst way to do things - someone should come up with a better way that can scale to a larger db more efficiently.

This is just one example though, anyone with any skills would be able to improve every line, I expect. It could also do with being formatted prettily and commented better throughout. At the bare minimum someone should move the css into its pwn file - I mean how lazy am I, jfc.

I have my version of the site in a private repo so please do anything you want with this.

I'd love it if actual coders took this, genericised and optimised it and made it into something that musicians with no skillz could take and use easily.

## License
*MIT*

## Author  
**Simon Indelicate**

## Contact
[simon@indelicates.com](mailto:simon@indelicates.com)

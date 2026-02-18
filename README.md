# MechCh-Streaming-Site---Copy

A music streaming website to stream tracks from albums contained in a MongoDb Database for deployment on Netlify using serverless functions.

## Table of Contents

- [Install](#install)
- [Usage](#usage)
- [Contributing](#contributing)   
- [License](#license)

## Install (novice-friendly, 4 steps)

1. Open your already-deployed site at `https://your-site.netlify.app/install.html`.
2. Enter your FTP/media hosting details in the form.
3. Copy the generated setup values into **Netlify → Site configuration → Environment variables** (one-time step).
4. Open `/insert.html` and upload a test file.

That is the whole flow: upload media from your Netlify app via FTP and write canonical JSON to track releases.

## Usage

### Default data source

The default source of truth is `public/albumfooter.json` (canonical JSON).

MongoDB support still exists for advanced/custom setups, but it is not required for standard onboarding.

### Data shape example

Whether the data comes from JSON or MongoDB, each track entry should look like this:

```json
{
  "albumName": "Arcadia Park",
  "artistName": "Simon Indelicate",
  "artworkUrl": "https://example.com/artwork.png",
  "mp3Url": "https://example.com/audio.mp3",
  "trackName": "Entrance Plaza",
  "trackNumber": "1",
  "albumArtworkUrl": "https://example.com/album-art.png",
  "trackDuration": "3:32"
}
```

### Uploads for non-technical users (one-click flow)

The desired UX is:

1. User clicks upload in this app.
2. Netlify Function uploads the file to your storage provider (S3-compatible or SFTP host).
3. Function writes the returned public URL into your track data automatically.

That avoids the broken workflow of "go to another website, upload, then come back and paste URLs."

This repository now includes `/.netlify/functions/uploadMedia`, used by `public/insert.html` upload buttons for artwork and track audio.

Set these environment variables in Netlify for one-click uploads:

- `FTP_HOST`
- `FTP_USER`
- `FTP_PASSWORD`
- `FTP_PUBLIC_BASE_URL` (for example `https://media.yourdomain.com`)
- Optional: `FTP_BASE_PATH` (defaults to `uploads`)
- Optional: `FTP_SECURE=true`

### Quick checks

```bash
node -v
npm -v
```

For local development:

```bash
npm install
npx netlify dev
```

Then open `http://localhost:8888/player.html`.

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

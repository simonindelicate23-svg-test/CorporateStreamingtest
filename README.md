# Full Generic Music Streaming App

Your own music streaming website, hosted by you, controlled by you. Listeners get a proper player with album artwork, shuffle, and shareable links. You get a web-based admin panel to upload tracks, manage metadata, and — if you want — charge a monthly subscription to unlock your catalogue.

**No monthly platform fees. No algorithm. No one can take it down but you.**

---

## Before you start — accounts you will need

You need to sign up for a few services before doing anything else. All of the free ones are genuinely free. Read this whole section before you start clicking.

### 1. GitHub (free)
**What it is:** A website that stores code. You're going to make your own copy of this project and store it there.
**Where to sign up:** [github.com](https://github.com) → Sign up

### 2. Netlify (free)
**What it is:** Netlify runs your website for free. It takes the code from your GitHub account, builds it into a live site, and handles all the technical server stuff. You get a free `your-chosen-name.netlify.app` web address, or you can connect your own domain later.
**Where to sign up:** [netlify.com](https://netlify.com) → Sign up with your GitHub account (this is the easiest option — it links the two together automatically).

### 3. Somewhere to store your music files — pick one

Netlify runs the code, but it can't store large files like MP3s. You need a separate place to store them. Pick whichever option suits you:

---

#### Option A: Cloudflare R2 (recommended — free up to 10 GB)

Cloudflare R2 is object storage — think of it as a hard drive on the internet. It has a generous free tier and no egress fees.

1. Go to [cloudflare.com](https://cloudflare.com) and sign up (or log in)
2. In the left sidebar go to **Storage & databases → R2 Object Storage**
3. Click **Create bucket**, name it (e.g. `music-uploads`), and click **Create bucket** again
4. **Enable public access on the bucket:**
   - Open the bucket, click the **Settings** tab
   - Find **Public Development URL** and click **Enable**
   - Cloudflare will give you a URL like `https://pub-abc123....r2.dev` — copy it, you'll need it as `R2_PUBLIC_BASE_URL`
5. **Create an API token:**
   - Go back to the R2 overview page and click **Manage R2 API tokens** (top-right)
   - Click **Create API token**
   - Give it a name, set permissions to **Object Read & Write**, scope it to your bucket
   - Click **Create API token**
   - Copy the **Access Key ID** and **Secret Access Key** — you won't see the secret again
6. Your **Account ID** is in the URL bar of your Cloudflare dashboard: `dash.cloudflare.com/YOUR-ACCOUNT-ID/...`, or in the sidebar under **Account Home → right-hand panel**

7. **Configure CORS on your bucket** — audio files are uploaded directly from the browser to R2, so R2 needs to permit this. In the Cloudflare dashboard open your bucket → **Settings** tab → **CORS Policy** → add:

```json
[
  {
    "AllowedOrigins": ["https://your-app.netlify.app"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```

Replace `https://your-app.netlify.app` with your actual Netlify URL (or custom domain). Save.

You'll set the five R2 variables (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_BASE_URL`) in Netlify in Step 3. When all five are present, the app uses R2 automatically and ignores any FTP settings.

---

#### Option A note: Backblaze B2 CORS

Audio files are uploaded directly from the browser to B2. You need to add a CORS rule to your bucket. Use the B2 CLI:

```bash
b2 update-bucket --cors-rules '[
  {
    "corsRuleName": "allowNetlifyUploads",
    "allowedOrigins": ["https://your-app.netlify.app"],
    "allowedOperations": ["s3_put"],
    "allowedHeaders": ["content-type"],
    "maxAgeSeconds": 3600
  }
]' YOUR-BUCKET-NAME allPublic
```

Install the CLI with `pip install b2` and authenticate with `b2 authorize-account YOUR-KEY-ID YOUR-APP-KEY` first.

---

#### Option B: Web hosting with FTP (paid — roughly £3–8/month)

A basic web hosting package from any provider works — you just need FTP access and a public URL for the files.

**Recommended providers** (any of these work):
- [IONOS](https://www.ionos.co.uk) — Basic Web Hosting, around £3/month
- [Namecheap](https://www.namecheap.com) — Stellar Shared Hosting, around $2–4/month
- [Fasthosts](https://www.fasthosts.co.uk) — Starter Hosting, around £3/month
- Any web host where you get FTP credentials and your files are accessible via a web URL

> **What is FTP?** FTP (File Transfer Protocol) is a way to send files to a web server. When you sign up for web hosting, you get a username, password, and server address for FTP. You will also get a web URL where those files can be accessed publicly — usually something like `https://yourdomain.com/uploads/` or a subdomain like `https://media.yourdomain.com`.

> **Do I need my own domain?** No. Your music will be served from whatever web address your hosting provider gives you. You can add your own domain later, or use the domain your hosting comes with.

### 4. PayPal Business account (free — only needed for subscriptions)
**What it is:** If you want to charge listeners a monthly subscription, you need a PayPal Business account to receive the money. This is different from a regular PayPal personal account.

**You do NOT need this if you just want a free public player.**

**Where to sign up:** [paypal.com](https://www.paypal.com) → Sign Up → Business account
- Identity verification is required and can take **1–3 business days**
- Standard PayPal fees apply when you receive money (~2.9% + a small fixed fee per transaction)

---

## Part 1: Getting the site running (no payments yet)

Work through these steps in order. Don't skip ahead.

---

### Step 1: Copy the code to your GitHub account

1. Go to this project's GitHub page (the page you're probably reading this on)
2. Click the **Fork** button near the top right of the page
3. Choose your own GitHub account as the destination
4. You now have your own copy of the code at `github.com/YOUR-USERNAME/Full-generic-music-streaming-app`

---

### Step 2: Deploy to Netlify

"Deploy" means telling Netlify to take your code and turn it into a live website.

1. Log in to [netlify.com](https://netlify.com)
2. Click **Add new site → Import an existing project**
3. Click **GitHub**
4. Find and select the repository you just forked (`Full-generic-music-streaming-app`)
5. On the settings page:
   - **Branch to deploy:** `main`
   - **Build command:** leave blank
   - **Publish directory:** `public`
   - **Functions directory:** `api`
6. Click **Deploy site**

Netlify will give your site a random name like `jolly-curie-123abc.netlify.app`. You can change this in **Site configuration → General → Site details → Change site name**.

Your site will deploy but won't work yet — it needs the environment variables from the next step.

---

### Step 3: Set your environment variables

"Environment variables" are like settings or passwords that live on Netlify's server rather than in your code. They keep sensitive information (like passwords) out of the code.

In Netlify: go to **Site configuration → Environment variables → Add a variable**

Add each of the following:

---

**`APP_BASE_URL`**
Your site's full URL.
Example: `https://jolly-curie-123abc.netlify.app`
(Use your actual Netlify URL, not this example.)

---

**`ADMIN_API_TOKEN`**
This is your admin password. Make it long and hard to guess — at least 20 random characters.
You'll use this to log in to the admin panel.
Example of the kind of thing to use: `xK9mP2nQr7tL4vWj8cZ6bY3` — but make up your own, don't copy this one.

---

Then add the variables for whichever storage option you chose:

#### If you chose Cloudflare R2

**`R2_ACCOUNT_ID`**
Your Cloudflare account ID. Found in the URL bar of your Cloudflare dashboard (`dash.cloudflare.com/YOUR-ACCOUNT-ID/...`) or in the right-hand panel on the Account Home page.

---

**`R2_ACCESS_KEY_ID`**
The Access Key ID from the R2 API token you created.

---

**`R2_SECRET_ACCESS_KEY`**
The Secret Access Key from the R2 API token you created.

---

**`R2_BUCKET_NAME`**
The name you gave your bucket, e.g. `music-uploads`.

---

**`R2_PUBLIC_BASE_URL`**
The public URL for your bucket. This is the URL Cloudflare showed you when you enabled the **Public Development URL** in bucket Settings — it looks like `https://pub-abc123def456.r2.dev`.
Do not add a trailing slash.

---

#### If you chose FTP

**`FTP_HOST`**
The FTP server address from your web hosting provider.
This will be in the welcome email from your hosting company, or in their control panel.
Example: `ftp.yourdomain.com`

---

**`FTP_USER`**
Your FTP username. Also in your hosting welcome email or control panel.

---

**`FTP_PASSWORD`**
Your FTP password.

---

**`FTP_PUBLIC_BASE_URL`**
The web address where files on your FTP server can be accessed by a browser.
Your hosting provider will tell you this — it might be your domain, a subdomain, or a path.
Example: `https://yourdomain.com` or `https://yourdomain.com/music`

> **Not sure what this is?** Log in to your hosting provider's file manager (most have a web-based one). Upload a test file. Then try to access it in your browser. The base of that URL — without the filename — is your `FTP_PUBLIC_BASE_URL`.

---

After adding your variables, click **Trigger deploy → Deploy site** in Netlify to restart the site with your settings.

---

### Step 4: Log in to the admin panel

Go to: `https://your-site.netlify.app/admin/admin-login.html`

Log in with the `ADMIN_API_TOKEN` you set. You should be asked for a password and then redirected to the admin area.

If you get an "Unauthorized" error, double-check that the token you're typing exactly matches what you set in Netlify.

---

### Step 5: Upload your first track

1. Go to `https://your-site.netlify.app/insert.html`
2. Drag and drop an MP3 file onto the upload area, or click to browse
3. Fill in the track name, album name, and artist name
4. Click **Upload**

Then visit `https://your-site.netlify.app` — you should see your track in the player.

**If you don't see it:** Check that `FTP_PUBLIC_BASE_URL` is correct. The most common problem is this URL having an extra `/` at the end, or pointing to the wrong folder.

---

### Step 6: Personalise your site

Go to `https://your-site.netlify.app/admin-settings.html`

Here you can set:
- Your site name and artist name
- Logo and favicon
- Colours and fonts
- Welcome message
- About page content
- Footer text

Changes are saved immediately — no redeploy needed.

---

## Part 2: Setting up subscriptions

Subscriptions let listeners pay a monthly fee to unlock all the tracks you've marked as "paid". They subscribe through a PayPal button that appears right in your music player when they try to play a gated track.

**Before starting this section, you need:**
- The basic site working (Part 1 complete)
- A PayPal Business account with identity verification approved

---

### Step 1: Set up your PayPal Developer credentials

Your PayPal Business account also gives you access to the PayPal developer tools — this is where you get the keys that allow your site to talk to PayPal.

1. Go to [developer.paypal.com](https://developer.paypal.com) — log in with your PayPal Business account credentials
2. Click **Apps & Credentials** in the top menu
3. You'll see two tabs: **Sandbox** (for testing) and **Live** (for real money). Start with **Sandbox** to test.
4. Under Sandbox, click **Create App**
5. Give it a name (anything, e.g. "My Music Site") and choose **Merchant** as the type
6. Click **Create App**
7. You'll see a **Client ID** and a **Secret**. Copy both of these — you'll need them shortly.

> **Sandbox vs Live:** Sandbox is a test environment where no real money changes hands. Use it to make sure everything works before switching to real payments. When you're ready to go live, you'll repeat this step on the **Live** tab.

---

### Step 2: Create a subscription plan in PayPal

A "plan" is what defines how much subscribers pay and how often. You create this once in PayPal.

1. While logged into [developer.paypal.com](https://developer.paypal.com), click **Products & Plans** in the top menu
2. First, create a **Product** (this represents your music catalogue):
   - Click **Create product**
   - Name: something like "Music Subscription"
   - Type: **Service**
   - Click **Save**
3. Then create a **Plan** for that product:
   - Click **Create plan** on your new product
   - Set the billing cycle (e.g. Monthly)
   - Set the price
   - Click **Create plan**
4. Copy the **Plan ID** — it starts with `P-` and looks like `P-12A34567BC890123DEFGH456`

---

### Step 3: Generate a Payment Secret

This is a random password that your site uses to create and verify access tokens. You generate it yourself — nothing to register anywhere.

The easiest way: open [this random string generator](https://1password.com/password-generator/) and generate a 64-character random string. Or, if you have Node.js installed:

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the result — you'll need it in the next step.

---

### Step 4: Add the payment environment variables to Netlify

In Netlify → **Site configuration → Environment variables**, add:

---

**`PAYMENT_SECRET`**
The random string you just generated.

---

**`PAYPAL_CLIENT_ID`**
The Client ID from your PayPal app (Step 1).

---

**`PAYPAL_CLIENT_SECRET`**
The Secret from your PayPal app (Step 1).

---

**`PAYPAL_API_BASE`**
- For testing (Sandbox): `https://api-m.sandbox.paypal.com`
- For real payments (Live): `https://api-m.paypal.com`

Start with the Sandbox URL.

---

Trigger a redeploy after adding these.

---

### Step 5: Configure subscriptions in your site settings

1. Go to `https://your-site.netlify.app/admin-settings.html`
2. Scroll to the **Subscriptions & payment gating** section
3. Fill in:
   - **Subscriptions enabled:** set to **On**
   - **PayPal Subscription Plan ID:** paste the `P-...` Plan ID from Step 2
   - **Price display:** what you want listeners to see, e.g. `£5/month`
   - **Subscribe button label:** e.g. `Subscribe to unlock everything`
4. Click **Save settings**

---

### Step 6: Mark tracks as paid (gated)

1. Go to `https://your-site.netlify.app/edit.html`
2. You'll see a list of all your tracks
3. Click the **Paid** column on any track to toggle the lock on or off
4. You can also use the bulk buttons at the top to gate or ungate everything at once

When a listener tries to play a gated track, a subscription modal will appear in the player with a PayPal Subscribe button. After subscribing, they're taken back to your site and access is activated immediately — no redirect, no email.

---

### Step 7: Test it

1. In the player, try clicking a paid track — you should see the subscription modal
2. The PayPal button should appear with your price and label
3. In Sandbox mode, use one of PayPal's [test account credentials](https://developer.paypal.com/dashboard/accounts) to complete a test subscription
4. After approving, the modal should close and the track should play

---

### Step 8: Go live with real payments

When you're satisfied the test flow works:

1. Go back to [developer.paypal.com](https://developer.paypal.com) → **Apps & Credentials** → switch to the **Live** tab
2. Create a new app (same process as Step 1) — you'll get new Live credentials
3. Create a new product and plan on the Live tab (same as Step 2)
4. In Netlify, update:
   - `PAYPAL_CLIENT_ID` → your new Live Client ID
   - `PAYPAL_CLIENT_SECRET` → your new Live Secret
   - `PAYPAL_API_BASE` → `https://api-m.paypal.com`
5. In admin-settings.html, update the Plan ID to your new Live plan ID
6. Redeploy

---

### What subscribers experience

- They click a locked track → subscription modal appears in the player
- They click Subscribe → PayPal button handles the payment flow
- They approve on PayPal → access is activated immediately, track starts playing
- Their access is remembered in their browser for up to an hour, then silently refreshed in the background
- If they clear their browser data, they can recover access by pasting their PayPal Subscription ID into the "Already subscribed? Restore access" section of the modal. Their Subscription ID is in their PayPal account under Payments → Subscriptions.

---

## Managing your music

### Uploading tracks
`/insert.html` — drag and drop MP3s, or paste a URL. Supports batch upload of whole folders.

### Editing track information
`/edit.html` — change track names, album names, track numbers, published/paid status. Click any field to edit it inline.

### Album artwork
`/admin-artwork.html` — upload and assign artwork to albums.

### Site branding and settings
`/admin-settings.html` — name, logo, colours, fonts, welcome message, support page content.

---

## Admin pages reference

Log in at `/admin/admin-login.html` using your `ADMIN_API_TOKEN`.

| Page | What it's for |
|---|---|
| `/insert.html` | Upload new tracks |
| `/edit.html` | Edit track metadata, toggle paid/published |
| `/edit-albums.html` | Edit album details, sort order, publish/unpublish albums |
| `/admin-settings.html` | All site settings including subscriptions |
| `/admin-artwork.html` | Upload album artwork |
| `/admin/admin-pseudo-albums.html` | Create virtual albums (e.g. "All tracks shuffle") |
| `/install.html` | Setup wizard with copy-paste helpers for environment variables |

---

## Common problems

**"The player loads but I don't see any tracks"**
If you're using **R2:** Check that `R2_PUBLIC_BASE_URL` is the URL from bucket **Settings → Public Development URL** (looks like `https://pub-abc123.r2.dev`). Make sure it has no trailing slash. Also confirm all five `R2_*` variables are set — if any is missing the app falls back to FTP.

If you're using **FTP:** Check your `FTP_PUBLIC_BASE_URL`. Go to your hosting provider's file manager and try to open an uploaded MP3 in your browser directly. The URL it has — minus the filename — should match `FTP_PUBLIC_BASE_URL` exactly.

**"Unauthorized" when logging in to admin**
The token you're typing must exactly match `ADMIN_API_TOKEN` in Netlify, including case. There are no spaces, no line breaks.

**"PayPal button doesn't appear in the subscription modal"**
Check that `PAYPAL_CLIENT_ID` is set correctly in Netlify and that the **Subscriptions enabled** toggle is set to **On** in admin-settings.html. Also confirm the Plan ID starts with `P-`.

**"I subscribed but the track won't play"**
Check `PAYMENT_SECRET` is set in Netlify. If it's missing, tokens can't be created or verified. Redeploy after adding it.

**"A subscriber says they've lost access"**
They need to paste their PayPal Subscription ID into the "Already subscribed? Restore access" section of the modal. Their ID is in PayPal under Payments → Subscriptions → the subscription name → the ID field.

---

## Environment variables — complete list

### Always required

| Variable | Description |
|---|---|
| `APP_BASE_URL` | Your Netlify site URL, e.g. `https://your-site.netlify.app` |
| `ADMIN_API_TOKEN` | Your admin password — protects all write operations |

### Cloudflare R2 storage (use this or FTP, not both)

When all five R2 variables are set, R2 is used and FTP variables are ignored.

| Variable | Description |
|---|---|
| `R2_ACCOUNT_ID` | Your Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | R2 API token — Access Key ID |
| `R2_SECRET_ACCESS_KEY` | R2 API token — Secret Access Key |
| `R2_BUCKET_NAME` | Your bucket name, e.g. `music-uploads` |
| `R2_PUBLIC_BASE_URL` | Public URL from bucket Settings → Public Development URL, e.g. `https://pub-abc123.r2.dev` |

### FTP storage (use this or R2, not both)

| Variable | Description |
|---|---|
| `FTP_HOST` | FTP server hostname from your hosting provider |
| `FTP_USER` | FTP username |
| `FTP_PASSWORD` | FTP password |
| `FTP_PUBLIC_BASE_URL` | The public web URL for files on your FTP server |

### FTP (optional, have sensible defaults)

| Variable | Default | Description |
|---|---|---|
| `FTP_BASE_PATH` | `uploads` | Folder on FTP where files are stored |
| `FTP_SECURE` | `false` | Set `true` for SFTP/FTPS |
| `TRACKS_JSON_REMOTE_PATH` | `metadata/tracks.json` | Path to track data file |
| `SITE_SETTINGS_REMOTE_PATH` | `metadata/site-settings.json` | Path to settings file |

### Payments (only needed for subscriptions)

| Variable | Description |
|---|---|
| `PAYMENT_SECRET` | Random string for signing access tokens — generate once, never change |
| `PAYPAL_CLIENT_ID` | From your PayPal Developer app |
| `PAYPAL_CLIENT_SECRET` | From your PayPal Developer app |
| `PAYPAL_API_BASE` | `https://api-m.sandbox.paypal.com` (testing) or `https://api-m.paypal.com` (live) |

---

## Local development (for developers)

```bash
npm install
npx netlify dev
```

- Player: `http://localhost:8888`
- Admin: `http://localhost:8888/insert.html`
- Installer: `http://localhost:8888/install.html`

Create a `.env` file at the project root with your environment variables (the setup wizard at `/install.html` generates a template).

---

## License

MIT

## Author

Simon Indelicate

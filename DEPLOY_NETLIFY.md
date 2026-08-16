# Deploying to Netlify

You have two packages:

- **`storyboard-mural-dist.zip`** — the already-built static site. Use this for the fastest path (Option A).
- **`storyboard-mural-source.zip`** — the full source project. Use this if you want Netlify to rebuild automatically whenever you change the code (Option B).

---

## Option A — Drag-and-drop (fastest, ~2 minutes)

No Git, no command line.

1. Go to **https://app.netlify.com** and sign up / log in (free — email, GitHub, or Google).
2. On your Netlify dashboard, look for the **"Add new site"** button → choose **"Deploy manually"** (sometimes shown as a big dashed drop-zone that says *"Drag and drop your site output folder here"*).
3. Unzip `storyboard-mural-dist.zip` on your computer — you'll get an `assets` folder and an `index.html`.
4. Drag that unzipped **folder's contents** (or the folder itself) onto the drop zone.
5. Netlify uploads it and gives you a live URL immediately, like `https://random-name-123.netlify.app`.
6. Open the URL — your storyboard is live.

**To update later:** rebuild, re-zip, and drag the new `dist` folder onto the same site's **Deploys** tab.

**Downside:** every future change means manually rebuilding and re-uploading.

---

## Option B — Git-based (recommended for ongoing work)

Netlify watches your repo and redeploys automatically every time you push a change.

### 1. Push the source to GitHub

```bash
# unzip storyboard-mural-source.zip into a folder, then:
cd storyboard-mural
git init
git add .
git commit -m "Initial commit — storyboard mural"
```

Create a new empty repo on **https://github.com/new** (don't initialize it with a README), then:

```bash
git remote add origin https://github.com/YOUR_USERNAME/storyboard-mural.git
git branch -M main
git push -u origin main
```

### 2. Connect Netlify to the repo

1. Go to **https://app.netlify.com** → **"Add new site"** → **"Import an existing project"**.
2. Choose **GitHub** and authorize Netlify to access your repositories.
3. Select the `storyboard-mural` repo.
4. Netlify auto-detects the build settings from `netlify.toml`:
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
5. Click **"Deploy site"**.
6. Wait ~1 minute for the first build — you'll get a live URL like `https://storyboard-mural-abc123.netlify.app`.

### 3. Future updates

Just push to `main` — Netlify rebuilds and redeploys automatically:

```bash
git add .
git commit -m "Update tiles feature"
git push
```

---

## After deploying (either option)

- **Custom domain:** Site settings → Domain management → Add a custom domain. Free `.netlify.app` subdomains can also be renamed under Site settings → Change site name.
- **HTTPS:** Enabled automatically by Netlify at no cost.
- **Data storage:** The app saves your board to the browser's `localStorage`, scoped per-device/browser. There's no shared backend, so two people opening the same URL will each have their own separate board — use the **Download/Load** buttons in the app to share a board file between people or devices.

## Notes on free tier limits

Netlify's free tier includes 100 GB bandwidth/month and 300 build minutes/month — far more than a small internal tool like this will use. No credit card required to start.

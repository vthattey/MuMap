# MuMap

A Mural-style mapping board for user stories, technical stories, assumptions/questions,
and estimates — with drag, zoom/pan, undo/redo, multi-select, shape-based tiles,
connector-dot linking, and JSON export/import.

Multiple registered users can collaborate on the same map in real time: live cursors,
instant tile/link sync, and any number of separate maps in a shared workspace.

## Backend setup (Supabase)

MuMap is a static frontend; all accounts, maps, and real-time sync are powered by
[Supabase](https://supabase.com) (Postgres + Auth + Realtime). Netlify only ever hosts
static files — no server of its own is needed.

1. Create a free project at [supabase.com](https://supabase.com).
2. Open the SQL editor and run everything in `supabase/schema.sql`.
3. (Optional, for frictionless signup) In **Authentication → Providers → Email**, turn off
   "Confirm email" so new users can sign in immediately after registering. Leave it on if
   you'd rather require email verification first.
4. Copy your project's **URL** and **anon public key** from **Project Settings → API**.
5. Copy `.env.example` to `.env.local` and fill in those two values:
   ```
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-public-key
   ```
6. For a deployed build, add the same two variables in Netlify's
   **Site settings → Environment variables**.

Until these are set, the app still loads (so you can look around) but shows a banner and
auth/data calls will fail — registration, login, and maps all require a configured Supabase project.

### Data model / sharing model

- **Shared workspace**: every registered user can see, edit, and delete every map — there's
  no per-map ownership or invite flow.
- **Conflict handling**: last-write-wins per tile/link field. Two people editing the exact
  same field at the same instant means whichever write lands last wins.
- **Undo/redo** is local to each browser tab only — it is not shared across collaborators.

## Local development

```
npm install
npm run dev
```

## Production build

```
npm run build
```

Outputs a static site to `dist/`.

## Deploy to Netlify

See `DEPLOY_NETLIFY.md` for full step-by-step instructions. Two options:

1. **Drag-and-drop** — no account setup needed beyond a free Netlify account. Just drag the `dist/` folder onto Netlify.
2. **Git-based (recommended)** — push this folder to GitHub and connect it to Netlify for automatic redeploys on every push.

Either way, remember to set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the site's
environment variables — Vite bakes them into the build at build time.

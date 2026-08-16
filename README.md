# Storyboard Mural

A pinboard-style storyboard for user stories, technical stories, assumptions/questions,
and estimates — with drag, zoom/pan, undo/redo, multi-select, linking, and JSON export/import.

Data autosaves to the browser's `localStorage`, so it persists between visits on the same device/browser.

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

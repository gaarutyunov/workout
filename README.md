# Fitness Tracker

A serverless, browser-only body-recomposition tracker — workouts, nutrition, body
metrics, an interactive muscle map, and an AI coach. Implements [`SPEC.md`](./SPEC.md).

- **Local-first:** all reads/writes hit **RxDB** (IndexedDB) first → instant UI, full
  offline use.
- **Your data, your Dropbox:** cross-device sync runs through *the user's own* Dropbox
  App folder via OAuth PKCE — no developer server, no shared secret, no per-user cost.
- **Your AI spend:** the optional coach runs on *the user's own* OpenRouter account.
- **Static hosting:** deploys as a static site to GitHub Pages.

## Tech stack

React 18 + Vite (TypeScript) · RxDB (Dexie/IndexedDB) · custom Dropbox replication
plugin · Ajv validation · `react-body-highlighter` · Vercel AI SDK + OpenRouter ·
GitHub Pages.

## Local development

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc --noEmit && vite build → dist/
npm test         # vitest (schema + logic tests)
```

The database starts **empty** — no data ships in the repo. Load your own via the
**Import** page (paste notes into any AI assistant with the in-app prompt template,
upload the JSON), or let it arrive over Dropbox sync. See [Importing data](#importing-data).

## Configuration

Copy `.env.example` → `.env` and fill in the public OAuth client ids (no secrets — the
app uses PKCE everywhere):

| Variable | Purpose |
|---|---|
| `VITE_DROPBOX_APP_KEY` | Dropbox app key (Scoped access, **App folder**). Registered once by you; users don't register their own. Leave blank to run fully offline. |
| `VITE_BASE` | Vite base path. Defaults to `/workout/` for GitHub Pages. |

> OpenRouter needs no build-time config — its OAuth PKCE flow uses no client id, so
> users either connect with one click or paste an API key, both handled at runtime.

### OAuth redirect URIs

Register the deployed Pages URL (and PR-preview URLs if you use them) as the callback
for both Dropbox and OpenRouter. HTTPS only; `localhost` is allowed for dev.

## Architecture

```
React UI ─▶ RxDB (IndexedDB) ◀─▶ Dropbox replication plugin ◀─▶ User's Dropbox (App folder)
   │            │ reactive RxQuery            │ poll + push, one JSON file per document
   └─▶ AI agent (Vercel AI SDK) ─▶ OpenRouter (user's key) ─▶ tools read/write RxDB
```

- **Conflict resolution** is RxDB's built-in handler, customised to last-write-wins by
  `updatedAt` (ties broken by `deviceId`). One file per document means real conflicts
  are rare; Dropbox `(conflicted copy)` files are reconciled in the pull handler.
- **Deterministic ids** keyed by the active date (`w-<date>`, `le-<date>-<ex>`, …) make
  every write idempotent, so backfilling a day corrects rather than duplicates.

Key directories:

```
src/db/        RxDB schemas, database, conflict handler, write path
src/sync/      Dropbox OAuth (PKCE), API client, replication plugin, sync manager
src/ai/        OpenRouter auth, agent tool surface, system prompt, agent loop
src/import/    Ajv-validated import + copyable prompt template
src/pages/     Dashboard, Calendar, Body map, Nutrition, Plan, History, Chat, Import, Settings
```

## Deployment

`.github/workflows/deploy.yml` builds and publishes `dist/` to the `gh-pages` branch on
every push to `main` (via `JamesIves/github-pages-deploy-action`).
`.github/workflows/pr-preview.yml` deploys per-PR previews under `pr-preview/pr-<n>/`
(via `rossjrw/pr-preview-action`); the main deploy uses `clean-exclude: pr-preview/`.

Set `VITE_DROPBOX_APP_KEY` as a repository **Variable**
(Settings → Secrets and variables → Actions → Variables) if you want Dropbox sync
configured in the deployed build.

## Importing data

Open **Import**, copy the prompt template, paste your free-form notes plus the template
into any AI assistant, and upload the JSON it returns. Each collection is Ajv-validated
and bulk-upserted; re-importing the same ids updates those documents.

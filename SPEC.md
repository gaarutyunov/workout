# Fitness Tracker — Technical Specification

**Version:** 1.0 · **Date:** 30 June 2026
**Owner:** Germán · **Goal:** Body recomposition tracker, fully serverless, browser-only

-----

## 1. Summary

A single-page web app for tracking workouts, nutrition, body metrics, and an interactive muscle map — running **entirely in the browser**, deployed as a static site to **GitHub Pages**, with **no backend the developer maintains**. Data lives locally in **RxDB** (IndexedDB) and syncs across the user’s devices through **the user’s own Dropbox account** via OAuth PKCE. Conflict handling uses **RxDB’s built-in revision-based conflict resolution** (last-write-wins by `updatedAt`); no CRDT layer. An optional AI agent connects to **the user’s own OpenRouter account** for natural-language logging.

**Core principles**

- No server, no developer-held secret, no per-user cost to the developer.
- Local-first: the app is fully usable offline; Dropbox is the durable cross-device sync target.
- The user owns their data (in their own Dropbox) and their AI spend (in their own OpenRouter account).

-----

## 2. Tech stack

|Layer              |Choice                                                                                      |
|-------------------|--------------------------------------------------------------------------------------------|
|Framework          |React 18 + Vite (TypeScript)                                                                |
|Local database     |RxDB with the Dexie/IndexedDB storage (free)                                                |
|Sync backend       |The user’s own Dropbox (App folder), via a custom RxDB replication plugin                   |
|Auth to Dropbox    |OAuth 2 Authorization Code + PKCE, `token_access_type=offline`, no client secret            |
|Conflict resolution|RxDB built-in conflict handler (custom: last-write-wins by `updatedAt`)                     |
|Muscle diagram     |`react-body-highlighter` (SVG, muscle-slug click handlers)                                  |
|Calendar           |`react-day-picker` or a light custom month grid over the `workouts`/`activities` collections|
|Import validation  |Ajv (JSON Schema) — validate before bulk upsert                                             |
|AI agent (optional)|OpenRouter (OAuth PKCE, user’s key) + Vercel AI SDK, client-side                            |
|Hosting            |GitHub Pages from `gh-pages` branch                                                         |
|CI / previews      |GitHub Actions: build + deploy; `rossjrw/pr-preview-action` for PR previews                 |

Set Vite `base: '/<repo-name>/'` and use `HashRouter` (or copy `index.html` → `404.html`) so deep links don’t 404 on Pages.

-----

## 3. Architecture

```
┌────────────────────────── Browser (static SPA on GitHub Pages) ──────────────────────────┐
│                                                                                           │
│  React UI ──▶ RxDB (IndexedDB)  ◀──▶  Dropbox replication plugin  ◀──▶  User's Dropbox     │
│     │             │  local-first, instant            │ poll + push (one JSON per doc)      │
│     │             └─ reactive queries (RxQuery)       └─ App folder: /collections/...       │
│     │                                                                                       │
│     └──▶ AI agent (Vercel AI SDK) ──▶ OpenRouter (user's key, OAuth PKCE) ─▶ tools call RxDB │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

- **All reads/writes hit RxDB locally first** → instant UI, full offline support.
- **Replication is asynchronous and polled** (no webhooks, since webhooks need a server). On app open and on an interval, the plugin pushes changed docs to Dropbox and pulls remote changes.
- **One JSON file per document** in Dropbox (not one big file) so two devices writing different documents never collide; same-document edits are resolved by the conflict handler.

-----

## 4. Dropbox connection (OAuth PKCE, no secret)

1. Register one Dropbox app (Scoped access, **App folder** permission). You register it **once** — users do **not** register their own.
1. Implement Authorization Code + PKCE in the browser:
- Generate `code_verifier` (random) and `code_challenge = base64url(SHA-256(verifier))` via Web Crypto.
- Redirect to `https://www.dropbox.com/oauth2/authorize?client_id=<APP_KEY>&response_type=code&code_challenge=<challenge>&code_challenge_method=S256&token_access_type=offline&redirect_uri=<pages-url>`.
- On redirect back, POST to `https://api.dropbox.com/oauth2/token` with `grant_type=authorization_code`, `code`, `code_verifier`, `client_id`, `redirect_uri` — **no client secret**.
- Store the returned `refresh_token` in IndexedDB. Mint short-lived access tokens with `grant_type=refresh_token` + `client_id` (no secret) as needed.
1. Scope is limited to the app’s own sandboxed folder in the user’s Dropbox. Treat the refresh token as sensitive (anyone with the device’s browser storage can reach that folder).

**Dropbox file layout (App folder):**

```
/collections/workouts/<id>.json
/collections/loggedExercises/<id>.json
/collections/meals/<id>.json
/collections/nutritionDays/<id>.json
/collections/activities/<id>.json
/collections/bodyMetrics/<id>.json
/collections/exercises/<id>.json
/collections/planExercises/<id>.json
/collections/menuItems/<id>.json
/collections/profile/<id>.json
/collections/chatSessions/<id>.json   (optional — only if transcript sync is enabled)
/_meta/cursor.json        (Dropbox list_folder cursor for incremental pull)
```

-----

## 5. RxDB replication & conflict resolution

### Replication (custom plugin over Dropbox)

Use RxDB’s generic replication primitive `replicateRxCollection` with a custom `pull`/`push` handler per collection:

- **push handler:** for each changed doc, `filesUpload` to `/collections/<collection>/<id>.json` with `mode: 'overwrite'`. Soft-deletes (`_deleted: true`) are written as tombstone JSON (don’t hard-delete the file immediately, so other devices learn of the deletion).
- **pull handler:** use `/files/list_folder` + `list_folder/continue` with the stored cursor (or `list_folder/get_latest_cursor` + `longpoll`) to fetch changed files since last sync, download each, and hand them to RxDB.
- **checkpoint:** persist the Dropbox cursor in `/_meta/cursor.json` and in RxDB so pulls are incremental.
- **cadence:** pull on app focus + every N seconds while active; debounce pushes (batch writes, don’t sync per keystroke).

### Conflict handler (built-in, no CRDT)

Every document carries an `updatedAt` (ISO string) and `deviceId`. Register a custom conflict handler that resolves to the higher `updatedAt` (ties broken by `deviceId`):

```ts
const conflictHandler: RxConflictHandler<any> = {
  isEqual: (a, b) => a.updatedAt === b.updatedAt && a._deleted === b._deleted,
  resolve: ({ newDocumentState, realMasterState }) =>
    newDocumentState.updatedAt >= realMasterState.updatedAt
      ? newDocumentState
      : realMasterState,
};
```

This is last-write-wins **per document**. Because each workout, set-group, and meal is its own document, real-world conflicts are rare (you’d have to edit the *same* entry on two offline devices). For a single user across phone + laptop this is sufficient — no CRDT needed.

**Dropbox “(conflicted copy)” guard:** if two devices overwrite the same file within Dropbox’s window, Dropbox may create a `… (conflicted copy …)` file. Add a reconciliation pass in the pull handler: detect filenames containing `conflicted copy`, parse them, feed both versions through the conflict handler, write the winner back, and delete the conflicted-copy file.

-----

## 6. Data schema (RxDB collections)

Conventions for **every** collection: primary key `id` (string), plus housekeeping fields `updatedAt` (ISO date-time, drives conflict resolution), `deviceId` (string), and RxDB’s internal `_deleted`. `version: 0`. Dates are `YYYY-MM-DD`; timestamps are ISO 8601.

> The companion file **`fitness_import.json`** contains all current data conforming to this schema. The import top level has one array per collection (`profile`, `exercises`, `planExercises`, `workouts`, `loggedExercises`, `meals`, `nutritionDays`, `activities`, `bodyMetrics`, plus reference `muscles`) and a `meta` object. The importer should add `updatedAt`/`deviceId` on ingest.

### 6.1 `profile`

```jsonc
{
  "title": "profile", "version": 0, "primaryKey": "id", "type": "object",
  "properties": {
    "id": { "type": "string", "maxLength": 40 },
    "displayName": { "type": "string" },
    "sex": { "type": "string", "enum": ["male", "female", "other"] },
    "age": { "type": "integer" },
    "heightCm": { "type": "number" },
    "startWeightKg": { "type": "number" },
    "goal": { "type": "string" },
    "programStart": { "type": "string", "format": "date" },
    "splitType": { "type": "string" },
    "weekendActivities": { "type": "array", "items": { "type": "string" } },
    "targets": {
      "type": "object",
      "properties": {
        "proteinG": { "type": "number" }, "kcalLow": { "type": "number" }, "kcalHigh": { "type": "number" },
        "carbsG": { "type": "number" }, "fatG": { "type": "number" },
        "hydrationLLow": { "type": "number" }, "hydrationLHigh": { "type": "number" }, "fiberG": { "type": "number" }
      }
    },
    "constraints": { "type": "array", "items": { "type": "string" } },
    "asymmetryProtocol": { "type": "string" },
    "notes": { "type": "string" },
    "updatedAt": { "type": "string", "format": "date-time" },
    "deviceId": { "type": "string" }
  },
  "required": ["id"]
}
```

### 6.2 `muscles` (reference, for the body diagram)

```jsonc
{
  "title": "muscles", "version": 0, "primaryKey": "id", "type": "object",
  "properties": {
    "id": { "type": "string", "maxLength": 40 },          // e.g. "chest", "hamstring"
    "label": { "type": "string" },
    "highlighterSlug": { "type": "string" },              // react-body-highlighter muscle slug
    "note": { "type": "string" }
  },
  "required": ["id", "highlighterSlug"]
}
```

Note: `react-body-highlighter` has no dedicated side-delt slug, so the lateral raise’s `side-deltoids` renders on `front-deltoids` (see `muscles[].note`).

### 6.3 `exercises` (catalog)

```jsonc
{
  "title": "exercises", "version": 0, "primaryKey": "id", "type": "object",
  "properties": {
    "id": { "type": "string", "maxLength": 60 },
    "name": { "type": "string" },
    "primaryMuscle": { "type": "string" },                // FK → muscles.id
    "secondaryMuscles": { "type": "array", "items": { "type": "string" } },
    "loadType": { "type": "string", "enum": ["machine","cable","barbell","dumbbell_per_hand","bodyweight","weighted_plate"] },
    "unilateral": { "type": "boolean" },
    "category": { "type": "string", "enum": ["compound","isolation","core"] },
    "note": { "type": "string" },
    "updatedAt": { "type": "string", "format": "date-time" },
    "deviceId": { "type": "string" }
  },
  "required": ["id", "name", "primaryMuscle", "loadType"],
  "indexes": ["primaryMuscle", "category"]
}
```

### 6.4 `planExercises` (current program template + progression state)

```jsonc
{
  "title": "planExercises", "version": 0, "primaryKey": "id", "type": "object",
  "properties": {
    "id": { "type": "string", "maxLength": 60 },
    "dayLabel": { "type": "string" },                      // "Chest & Triceps"
    "weekday": { "type": "string", "enum": ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"] },
    "exerciseId": { "type": "string" },                    // FK → exercises.id
    "targetSets": { "type": "integer" },
    "repLow": { "type": ["integer","null"] },
    "repHigh": { "type": ["integer","null"] },
    "currentWeightKg": { "type": ["number","null"] },
    "loadType": { "type": "string" },
    "nextProgression": { "type": "string" },
    "status": { "type": "string", "enum": ["active","hold","progressing","ready-to-progress","baseline","transition","flagged"] },
    "note": { "type": "string" },
    "updatedAt": { "type": "string", "format": "date-time" },
    "deviceId": { "type": "string" }
  },
  "required": ["id", "exerciseId", "weekday"],
  "indexes": ["weekday", "exerciseId"]
}
```

### 6.5 `workouts` (a logged session)

```jsonc
{
  "title": "workouts", "version": 0, "primaryKey": "id", "type": "object",
  "properties": {
    "id": { "type": "string", "maxLength": 40 },           // "w-2026-06-19"
    "date": { "type": "string", "format": "date" },
    "weekday": { "type": "string" },
    "focus": { "type": "string" },                         // "Back & Biceps"
    "weekNumber": { "type": "integer" },
    "programPhase": { "type": "string" },
    "completed": { "type": "boolean" },
    "notes": { "type": "string" },
    "updatedAt": { "type": "string", "format": "date-time" },
    "deviceId": { "type": "string" }
  },
  "required": ["id", "date"],
  "indexes": ["date", "weekNumber"]
}
```

### 6.6 `loggedExercises` (one per exercise within a session; sets embedded)

```jsonc
{
  "title": "loggedExercises", "version": 0, "primaryKey": "id", "type": "object",
  "properties": {
    "id": { "type": "string", "maxLength": 80 },           // "le-2026-06-19-seated-row"
    "workoutId": { "type": "string" },                     // FK → workouts.id
    "exerciseId": { "type": "string" },                    // FK → exercises.id
    "order": { "type": "integer" },
    "loadType": { "type": "string" },
    "weightKg": { "type": ["number","null"] },             // working load (per loadType)
    "prescribedReps": { "type": "string" },                // "10-12", "12 each", "max hold"
    "isProgression": { "type": "boolean" },
    "progressionNote": { "type": "string" },
    "note": { "type": "string" },
    "sets": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "set": { "type": "integer" },
          "reps": { "type": ["integer","null"] },          // null when only a range was prescribed
          "weightKg": { "type": ["number","null"] },
          "isHold": { "type": "boolean" },                 // planks etc.
          "note": { "type": "string" }                     // "each leg", "each arm"
        },
        "required": ["set"]
      }
    },
    "updatedAt": { "type": "string", "format": "date-time" },
    "deviceId": { "type": "string" }
  },
  "required": ["id", "workoutId", "exerciseId"],
  "indexes": ["workoutId", "exerciseId"]
}
```

**Why this shape:** indexing `exerciseId` makes progression queries trivial (e.g., chest-press load over time = query `loggedExercises` by `exerciseId`, join `workouts` for the date). `weightKg` semantics follow `loadType`: `dumbbell_per_hand` = load in one hand; `barbell` = total plate load (bar weight noted separately where unconfirmed); `bodyweight` = 0.

### 6.7 `meals`

```jsonc
{
  "title": "meals", "version": 0, "primaryKey": "id", "type": "object",
  "properties": {
    "id": { "type": "string", "maxLength": 40 },
    "date": { "type": "string", "format": "date" },
    "slot": { "type": "string", "enum": ["breakfast","brunch","lunch","dinner","snack","preworkout"] },
    "description": { "type": "string" },
    "proteinG": { "type": ["number","null"] },
    "kcal": { "type": ["number","null"] },
    "note": { "type": "string" },
    "updatedAt": { "type": "string", "format": "date-time" },
    "deviceId": { "type": "string" }
  },
  "required": ["id", "date"],
  "indexes": ["date"]
}
```

### 6.8 `nutritionDays` (daily totals / compliance)

```jsonc
{
  "title": "nutritionDays", "version": 0, "primaryKey": "id", "type": "object",
  "properties": {
    "id": { "type": "string", "maxLength": 40 },
    "date": { "type": "string", "format": "date" },
    "dayType": { "type": "string", "enum": ["gym","rest","padel","surf"] },
    "tracked": { "type": "boolean" },
    "proteinG": { "type": ["number","null"] },
    "kcal": { "type": ["number","null"] },
    "vsProteinTarget": { "type": "string" },
    "note": { "type": "string" },
    "updatedAt": { "type": "string", "format": "date-time" },
    "deviceId": { "type": "string" }
  },
  "required": ["id", "date"],
  "indexes": ["date"]
}
```

### 6.9 `activities` (surf / padel / cardio)

```jsonc
{
  "title": "activities", "version": 0, "primaryKey": "id", "type": "object",
  "properties": {
    "id": { "type": "string", "maxLength": 40 },
    "date": { "type": "string", "format": "date" },
    "type": { "type": "string" },                          // "padel", "surf"
    "durationMin": { "type": ["number","null"] },
    "kcalBurned": { "type": ["number","null"] },
    "note": { "type": "string" },
    "updatedAt": { "type": "string", "format": "date-time" },
    "deviceId": { "type": "string" }
  },
  "required": ["id", "date", "type"],
  "indexes": ["date"]
}
```

### 6.10 `bodyMetrics`

```jsonc
{
  "title": "bodyMetrics", "version": 0, "primaryKey": "id", "type": "object",
  "properties": {
    "id": { "type": "string", "maxLength": 40 },
    "date": { "type": "string", "format": "date" },
    "weightKg": { "type": ["number","null"] },
    "bodyFatPct": { "type": ["number","null"] },
    "waistCm": { "type": ["number","null"] },
    "note": { "type": "string" },
    "updatedAt": { "type": "string", "format": "date-time" },
    "deviceId": { "type": "string" }
  },
  "required": ["id", "date"],
  "indexes": ["date"]
}
```

### 6.11 `chatSessions`

A **chat session** is one conversation with the agent. It is **bound to a date** (the active date — today, or a calendar-selected date for backfill) and stores the transcript. **A single date can have many chat sessions** (open the day again, run a second backfill, etc.); they all read and write that date’s data, so repeated edits converge rather than duplicate. Persisting/syncing transcripts is optional and user-toggleable.

```jsonc
{
  "title": "chatSessions", "version": 0, "primaryKey": "id", "type": "object",
  "properties": {
    "id": { "type": "string", "maxLength": 60 },           // chat-<date>-<shortid>
    "date": { "type": "string", "format": "date" },         // bound active date
    "title": { "type": "string" },                          // auto-summary, e.g. "Backfill — Legs & Shoulders"
    "mode": { "type": "string", "enum": ["today", "backfill"] },
    "createdAt": { "type": "string", "format": "date-time" },
    "messages": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "role": { "type": "string", "enum": ["user","assistant","tool"] },
          "content": { "type": "string" },
          "name": { "type": "string" },                     // tool name when role = tool
          "ts": { "type": "string", "format": "date-time" }
        },
        "required": ["role", "ts"]
      }
    },
    "updatedAt": { "type": "string", "format": "date-time" },
    "deviceId": { "type": "string" }
  },
  "required": ["id", "date", "createdAt"],
  "indexes": ["date", "createdAt"]
}
```

Indexing `date` powers the calendar layout (chips per day); indexing `createdAt` powers the list layout (reverse-chronological). See §7 item 7 for the two layouts.

### 6.12 `menuItems` (reusable meal catalog — the “menu”)

The **menu** is the user’s catalog of foods they actually eat, used for quick meal logging. It is **seeded from history** — distinct items pulled from previously logged `meals` (and past chats), deduped, with typical macros, the slot they’re usually eaten in, how often they’ve been logged, and when last eaten. New foods logged via the agent are added back to the menu, so it grows over time. (The companion `fitness_import.json` seeds this collection from the existing meal history.)

```jsonc
{
  "title": "menuItems", "version": 0, "primaryKey": "id", "type": "object",
  "properties": {
    "id": { "type": "string", "maxLength": 60 },           // menu-<slug>
    "name": { "type": "string" },
    "defaultSlot": { "type": ["string","null"], "enum": ["breakfast","brunch","lunch","dinner","snack","preworkout", null] },
    "proteinG": { "type": ["number","null"] },             // typical per serving
    "kcal": { "type": ["number","null"] },
    "timesLogged": { "type": "integer" },                  // frequency, for ranking
    "lastEaten": { "type": ["string","null"], "format": "date" },
    "estimated": { "type": "boolean" },                    // true if macros are estimated, not logged
    "source": { "type": "string", "enum": ["history","manual"] },
    "tags": { "type": "array", "items": { "type": "string" } },
    "updatedAt": { "type": "string", "format": "date-time" },
    "deviceId": { "type": "string" }
  },
  "required": ["id", "name"],
  "indexes": ["defaultSlot", "timesLogged", "lastEaten"]
}
```

Ranking for suggestions = frequency (`timesLogged`) blended with recency (`lastEaten`), optionally filtered by slot. See `suggestMeals` in §8.2 and the meal branch in §8.4.

### 6.13 ID conventions (deterministic & idempotent)

IDs are **deterministic and keyed by the active date**, so logging the same thing twice — including backfilling a day that already has data — **upserts the same document instead of creating a duplicate**. Rules:

- **Format:** lowercase kebab-case; `<date>` is the active date as `YYYY-MM-DD`; `<ex>` is the exercise’s id with the `ex-` prefix stripped (e.g. `ex-chest-press` → `chest-press`); `<slot>` is the meal slot; `<wd>` is the weekday.

|Collection       |ID pattern             |Notes                                                                                                                                       |
|-----------------|-----------------------|--------------------------------------------------------------------------------------------------------------------------------------------|
|`workouts`       |`w-<date>`             |One training session per day is the norm. A genuine second session that day → append a focus slug, e.g. `w-<date>-am`.                      |
|`loggedExercises`|`le-<date>-<ex>`       |Same exercise twice in one session → append `-2`.                                                                                           |
|`meals`          |`m-<date>-<slot>`      |Second item in the same slot → `m-<date>-<slot>-2`. (The seed file uses a numeric variant `m-<date>-<n>`; any stable-unique scheme is fine.)|
|`nutritionDays`  |`nd-<date>`            |Exactly one per day.                                                                                                                        |
|`activities`     |`act-<date>`           |Two activities same day → `act-<date>-<type>`.                                                                                              |
|`bodyMetrics`    |`bm-<date>`            |One per day.                                                                                                                                |
|`planExercises`  |`plan-<wd>-<ex>`       |Not date-keyed (it’s the live template), e.g. `plan-mon-chest-press`.                                                                       |
|`menuItems`      |`menu-<slug>`          |Slug from the item name, e.g. `menu-dinner-smoothie`. Not date-keyed.                                                                       |
|`exercises`      |`ex-<slug>`            |Catalog.                                                                                                                                    |
|`profile`        |`profile-self`         |Singleton.                                                                                                                                  |
|`chatSessions`   |`chat-<date>-<shortid>`|Date-bound but **not** unique per date — `<shortid>` is a ULID/timestamp so many chats can share a date.                                    |

**Backfill safety:** when a backfill chat targets a day that may already hold imported data, the agent should `getHistory`/`getNutrition` first and reuse any existing document `id`s it finds, so edits land on the same records rather than creating parallel ones.

-----

## 7. Feature mapping

1. **Interactive body parts → exercises.** `react-body-highlighter` renders front/back SVG bodies. Clicking a muscle returns its slug; filter `exercises` by `primaryMuscle`/`secondaryMuscles` (mapped through `muscles.highlighterSlug`). Intensity colouring = training volume per muscle, derived from `loggedExercises` joined to `exercises` over a date range.
1. **Menu / nutrition.** A **menu** (`menuItems`) of foods the user actually eats — seeded from logged-meal history, ranked by frequency + recency — powers one-tap meal logging. `meals` (granular) + `nutritionDays` (daily totals & compliance vs `profile.targets`) drive the daily/weekly view. Logging a new food adds it to the menu automatically.
1. **Calendar.** Month grid over `workouts` + `activities` keyed by `date`. Tapping a day shows that day’s logged entries and an **“Open chat for this day”** action that launches a chat **bound to that date** — the agent then logs everything to the selected date instead of today (see backfill in §8.4). This is the primary path for backfilling past sessions.
1. **Workout plan tracking + full history.** `planExercises` holds the current program (targets, current weights, next progression, status). `workouts` + `loggedExercises` are the immutable history; progression charts query `loggedExercises` by `exerciseId` ordered by the parent workout’s `date`.
1. **AI agent.** A client-side agent (Vercel AI SDK + the user’s OpenRouter key) whose tools read and write RxDB directly. Full design in §8.
1. **Import.** See §9.
1. **Chat-session history.** Past agent conversations are stored as `chatSessions`, each **bound to a date** with **many allowed per date**. Two interchangeable browse layouts:
- **Calendar layout** — the month grid (shared with feature 3) shows a chip per chat session on its bound `date`; a day with three chats shows three chips. Tapping one reopens that conversation; tapping an empty day starts a new date-bound chat (backfill).
- **List layout** — a reverse-chronological list of all chat sessions (by `createdAt`), each row showing the bound date, title, and mode (today/backfill). Best for “what did I do recently” scanning.
  A toggle switches between the two. Both read the same `chatSessions` collection (indexed on `date` and `createdAt`).

-----

## 8. Agentic AI tooling

The AI agent is a **client-side coach** that logs sessions and meals, answers progression questions, and proposes the next weight — all by calling typed tools that read and write RxDB. There is no server: the agent loop, the tools, and the database all run in the browser. The model is reached through **the user’s own OpenRouter account**, so the developer pays nothing for inference and the user controls spend.

### 8.1 Runtime

- **SDK:** Vercel AI SDK (`ai` + `@openrouter/ai-sdk-provider`). Use `streamText`/`generateText` with `tools` and `maxSteps` > 1 so the model can chain tool calls (parse notes → write several documents → confirm) in a single turn.
- **Provider:** OpenRouter. The user authenticates with OpenRouter via **OAuth PKCE** (same no-secret pattern as Dropbox) or pastes an API key; the key is stored in IndexedDB. Set a **per-key spend limit** in OpenRouter as the real cost guardrail.
- **Model routing:** let the user pick a model string (e.g. a mid-tier general model for logging, a stronger one for weekly analysis). Default to a cheap, fast model for the high-frequency logging path; offer a “deep analysis” toggle that switches models for summaries.
- **Streaming + offline:** tool calls hit local RxDB, so logging works fully offline; only the model round-trip needs connectivity. Writes are optimistic (local first), then replicate to Dropbox on the next sync.

### 8.2 Tool surface

Every tool is a thin, validated wrapper over an RxDB operation. Define each with a Zod schema (the AI SDK turns it into the JSON Schema the model sees). Write tools **stamp `updatedAt` (now) and `deviceId`** and use `bulkUpsert`, so re-running a tool with the same `id` is idempotent and never duplicates. The same Ajv per-collection schemas from §6 validate tool output before it touches the DB.

|Tool                   |Purpose                                                                                                                                                                                                  |RxDB op                                                           |
|-----------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------|
|`getToday`             |Return the current date (`YYYY-MM-DD`), weekday, and ISO datetime + timezone from the device clock. The agent has no internal clock — always call this; never guess the date.                            |device clock (no DB)                                              |
|`getActiveDate`        |Return the date this chat is **bound to** for logging — today for a normal chat, or the calendar-selected date for a backfill chat — plus its weekday and an `isBackfill` flag. All writes use this date.|app context (chat binding)                                        |
|`getPlan`              |Return the **current** program for a weekday (exercises, rep targets, current weights, status). Always call this — never assume the plan.                                                                |query `planExercises` by `weekday`, join `exercises`              |
|`getProfile`           |Return current goal, targets, constraints, and the asymmetry protocol.                                                                                                                                   |read `profile`                                                    |
|`getHistory`           |Return prior sets for an exercise (for progression questions/charts).                                                                                                                                    |query `loggedExercises` by `exerciseId`, join `workouts` for dates|
|`getNutrition`         |Daily meals + totals vs `profile.targets` for a date range.                                                                                                                                              |query `meals` + `nutritionDays` by `date`                         |
|`suggestMeals`         |Return several menu picks to choose from, ranked by frequency + recency, optionally filtered by slot.                                                                                                    |query `menuItems` (ranked); fallback aggregate `meals`            |
|`logWorkout`           |Create/Upsert a `workouts` session for a date.                                                                                                                                                           |`workouts.upsert`                                                 |
|`logExercise`          |Add/Upsert a `loggedExercises` entry (with its `sets`) to a session.                                                                                                                                     |`loggedExercises.upsert`                                          |
|`addMeal`              |Add/Upsert a meal; may take a `menuItemId` to prefill name/macros. Recompute the day’s `nutritionDays` total.                                                                                            |`meals.upsert` (+ `nutritionDays.upsert`)                         |
|`upsertMenuItem`       |Add or update a menu item (new foods join the menu; bump `timesLogged`/`lastEaten`).                                                                                                                     |`menuItems.upsert`                                                |
|`logActivity`          |Record padel/surf/cardio.                                                                                                                                                                                |`activities.upsert`                                               |
|`addBodyMetric`        |Record weight/measurements.                                                                                                                                                                              |`bodyMetrics.upsert`                                              |
|`upsertPlanExercise`   |Create or edit a plan entry: weekday, exercise, target sets/rep range, current weight, loadType, `nextProgression`, status. This is how the user changes the plan.                                       |`planExercises.upsert`                                            |
|`removePlanExercise`   |Remove a plan entry (tombstone).                                                                                                                                                                         |`planExercises.upsert` with `_deleted: true`                      |
|`updatePlanProgression`|Convenience: advance a plan entry’s current weight/status after its target is cleanly met.                                                                                                               |`planExercises.upsert`                                            |
|`updateProfile`        |Edit goal, targets, constraints, or the asymmetry protocol.                                                                                                                                              |`profile.upsert`                                                  |
|`flagDeviation`        |Note a deviation (e.g. load rose before the plan entry’s target was met) on the logged entry.                                                                                                            |patch `loggedExercises.note`                                      |

**Example tool definition** (logging an exercise into a session):

```ts
import { tool } from "ai";
import { z } from "zod";

const logExercise = tool({
  description:
    "Log one exercise within a workout session, including all sets. " +
    "weightKg is the load per loadType: dumbbell_per_hand = one hand, " +
    "barbell = total plates, bodyweight = 0. Use null for unknown reps/weight.",
  parameters: z.object({
    workoutId: z.string().describe("e.g. w-2026-06-30"),
    exerciseId: z.string().describe("FK to exercises.id, e.g. ex-chest-press"),
    order: z.number().int(),
    loadType: z.enum([
      "machine","cable","barbell","dumbbell_per_hand","bodyweight","weighted_plate",
    ]),
    weightKg: z.number().nullable(),
    prescribedReps: z.string().optional(),
    sets: z.array(
      z.object({
        set: z.number().int(),
        reps: z.number().int().nullable(),
        weightKg: z.number().nullable(),
        isHold: z.boolean().optional(),
        note: z.string().optional(),
      }),
    ),
    note: z.string().optional(),
  }),
  execute: async (args) => {
    const id = `le-${args.workoutId.slice(2)}-${args.exerciseId.replace(/^ex-/, "")}`;
    const doc = { id, ...args, updatedAt: new Date().toISOString(), deviceId };
    await db.loggedExercises.upsert(doc); // Ajv-validated upstream
    return { ok: true, id };
  },
});
```

### 8.3 System prompt (stable policy only — no plan data)

The system prompt holds **only stable behavioural policy**. It contains **no split, no exercises, no weights, no rep targets, and no protocols**, because the user edits the plan and profile and those would go stale. The agent must read current state through tools every turn and treat anything not returned by a tool as unknown.

Embed roughly this:

- **Role:** Act as the user’s strength & nutrition coach for logging and analysis.
- **Never assume the plan.** The program and profile are user-editable and change over time. Before advising, progressing, or logging against a target, call `getPlan(weekday)` (and `getProfile` for goals/targets/constraints/asymmetry protocol). Do not rely on any plan detail from earlier in the conversation or from memory — re-fetch it.
- **No internal clock.** You do not know the real date. Call `getToday` for the actual current date/weekday (e.g. to resolve “yesterday”); never guess it.
- **Logging date.** Every chat is bound to one **active date**: today for a normal chat, or a past date when the user opened the chat from the calendar to backfill. Call `getActiveDate` and use that date for **all** writes (workouts, meals, activities, metrics). Drive `getPlan` with the active date’s weekday. Never log to today when the chat is a backfill chat.
- **Session start.** At the beginning of a new chat, first call `getActiveDate`, then greet briefly — noting the date when it’s a backfill (e.g. “Backfilling Thu 18 Jun”) — and ask whether they want to **log a workout**, **log a meal**, or **just chat**, then branch on their choice (see §8.4).
- **Progression is data-driven.** Advance a lift only when the logged sets cleanly meet *that plan entry’s* target (`targetSets` × the top of its rep range); a first session at a new load typically reads a descending pattern (e.g. 12/10/8). Apply the increment specified in that entry’s `nextProgression`. Do not use hardcoded thresholds or increments.
- **Deviation flagging.** If a logged load rose before that entry’s target was cleanly met, call `flagDeviation` rather than silently accepting it.
- **Unilateral work.** Follow the asymmetry protocol exactly as returned by `getProfile` (which side leads, rep matching, any extra set).
- **Plan edits go through tools.** When the user changes the program, call `upsertPlanExercise` / `removePlanExercise` (or `updatePlanProgression` for a simple advance) and `updateProfile` for profile changes — never by “remembering” a new plan in the prompt.
- **Load semantics (stable encoding rule).** `weightKg` is the load per `loadType`: `dumbbell_per_hand` = one hand, `barbell` = total plates, `bodyweight` = 0.
- **Meals: suggest from the menu first.** When logging a meal, call `suggestMeals` and offer a few likely picks (frequent + recent for that slot) before asking the user to type. Log the chosen item with `addMeal`; add any new food to the menu with `upsertMenuItem`.
- **Tone.** Terse logging confirmations; reserve longer analysis for explicit summary requests.

### 8.4 Conversation entry flow

Every new chat starts the same way:

1. **Agent calls `getActiveDate`** to anchor the chat’s logging date and weekday. This is **today** for a normal chat, or a **calendar-selected past date** when the chat was opened to backfill. Every write in this chat uses that date.
1. **Agent greets briefly** — noting the date when it’s a backfill (e.g. “Backfilling Thu 18 Jun”) — **and offers three choices** (quick-reply buttons): **Log workout**, **Log meal**, **Just chat**.
1. **Branch on the choice:**
- **Log workout** → call `getPlan(activeDate.weekday)` to load that day’s prescribed session (the user can override which session). Confirm, then run the workout-logging flow in §8.5.
- **Log meal** → call `suggestMeals(slot)` and present several menu picks as quick-reply buttons (most-eaten + recent) plus a “something else” option. On a pick, call `addMeal` with that `menuItemId` (macros prefilled) and bump the item via `upsertMenuItem`; on “something else”, ask for it, `addMeal`, then `upsertMenuItem` so it joins the menu. Recompute the day’s `nutritionDays` total. Optionally call `getProfile` to report protein/kcal remaining vs target. Repeat for more items.
- **Just chat** → no writes by default. Answer using `getHistory`, `getNutrition`, `getPlan`, `getProfile` as needed (e.g. progression questions, “what’s left to hit 150g today?”). Only write if the user explicitly asks, then route to the matching tool.
1. The chosen branch is not locked in — the user can switch mid-chat (e.g. log a meal, then ask a question). The **active date** from step 1 is reused for the whole session. Because write tools key on deterministic `id`s derived from that date (§6.13), backfilling is idempotent — re-logging a day corrects rather than duplicates.

### 8.5 Workout-logging flow

A single “log today’s session” message drives an agentic chain:

1. `getPlan(weekday)` using the weekday from `getActiveDate` (and `getProfile` if protocols matter) → read the current prescribed exercises, targets, and weights. Never assume them.
1. Parse the user’s free-text sets.
1. `logWorkout` to create the session.
1. `logExercise` per exercise (with `sets`).
1. For any exercise that cleanly met its plan entry’s target, `updatePlanProgression` using that entry’s `nextProgression`; for any load that rose before the target was met, `flagDeviation`.
1. Return a short confirmation summarising what was written and any flags.

Because steps 3–5 are idempotent upserts keyed by deterministic `id`s, re-sending the same message corrects rather than duplicates.

### 8.6 Write safety & guardrails

- **Confirm-before-write (default):** run the agent with tool calls surfaced as proposed changes the user taps to approve; flip to auto-apply once trusted. Either way, writes are local and reversible via the document’s history.
- **No destructive deletes from the agent:** the agent never hard-deletes; “remove” sets `_deleted: true` (a tombstone) so the deletion still syncs and can be undone.
- **Validation:** tool output is Ajv-validated against the §6 schemas before `upsert`; invalid args are returned to the model to retry.
- **Idempotency & dedupe:** deterministic `id`s + `bulkUpsert` mean retries and re-runs converge instead of duplicating.
- **Cost & secrets:** OpenRouter key and Dropbox refresh token live in browser storage (see §11); cap spend per key in OpenRouter; keep the model’s tool scope to this app’s collections only.
- **Reuse path:** these same tool definitions can later be exposed over MCP, letting an external assistant drive the tracker with the identical write-safe surface.

-----

## 9. Import feature (external-agent → JSON → app)

The app shows two things: a **copyable prompt template** and the **JSON schema** below. A user pastes free-form notes into any AI agent (ChatGPT/Claude/etc.), gets back JSON, uploads the file, and the app **Ajv-validates then bulk-upserts** per collection (adding `updatedAt`/`deviceId` on ingest).

**Import file shape** (matches `fitness_import.json`):

```jsonc
{
  "meta": { "schemaVersion": 1, "generatedAt": "YYYY-MM-DD", "source": "..." },
  "profile": [ /* profile docs */ ],
  "muscles": [ /* optional reference */ ],
  "exercises": [ /* catalog */ ],
  "planExercises": [ ... ],
  "workouts": [ ... ],
  "loggedExercises": [ ... ],
  "meals": [ ... ],
  "menuItems": [ /* the menu, seeded from meal history */ ],
  "nutritionDays": [ ... ],
  "activities": [ ... ],
  "bodyMetrics": [ ... ]
}
```

**Prompt template (copyable in-app):**

> You are a data formatter. Convert my training and nutrition notes into ONE JSON object matching this schema exactly: [app pastes the JSON Schema]. Rules: output only valid JSON, no prose, no markdown fences. Use ISO dates (YYYY-MM-DD). One `workouts` entry per session; one `loggedExercises` entry per exercise in that session, with a `sets` array. `weightKg` is the load per `loadType` (`dumbbell_per_hand` = one hand; `barbell` = total plates; `bodyweight` = 0). If a value is unknown, use `null` (for reps/weight) or omit the optional field. Generate stable `id`s like `w-<date>`, `le-<date>-<exercise-slug>`, `m-<date>-<n>`. My notes: […].

**Validation/ingest:** load → Ajv-validate each array against the per-collection schema → on success, `bulkUpsert` into the matching RxDB collection → report per-row errors to the user. Importing the same `id` again updates that doc (idempotent).

-----

## 10. Deployment

- **Build/deploy:** GitHub Actions builds the Vite app and deploys `dist/` to `gh-pages` (`JamesIves/github-pages-deploy-action`). Vite `base: '/<repo>/'`; copy `index.html`→`404.html` or use `HashRouter`.
- **PR previews:** `rossjrw/pr-preview-action` deploys each PR to `pr-preview/pr-<n>/` and comments the URL; main deploy uses `clean-exclude: pr-preview/` so previews aren’t wiped.
- **OAuth redirect URIs:** register the Pages URL (and preview URLs if needed) as Dropbox and OpenRouter callbacks. HTTPS only; localhost allowed for dev.

-----

## 11. Gotchas & limits

- **Polling only** (no webhooks without a server): expect seconds-to-minutes convergence. Fine for fitness logging.
- **Dropbox rate limits:** respect `Retry-After`, exponential backoff on 429; debounce/batch writes; one immutable-ish file per doc avoids namespace-lock contention.
- **Conflict files:** run the `(conflicted copy)` reconciliation pass in the pull handler.
- **Token storage:** Dropbox refresh token + OpenRouter key live in browser storage; scope Dropbox to App folder; set an OpenRouter per-key spend cap; keep a strict CSP and tight dependencies (no backend to hide secrets behind).
- **RxDB storages:** Dexie/IndexedDB storage is free; RxDB’s premium IndexedDB/OPFS storages are paid — not needed at this data volume.
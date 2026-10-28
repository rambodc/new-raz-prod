# Razzberry

The **fan counter**. A fan checks in at a live show, and for every artist on the bill their number goes up by one. Your number for an artist is how many of that artist's shows you have been to.

## Screens

| Route | What it is |
| --- | --- |
| `/signin`, `/signup`, `/forgot-password` | Email and password accounts |
| `/` | Home (signed in): **Tonight** (shows on now or later today, each with a big "I'm here") and **Your numbers** (one row per artist) |
| `/artist/:id` | The artist's picture, name, total fans and past shows |
| `/admin` | Admins only: add a show, edit its end time or delete it, upload one picture per artist |
| `/location-help` | How to turn on location, shown if the browser says no |
| `/welcome` | Account: who you are, and sign out |

## How it works

- **Check-in.** The app says "We use your location once to confirm you're at the show", asks the browser for the position, and calls the `checkIn` callable Cloud Function (v2). The function accepts the check-in only if the show is live (from 15 minutes before it starts to 15 minutes after it ends), the phone's accuracy is 200 m or better, and the fan is within 150 m of the venue (up to 50 m of reported accuracy is forgiven). It is one check-in per fan per show, and a second tap just says "already checked in". The fan's coordinates are never stored.
- **Counting.** In one transaction the function writes `checkins/{showId}_{uid}`, adds one to `users/{uid}/artistCounts/{artistId}` for each artist on the bill, and, the first time a fan is counted for an artist, adds `artists/{artistId}/fans/{uid}` and one to the artist's `fanCount` (distinct fans, never double counted).
- **Admins** are the users with a document in `admins/{uid}`. Clients cannot write that collection. Seed it with `functions/scripts/seed-admin.mjs` (see below) or by hand in the Firebase console.
- **Artist pictures.** An admin picks one picture per artist; the browser shrinks it to at most 1000 px and the `setArtistImage` function (admins only) checks the type and the 5 MB cap and stores it at `artists/{artistId}/image` in Cloud Storage. Storage rules make those files public to read and closed to every client write.
- **Rules.** Signed-in users read shows and artists; only admins write them (shows: create, change the end time, delete; artists: add and rename). A fan reads only their own numbers and check-ins. Check-ins, counts, fan totals and images are written only by the functions.

### Adding the first admin

1. The person signs up in the app.
2. With access to the `new-raz-prod` project (for example `gcloud auth application-default login`):

```sh
cd functions && npm ci
node scripts/seed-admin.mjs their-email@example.com
```

Or in the Firebase console: Firestore, start collection `admins`, document ID = their user ID (Authentication, Users, User UID), any field (for example `email`).

### How it's built

- **React 19 + TypeScript + Vite**, no UI library. Plain CSS in `src/styles`: the Aurora look (`app.css`, `screens.css`) for the app screens, and the sign-in styles (`base.css`, `components.css`, `pages.css`). The font (Outfit) is self-hosted. Dark by default with a light switch.
- **Firebase** (Auth, Firestore, Functions, Storage) is loaded on demand. All Firestore and Functions calls are in `src/data/api.ts`; the screens never import Firebase directly.
- **Functions** live in `functions/`; the check-in rules are plain functions in `functions/lib/checkin.js` with tests.

## Local development

Node.js 22 and Java 21 (for the rules emulator).

```sh
npm ci
cp .env.example .env.local   # then fill in VITE_FIREBASE_API_KEY (see the comment inside)
npm run dev                  # http://localhost:5173
npm run lint
npm test                     # unit + route smoke tests (Vitest, jsdom)
npm run build
npm run test:rules           # Firestore + Storage rules emulator tests (needs Java)

npm ci --prefix functions
npm run lint --prefix functions
npm test --prefix functions
```

`.env.local` is git-ignored. Firebase web config is public client configuration; never put server credentials in `VITE_*` variables.

## Deployment (GitHub Actions, keyless Google Workload Identity Federation)

Hosting, Functions and Rules deploy through **separate, path-filtered workflows**, so a change only ships the part it touched.

| A push to `production` that changes… | Deploys | Workflow |
| --- | --- | --- |
| `src/**`, `public/**`, `index.html`, `package*.json`, `vite.config.ts`, `tsconfig*.json` | Hosting only | `hosting-merge.yml` |
| `functions/**` | Functions only | `functions-merge.yml` |
| `firestore.rules`, `storage.rules`, `firestore.indexes.json`, `tests/**` | Rules and indexes only | `rules-merge.yml` |
| `firebase.json` | All three (it configures all three) | all |

Pull requests into `production` run **one** workflow, `pull-request.yml`, with three jobs named `hosting-validation`, `functions-validation` and `rules-validation` (the required status checks). Every job reports on every PR; each looks at the changed files first and only installs and tests when its area changed, otherwise it passes in a few seconds. Deploy jobs skip the checks that already passed on the PR and only build/deploy.

Speed-ups: shallow checkouts, npm caching, a pinned Firebase CLI via `npx` with its cache (and the emulator jars) cached, per-PR `concurrency` that cancels stale runs, and no Java/npm install on the rules deploy.

Configure these GitHub environment variables in `Prod` (and `Preview` if used):

- `GCP_WIF_PROVIDER`, `GCP_SERVICE_ACCOUNT_EMAIL`
- `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_APP_ID`

Before first use, enable Email/Password in Firebase Authentication and make sure the Firestore database and Storage bucket exist. Cloud Functions deployment requires billing on the project.

# Razzberry

Passwordless sign-in for the web app. A person enters an email, gets a 6-digit code from `Razzberry <login@irobotx.io>`, and comes back to a home screen. New people add a name and an optional photo. Settings edits the name and photo, shows the email, and signs out.

There is no password. The code lives for 10 minutes, allows 5 attempts, and is stored only as a salted hash. Each email can request 5 codes an hour, at least a minute apart. Each IP can request 30 an hour.

`sendLoginCode` and `verifyLoginCode` are callable functions in `us-central1`:

- `https://us-central1-new-raz-prod.cloudfunctions.net/sendLoginCode`
- `https://us-central1-new-raz-prod.cloudfunctions.net/verifyLoginCode`

`verifyLoginCode` returns a Firebase custom token. The client calls `signInWithCustomToken`. A profile that is missing a first name, including any old `displayName` document, is deleted and written again as `role: "fan"`. Old profile fields are not kept. Auth users are reused for the same email. Existing Auth users can also be removed in the Firebase console if a full wipe is wanted; this app does not read the old shape.

The Resend key is the Cloud Secret `RESEND_API_KEY` (already in Secret Manager). It is bound with `defineSecret` and is never logged. Custom tokens need `iam.serviceAccounts.signBlob` on the functions runtime service account. For this project that account is `555086285693-compute@developer.gserviceaccount.com` unless a custom service account is set. Grant `roles/iam.serviceAccountTokenCreator` to that account on itself. Do not put the Resend key in a `VITE_` variable.

`sceneChat` and `sceneImage` are still deployed behind `/api/scene` and `/api/image`. The new pages do not call them. Their key remains `XAI_API_KEY`.

The concert photo is Unsplash `photo-1540039155733-5bb30b53aa14` (Unsplash License), color graded, saved as `public/concert.webp` with a JPEG fallback.

### How it's built

- **React 19 + TypeScript + Vite.** Inter, then the system sans.
- **Firebase Auth, Firestore, Storage.** `users/{uid}` holds firstName, lastName, email, photoURL, role, createdAt, updatedAt. `role` is `fan` or `artist`. A person cannot change their own role. Avatars are `users/{uid}/avatar`, resized in the browser to about 512px.
- **Artists, events and tracks.** `artists/{uid}` holds name, bio, imageURL, ownerUid, createdAt, updatedAt. `events/{eventId}` holds artistId, title, startsAt, venue, city, description, imageURL, ticketUrl, createdAt, updatedAt. `ticketUrl` is optional and must be an http(s) link. `artists/{uid}/tracks/{trackId}` holds title, duration, order, audioURL, coverURL, createdAt, updatedAt. Pages, events and tracks are public to read. Only the owning artist can write. Home lists upcoming events, soonest first. An artist page scrolls from the hero into events and tracks; editing, creating and event details expand on that page. `/event/:id` and `/events/new` open the same page. Hero images are resized in the browser. Audio (mp3, m4a, aac, wav, under 30 MB) is stored at `artists/{uid}/tracks/`.
- **Functions** also still include check-in and the older artist image upload. The new pages do not call them. `setUserRole` is the admin callable that sets a role.

## Local development

Node.js 22 and Java 21 (for the rules emulator).

```sh
npm ci
npm run dev                  # http://localhost:5173
npm run lint
npm test
npm run build
npm run test:rules           # Firestore + Storage rules emulator tests (needs Java)

npm ci --prefix functions
npm run lint --prefix functions
npm test --prefix functions
```

To walk the sign-in flow locally, start the emulators and point Vite at them. The emulator writes the code to `/tmp/razzberry-last-code.json` and does not call Resend. Production always calls Resend.

```sh
npx -y firebase-tools@latest emulators:start --only auth,functions,firestore,storage --project new-raz-prod
VITE_USE_EMULATORS=true npm run dev
```

`/api/scene` and `/api/image` still proxy to `node scripts/scene-server.mjs` when that process is running. The sign-in pages do not use them.

### Make someone an artist or an admin

Uses Application Default Credentials and the Admin SDK. The project is `new-raz-prod`. The person must already have signed in once.

```sh
npm ci --prefix functions
gcloud auth application-default login
node scripts/set-role.mjs someone@example.com artist
node scripts/set-role.mjs someone@example.com fan
node scripts/set-role.mjs someone@example.com --admin
node scripts/set-role.mjs someone@example.com artist --admin
```

`--admin` sets the custom claim `admin: true`. They sign in again before `setUserRole` will accept them. Setting `artist` also creates `artists/{uid}` from their name and photo if that page does not exist yet. There is no admin screen and no way to become an artist inside the app.

## Native iOS

The product to test right now is this web app. A later TestFlight build would wrap the same UI (a WKWebView or Capacitor shell) and needs a Mac with Xcode, an Apple Developer account, and signing certificates. None of that is in this repository, so no iOS project is created or signed here.

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

Before first use, open Firebase Authentication for `new-raz-prod` (custom tokens need Auth enabled; the email/password provider can stay off). Confirm the Firestore database and the Storage bucket `new-raz-prod.firebasestorage.app` exist. Custom tokens also need the signBlob grant described above. Cloud Functions deployment requires billing on the project.

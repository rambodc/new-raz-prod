# Razzberry

The public website is a no-login test homepage: an atmospheric portrait room, a photo cut out in the browser, and a text composer that asks Grok to change the room. There is no sign-in screen and no voice control.

A public page that calls a paid model can run up a bill if someone scripts it. The function caps message size, output tokens, and requests per server instance. That is not a global spending cap. Set a budget on the xAI account before this is public.

The photo never leaves the browser. The cutout uses Google's MediaPipe selfie model (Apache-2.0), loaded from this site the first time someone adds a photo. Chat text goes to our Cloud Function, which calls `api.x.ai`. The provider key is the Cloud Secret `XAI_API_KEY` and is not in the web bundle.

```sh
firebase functions:secrets:set XAI_API_KEY --project new-raz-prod
```

Until that secret exists, the function cannot deploy, and the page says Grok isn't configured. It does not invent a reply.

The earlier fan-counter functions, Firestore rules, Storage rules, and stored accounts stay. This site no longer shows those screens.

The fan-counter Cloud Functions and `functions/scripts/seed-admin.mjs` remain for existing data. The website no longer has those screens or the demo pictures.

### How it's built

- **React 19 + TypeScript + Vite.** One page, system sans-serif. The room is layered CSS color and soft shapes, not a WebGL scene. No login UI.
- **Cutout** is MediaPipe in the browser (`src/portrait`). Chat is `POST /api/scene`, rewritten to the `sceneChat` function.
- **Functions** in `functions/` still include check-in and artist images. `functions/lib/sceneChat.js` is the new chat handler. Tests mock `api.x.ai`; they are not a live Grok call.

## Local development

Node.js 22 and Java 21 (for the rules emulator).

```sh
npm ci
npm run dev                  # http://localhost:5173  (chat proxies to the local scene server)
node scripts/scene-server.mjs
npm run lint
npm test
npm run build
npm run test:rules           # Firestore + Storage rules emulator tests (needs Java)

npm ci --prefix functions
npm run lint --prefix functions
npm test --prefix functions
```

The local scene server reads `XAI_API_KEY` from the environment. Do not put that key in any `VITE_` variable. If it is unset, chat returns the not-configured error.

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

Before first use, enable Email/Password in Firebase Authentication and make sure the Firestore database and Storage bucket exist. Cloud Functions deployment requires billing on the project.

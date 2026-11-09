# Razzberry

The public website is a mobile home screen: the temperature, a house, outdoor light and front-door camera switches, and three daily scene rows. The switches stay in this browser tab. There is no chat screen or event page.

A public page that calls a paid model can run up a bill if someone scripts it. Text chat allows 1000 messages per browser per 10 minutes and 10000 per hour on each server copy. Web search is tighter: 30 per browser per 10 minutes and 150 per hour on each copy, and it also counts toward the text allowance. Images are separate: 8 per browser per 10 minutes and 40 per hour on each copy, one image per request, at most two at a time on a copy. None of these is a global spending cap. Set a budget on the xAI account before this is public.

Chat text goes to `sceneChat`. Public search uses the xAI Responses API with the `web_search` tool and model `grok-4.7` (`XAI_SEARCH_MODEL` overrides it). The search call is allowed 40 seconds, and the chat function is allowed 55 seconds, so a slow first search can finish before Hosting cuts the route at 60 seconds. Page edits that are not handled in the browser use chat completions with `grok-4.20-0309-non-reasoning` (`XAI_MODEL` overrides it). Image generation uses deferred `POST /v1/images/generations` and the browser polls `GET /v1/images/{id}` through `POST /api/image`, because one Hosting request cannot stay open for the whole generation. Image edit uses `POST /v1/images/edits` in one request and keeps the photo's aspect unless the instruction says square, portrait, or landscape. Both use `grok-imagine-image-2.0`, `n: 1`, resolution `1k`, and quality `medium` (`XAI_IMAGE_MODEL` overrides the model). A finished generation is downloaded only from an `x.ai` host and returned as bytes. The provider key is the Cloud Secret `XAI_API_KEY` and is not in the web bundle. No second secret is required. Hosting rewrites `/api/scene` to `sceneChat` and `/api/image` to `sceneImage`. Each image or search request is limited to 55 seconds so Hosting can return it.

```sh
firebase functions:secrets:set XAI_API_KEY --project new-raz-prod
```

Until that secret exists, chat and images say they are not configured. They do not invent a reply or a picture. Search answers are shown only when the provider actually ran web search and returned an https source. An image link is downloaded only when it is the result of our own provider request and the host is `x.ai`.

The earlier fan-counter functions, Firestore rules, Storage rules, and stored accounts stay. The blank page does not call them.

### How it's built

- **React 19 + TypeScript + Vite.** One screen, system sans-serif.
- **Functions** in `functions/` still include check-in, artist images, `sceneChat`, and `sceneImage`. The hosting rewrites for `/api/scene` and `/api/image` stay. The starter page does not call them. Function tests mock `api.x.ai`; they are not a live provider call.

## Local development

Node.js 22 and Java 21 (for the rules emulator).

```sh
npm ci
npm run dev                  # http://localhost:5173  (/api/scene and /api/image still proxy to the local scene server)
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

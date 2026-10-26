# Razzberry

Razzberry is building the system of record for creative rights: give every creative work a permanent identity, and keep a clear record of who made it, who owns it and how it earns.

This repo is the early foundation: a polished home page, email/password accounts and a welcome page. The rights tools themselves are not built yet, and the app doesn't claim they are.

## What's in the app

| Route | What it is |
| --- | --- |
| `/` | Public home page with a real-time 3D raspberry hero, "Create. Prove. Own." and calls to action |
| `/signup` | Create an account (name, email, password with confirmation) |
| `/signin` | Sign in with email and password |
| `/forgot-password` | Firebase password-reset email |
| `/welcome` | Signed-in welcome page (name, email, sign out). Protected |

Signed-in visitors are redirected away from the sign-in/up pages, and signed-out visitors can't open `/welcome`.

### How it's built

- **React 19 + TypeScript + Vite**, with no UI library. Styling is plain CSS (`src/styles`) with design tokens, glass panels, glow and grain. The font (Outfit) is self-hosted.
- **Theme:** dark by default with a light-mode switch. The choice is stored in `localStorage` (`razzberry-theme`) and applied by a tiny inline script before first paint, so there's no flash.
- **3D hero:** `src/three` builds a glossy raspberry with plain three.js, laid out from the logo (drupelets in rows of 6/7/6/5/4 plus a three-leaf crown; geometry lives in `src/lib/raspberry.ts` and is shared with the SVG mark). It loads lazily after first paint, follows the pointer, and pauses when off-screen or in a background tab. An SVG version of the same berry shows while loading, without WebGL, on any error, and when `prefers-reduced-motion` is set.
- **Auth:** Firebase Authentication (email/password only). Firebase is loaded on demand (after idle on the home page), so it never blocks first paint. Sign-up also writes `users/{uid}` (`displayName`, `email`, `createdAt`).
- **Firestore rules:** each user can read and create/update only their own `users/{uid}` document, with a strict field allowlist. Nothing else is readable or writable. Storage is deny-by-default.
- **Functions:** a single `healthCheck` callable keeps the Functions package valid. There is no AI or OpenAI code today. (`OPENAI_API_KEY2` may stay in Secret Manager for future work; nothing reads it.)

## Local development

Node.js 22 and Java 21 (for the rules emulator).

```sh
npm ci
cp .env.example .env.local   # then fill in VITE_FIREBASE_API_KEY (see the comment inside)
npm run dev                  # http://localhost:5173
npm run lint
npm test                     # unit + route smoke tests (Vitest, jsdom)
npm run build
npm run test:rules           # Firestore + Storage rules emulator tests

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

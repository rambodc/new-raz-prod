# Razzberry

Razzberry is an early foundation for creative-rights infrastructure. Its chat-first guide explains the concept and distinguishes possible future ideas from features that exist today.

## Stack

- React, TypeScript, and Vite
- Firebase Email/Password Authentication, Firestore, Storage, and Cloud Functions
- Firebase Hosting
- GitHub Actions with Workload Identity Federation (no service-account key files)

Firebase callable Functions stream concise, Razzberry-only replies from the OpenAI Responses API (`gpt-5-mini`). The API key stays in Google Secret Manager as `OPENAI_API_KEY`. App Check is enforced on chat and saved-chat callables. Guest chats live in browser memory; signed-in conversations are written by trusted Functions and readable only by their owner. Storage remains deny-by-default.

## Local development

Use Node.js 22 and Java 21 for Firebase rules emulators.

```sh
npm ci
cp .env.example .env.local
npm run dev
npm run lint
npm test
npm run build
npm run test:rules

npm ci --prefix functions
npm run lint --prefix functions
npm test --prefix functions
```

Populate `.env.local` with the Firebase web app settings. Local env files are ignored by Git. Firebase web config is public client configuration; never put server credentials in frontend variables.

## Routes

- `/` — public Razzberry chat guide
- `/signup` — chat-styled email/password registration
- `/signin` — chat-styled email/password sign-in
- `/forgot-password` — chat-styled Firebase password reset
- `/dashboard` — redirects to the chat

## Deployment

Pull requests targeting `production` run validation and deploy a Firebase Hosting preview. Merges or direct pushes to `production` deploy Hosting, Functions, and Firebase rules through separate workflows using the `Prod` GitHub environment and Google Workload Identity Federation.

The Firebase project is `new-raz-prod`. Configure these GitHub environment variables in both `Preview` and `Prod`:

- `GCP_WIF_PROVIDER`
- `GCP_SERVICE_ACCOUNT_EMAIL`
- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`
- `FIREBASE_APP_CHECK_SITE_KEY` (public reCAPTCHA Enterprise site key; required in `Prod`; preview builds omit App Check and are for UI review)

Add an OpenAI API key version to the `OPENAI_API_KEY2` secret in Google Secret Manager before deploying Functions. Never store it in GitHub variables, `.env` files, or the frontend. Configure reCAPTCHA Enterprise App Check for the Firebase web app and set its public site key as the `FIREBASE_APP_CHECK_SITE_KEY` variable in the `Prod` GitHub environment. Enable Email/Password in Firebase Authentication and ensure the Firestore database and Storage bucket exist before deploying. Cloud Functions deployment requires billing to be enabled on the Firebase project. Firestore TTL is configured for hourly chat rate-limit counters.

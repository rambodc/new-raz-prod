# Razzberry

Razzberry is an early foundation for creative rights infrastructure: a system of record for what gets created, who owns it, how it earns, and how rights move over time.

## Stack

- React, TypeScript, and Vite
- Firebase Email/Password Authentication, Firestore, Storage, and Cloud Functions
- Firebase Hosting
- GitHub Actions with Workload Identity Federation (no service-account key files)

Firestore and Storage client rules deny all access until product data requirements are designed. The authenticated dashboard is a starter shell and does not store creative records or files.

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

- `/` — public Razzberry homepage
- `/signup` — public email/password registration
- `/signin` — email/password sign-in
- `/forgot-password` — Firebase password reset
- `/dashboard` — authenticated starter workspace

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

Enable Email/Password in Firebase Authentication and ensure the Firestore database and Storage bucket exist before deploying. Cloud Functions deployment requires billing to be enabled on the Firebase project.

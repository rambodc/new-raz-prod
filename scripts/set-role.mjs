// Set a person's role with Application Default Credentials. Project: new-raz-prod only.
// The person must already have signed in once, so users/{uid} exists.
//
//   node scripts/set-role.mjs <email> artist
//   node scripts/set-role.mjs <email> fan
//   node scripts/set-role.mjs <email> --admin
//   node scripts/set-role.mjs <email> artist --admin
//
// --admin sets the custom claim admin: true. They sign in again before the claim is on their token.
// There is no admin screen in the app. Requires: npm ci --prefix functions
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const usage = `Usage:
  node scripts/set-role.mjs <email> artist
  node scripts/set-role.mjs <email> fan
  node scripts/set-role.mjs <email> --admin
  node scripts/set-role.mjs <email> artist --admin`;

const grantAdmin = process.argv.includes("--admin");
const args = process.argv.slice(2).filter((arg) => arg !== "--admin");
const email = args[0];
const role = args[1];

if (!email || args.length > 2 || (role !== undefined && role !== "fan" && role !== "artist") || (role === undefined && !grantAdmin)) {
  console.error(usage);
  process.exit(1);
}

let requireFromFunctions;
try {
  requireFromFunctions = createRequire(new URL("../functions/package.json", import.meta.url));
  requireFromFunctions.resolve("firebase-admin/app");
} catch {
  console.error("Install function dependencies first: npm ci --prefix functions");
  process.exit(1);
}

const { initializeApp, applicationDefault } = await import(pathToFileURL(requireFromFunctions.resolve("firebase-admin/app")).href);
const { getAuth } = await import(pathToFileURL(requireFromFunctions.resolve("firebase-admin/auth")).href);
const { getFirestore, Timestamp } = await import(pathToFileURL(requireFromFunctions.resolve("firebase-admin/firestore")).href);
const { applyUserRole, RoleError } = await import("../functions/lib/roles.js");

initializeApp({
  credential: applicationDefault(),
  projectId: "new-raz-prod",
  storageBucket: "new-raz-prod.firebasestorage.app",
});

try {
  const result = await applyUserRole({
    db: getFirestore(),
    auth: getAuth(),
    email,
    role,
    grantAdmin,
    now: Date.now(),
    timestampOf: (ms) => Timestamp.fromMillis(ms),
    trustCaller: true,
  });
  const parts = [`${result.email} (${result.uid})`];
  if (result.role) parts.push(`role ${result.role}`);
  if (grantAdmin) parts.push("admin claim granted (sign in again to use it)");
  console.log(parts.join(" — "));
} catch (error) {
  if (error instanceof RoleError) {
    console.error(error.message);
    process.exit(1);
  }
  const message = String(error?.message || error);
  if (message.includes("Could not load the default credentials") || message.includes("default credentials")) {
    console.error("Application Default Credentials are missing. Run: gcloud auth application-default login");
    process.exit(1);
  }
  console.error(message);
  process.exit(1);
}

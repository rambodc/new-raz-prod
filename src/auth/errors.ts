/** Turn Firebase Auth error codes into plain, friendly language. */
const MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "That email and password don't match. Please try again.",
  "auth/invalid-login-credentials": "That email and password don't match. Please try again.",
  "auth/wrong-password": "That email and password don't match. Please try again.",
  "auth/user-not-found": "That email and password don't match. Please try again.",
  "auth/email-already-in-use": "An account with that email already exists. Try signing in instead.",
  "auth/weak-password": "Choose a stronger password with at least 8 characters.",
  "auth/password-does-not-meet-requirements": "That password doesn't meet the security requirements. Try a longer, less common one.",
  "auth/invalid-email": "That email address doesn't look right.",
  "auth/missing-email": "Enter your email address first.",
  "auth/missing-password": "Enter your password.",
  "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again, or reset your password.",
  "auth/network-request-failed": "We can't reach Razzberry right now. Check your connection and try again.",
  "auth/user-disabled": "This account has been disabled. Please contact us if that seems wrong.",
  "auth/operation-not-allowed": "Email sign-in isn't available right now. Please try again later.",
  "auth/requires-recent-login": "For your security, please sign in again to continue.",
  "auth/invalid-api-key": "Sign-in isn't configured for this environment yet.",
  "auth/api-key-not-valid": "Sign-in isn't configured for this environment yet.",
  "auth/configuration-not-found": "Sign-in isn't configured for this environment yet.",
  "auth/internal-error": "Something went wrong on our side. Please try again.",
};

export const GENERIC_AUTH_ERROR = "Something went wrong. Please try again.";

export function authErrorCode(error: unknown): string | undefined {
  if (error && typeof error === "object" && "code" in error && typeof (error as { code: unknown }).code === "string") {
    return (error as { code: string }).code;
  }
  return undefined;
}

export function authErrorMessage(error: unknown): string {
  const code = authErrorCode(error);
  if (code && MESSAGES[code]) return MESSAGES[code];
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return "";
  return GENERIC_AUTH_ERROR;
}

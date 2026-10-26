export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;
export const MAX_NAME_LENGTH = 80;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function validateEmail(value: string): string | undefined {
  const email = normalizeEmail(value);
  if (!email) return "Enter your email address.";
  if (email.length > 254 || !EMAIL_RE.test(email)) return "That email address doesn't look right.";
  return undefined;
}

export function validateName(value: string): string | undefined {
  const name = normalizeName(value);
  if (!name) return "Tell us what to call you.";
  if (name.length > MAX_NAME_LENGTH) return `Keep your name under ${MAX_NAME_LENGTH} characters.`;
  return undefined;
}

export function validateNewPassword(value: string): string | undefined {
  if (!value) return "Choose a password.";
  if (value.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (value.length > MAX_PASSWORD_LENGTH) return `Keep your password under ${MAX_PASSWORD_LENGTH} characters.`;
  return undefined;
}

export function validateConfirm(password: string, confirm: string): string | undefined {
  if (!confirm) return "Type your password again to confirm.";
  if (confirm !== password) return "The passwords don't match.";
  return undefined;
}

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

export function validateSignIn(v: { email: string; password: string }): FieldErrors<"email" | "password"> {
  const errors: FieldErrors<"email" | "password"> = {};
  const email = validateEmail(v.email);
  if (email) errors.email = email;
  if (!v.password) errors.password = "Enter your password.";
  return errors;
}

export function validateSignUp(v: { name: string; email: string; password: string; confirm: string }): FieldErrors<"name" | "email" | "password" | "confirm"> {
  const errors: FieldErrors<"name" | "email" | "password" | "confirm"> = {};
  const name = validateName(v.name);
  const email = validateEmail(v.email);
  const password = validateNewPassword(v.password);
  const confirm = validateConfirm(v.password, v.confirm);
  if (name) errors.name = name;
  if (email) errors.email = email;
  if (password) errors.password = password;
  else if (confirm) errors.confirm = confirm;
  return errors;
}

export function hasErrors(errors: object): boolean {
  return Object.keys(errors).length > 0;
}

/** First name for greetings, falling back to the email's local part. */
export function greetingName(displayName: string | null | undefined, email: string | null | undefined): string {
  const name = normalizeName(displayName ?? "");
  if (name) return name.split(" ")[0];
  const local = (email ?? "").split("@")[0];
  return local || "there";
}

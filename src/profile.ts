export type Role = "fan" | "artist";

export type Profile = {
  firstName: string;
  lastName: string;
  email: string;
  photoURL: string;
  role: Role;
};

export function cleanEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function validEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function cleanName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function validName(value: string): boolean {
  return value.length > 0 && value.length <= 60 && /\S/.test(value);
}

export function readProfile(data: Record<string, unknown> | undefined): Profile | null {
  if (!data) return null;
  if (typeof data.firstName !== "string" || typeof data.lastName !== "string") return null;
  if (typeof data.email !== "string" || typeof data.photoURL !== "string") return null;
  if (data.role !== "fan" && data.role !== "artist") return null;
  return {
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email,
    photoURL: data.photoURL,
    role: data.role,
  };
}

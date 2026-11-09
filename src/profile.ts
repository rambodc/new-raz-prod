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

export function readProfile(data: Record<string, unknown> | undefined): Profile {
  return {
    firstName: typeof data?.firstName === "string" ? data.firstName : "",
    lastName: typeof data?.lastName === "string" ? data.lastName : "",
    email: typeof data?.email === "string" ? data.email : "",
    photoURL: typeof data?.photoURL === "string" ? data.photoURL : "",
    role: data?.role === "artist" ? "artist" : "fan",
  };
}

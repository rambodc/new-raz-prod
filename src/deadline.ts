export const LOAD_LIMIT_MS = 8_000;

/** Rejects if `promise` is still pending after `ms`. A late result is ignored. */
export function deadline<T>(promise: Promise<T>, ms = LOAD_LIMIT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.message === "timeout";
}

/** One attempt, and a single retry if that attempt fails or times out. */
export async function loadWithRetry<T>(load: () => Promise<T>, ms = LOAD_LIMIT_MS): Promise<T> {
  try {
    return await deadline(load(), ms);
  } catch (first) {
    try {
      return await deadline(load(), ms);
    } catch {
      throw first;
    }
  }
}

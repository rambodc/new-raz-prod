const AVATAR_EDGE = 512;
const AVATAR_TARGET = 1_500_000;
const AVATAR_CAP = 1_900_000;

/** Source-image pixels. The artist cropper passes the framed region. */
export type ImageCrop = { x: number; y: number; width: number; height: number };

/** Artist and event photos. Longest edge 1200, JPEG around 0.8, ideally under 300KB. */
export const ARTIST_EVENT_PHOTO = { maxEdge: 1200, maxBytes: 300_000, quality: 0.8 } as const;

/** Longest edge is capped. Smaller photos stay at their own size. */
export function fittedSize(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const longEdge = Math.max(width, height);
  const scale = longEdge > maxEdge ? maxEdge / longEdge : 1;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export async function imageSize(file: File): Promise<{ width: number; height: number }> {
  if (file.size > 15 * 1024 * 1024) throw new Error("That photo is too large.");
  try {
    const bitmap = await createImageBitmap(file);
    try {
      return { width: bitmap.width, height: bitmap.height };
    } finally {
      bitmap.close();
    }
  } catch (error) {
    if (error instanceof Error && error.message === "That photo is too large.") throw error;
    throw new Error("Could not use that photo.");
  }
}

export async function assertPhotoQuality(file: File, minShortEdge: number): Promise<void> {
  const size = await imageSize(file);
  const short = Math.min(size.width, size.height);
  if (short < minShortEdge) {
    throw new Error(`That photo is a bit small (${size.width}×${size.height}). Use one at least ${minShortEdge}px on the short side so it stays sharp.`);
  }
}

export async function resizeImage(file: File, options?: { maxEdge?: number; maxBytes?: number; quality?: number; crop?: ImageCrop }): Promise<Blob> {
  const maxEdge = options?.maxEdge ?? AVATAR_EDGE;
  const target = options?.maxBytes ?? AVATAR_TARGET;
  const compact = target <= 400_000;
  const hardCap = options?.maxBytes ? Math.min(4_700_000, compact ? Math.round(target * 1.5) : Math.round(options.maxBytes * 1.3)) : AVATAR_CAP;
  const startQuality = options?.quality ?? 0.86;
  if (file.size > 15 * 1024 * 1024) throw new Error("That photo is too large.");
  const bitmap = await createImageBitmap(file);
  try {
    const framed = sourceFrame(bitmap.width, bitmap.height, options?.crop);
    const fitted = fittedSize(framed.width, framed.height, maxEdge);
    const width = fitted.width;
    const height = fitted.height;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not use that photo.");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, framed.x, framed.y, framed.width, framed.height, 0, 0, width, height);
    let quality = startQuality;
    const step = startQuality >= 0.89 ? 0.03 : compact ? 0.07 : 0.12;
    const floor = compact ? 0.4 : 0.75;
    let blob: Blob | null = null;
    for (let attempt = 0; attempt < (compact ? 8 : 6); attempt += 1) {
      blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= target) return blob;
      quality = Math.round((quality - step) * 100) / 100;
      if (quality < floor) break;
    }
    if (!blob || blob.size >= hardCap) throw new Error("Could not use that photo.");
    return blob;
  } catch (error) {
    if (error instanceof Error && (error.message === "Could not use that photo." || error.message === "That photo is too large.")) throw error;
    throw new Error("Could not use that photo.");
  } finally {
    bitmap.close();
  }
}

function sourceFrame(width: number, height: number, crop?: ImageCrop): ImageCrop {
  if (!crop || !(crop.width > 1) || !(crop.height > 1)) return { x: 0, y: 0, width, height };
  const x = Math.max(0, Math.min(width - 1, crop.x));
  const y = Math.max(0, Math.min(height - 1, crop.y));
  return {
    x,
    y,
    width: Math.max(1, Math.min(width - x, crop.width)),
    height: Math.max(1, Math.min(height - y, crop.height)),
  };
}

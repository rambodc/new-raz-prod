const AVATAR_EDGE = 512;
const AVATAR_TARGET = 1_500_000;
const AVATAR_CAP = 1_900_000;

export async function resizeImage(file: File, options?: { maxEdge?: number; maxBytes?: number }): Promise<Blob> {
  const maxEdge = options?.maxEdge ?? AVATAR_EDGE;
  const target = options?.maxBytes ?? AVATAR_TARGET;
  const hardCap = maxEdge > AVATAR_EDGE ? 4_800_000 : AVATAR_CAP;
  if (file.size > 15 * 1024 * 1024) throw new Error("That photo is too large.");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not use that photo.");
    context.drawImage(bitmap, 0, 0, width, height);
    let quality = 0.86;
    let blob: Blob | null = null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= target) return blob;
      quality -= 0.12;
      if (quality < 0.4) break;
    }
    if (!blob || blob.size >= hardCap) throw new Error("Could not use that photo.");
    return blob;
  } catch (error) {
    if (error instanceof Error && error.message === "Could not use that photo.") throw error;
    if (error instanceof Error && error.message === "That photo is too large.") throw error;
    throw new Error("Could not use that photo.");
  } finally {
    bitmap.close();
  }
}

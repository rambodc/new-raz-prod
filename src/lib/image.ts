/** Scales a size down to fit inside a square of `max` pixels. Never scales up. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

const MAX_UPLOAD_PIXELS = 1000;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Shrinks a picture to at most 1000 px on its long side and returns it as base64 JPEG (no "data:" prefix). */
export async function resizeToJpegBase64(file: File): Promise<string> {
  if (!ACCEPTED_TYPES.includes(file.type)) throw new Error("Use a JPG, PNG or WebP picture.");
  const bitmap = await createImageBitmap(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_UPLOAD_PIXELS);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't resize pictures.");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const url = canvas.toDataURL("image/jpeg", 0.86);
  return url.slice(url.indexOf(",") + 1);
}

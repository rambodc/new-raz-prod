const MAX_EDGE = 512;
const MAX_BYTES = 1_500_000;

export async function resizeImage(file: File): Promise<Blob> {
  if (file.size > 15 * 1024 * 1024) throw new Error("That photo is too large.");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
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
    for (let attempt = 0; attempt < 3; attempt += 1) {
      blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size < MAX_BYTES) return blob;
      quality -= 0.16;
    }
    if (!blob || blob.size >= 2 * 1024 * 1024) throw new Error("Could not use that photo.");
    return blob;
  } catch (error) {
    if (error instanceof Error && error.message === "Could not use that photo.") throw error;
    if (error instanceof Error && error.message === "That photo is too large.") throw error;
    throw new Error("Could not use that photo.");
  } finally {
    bitmap.close();
  }
}

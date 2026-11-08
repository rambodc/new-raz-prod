import { sniffImage } from "../../functions/lib/imageFile.js";

export type ImageResult = { image: string; mime: string; kind: "ai-edited" | "ai-generated"; model: string };

export async function readPhoto(file: File): Promise<{ blob: Blob; mime: string }> {
  if (file.size <= 0 || file.size > 8_000_000) throw new Error("Use a photo under 8 MB.");
  const header = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  if (!sniffImage(header)) throw new Error("Use a JPEG, PNG, or WebP photo.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Couldn't read that photo.");
  }
  const scale = Math.min(1, 1536 / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close?.();
    throw new Error("Couldn't read that photo.");
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
  if (!blob || blob.size > 4_000_000) throw new Error(blob ? "That photo is too large." : "Couldn't read that photo.");
  return { blob, mime: "image/jpeg" };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === "string" ? reader.result.split(",")[1] : "";
      if (!value) reject(new Error("Couldn't read that photo."));
      else resolve(value);
    };
    reader.onerror = () => reject(new Error("Couldn't read that photo."));
    reader.readAsDataURL(blob);
  });
}

async function postImage(body: Record<string, unknown>, signal: AbortSignal) {
  const response = await fetch("/api/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const data = (await response.json().catch(() => null)) as {
    status?: unknown;
    requestId?: unknown;
    image?: unknown;
    mime?: unknown;
    kind?: unknown;
    model?: unknown;
    message?: unknown;
  } | null;
  if (!response.ok && response.status !== 202) {
    throw new Error(data && typeof data.message === "string" ? data.message : "The image provider didn't answer.");
  }
  return data;
}

function asImage(data: { image?: unknown; mime?: unknown; kind?: unknown; model?: unknown } | null): ImageResult | null {
  if (!data || typeof data.image !== "string") return null;
  if (data.mime !== "image/jpeg" && data.mime !== "image/png" && data.mime !== "image/webp") return null;
  if (data.kind !== "ai-edited" && data.kind !== "ai-generated") return null;
  return { image: data.image, mime: data.mime, kind: data.kind, model: typeof data.model === "string" ? data.model : "" };
}

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

/** One explicit generation or edit. The provider key stays on the server. */
export async function requestImage(input: {
  action: "generate" | "edit";
  prompt: string;
  aspect: "foreground" | "background";
  blob?: Blob;
  signal: AbortSignal;
}): Promise<ImageResult> {
  const body: { action: "generate" | "edit"; prompt: string; aspect: "foreground" | "background"; image?: { data: string } } = {
    action: input.action,
    prompt: input.prompt,
    aspect: input.aspect,
  };
  if (input.action === "edit") {
    if (!input.blob) throw new Error("Choose a photo to edit.");
    body.image = { data: await blobToBase64(input.blob) };
  }
  const started = await postImage(body, input.signal);
  const immediate = asImage(started);
  if (immediate) return immediate;
  if (input.action !== "generate" || started?.status !== "pending" || typeof started.requestId !== "string") {
    throw new Error("The image provider didn't return an image.");
  }
  const requestId = started.requestId;
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const polled = await postImage({ action: "poll", requestId }, input.signal);
    const ready = asImage(polled);
    if (ready) return ready;
    if (polled?.status !== "pending") throw new Error("The image provider didn't return an image.");
    await wait(2500, input.signal);
  }
  throw new Error("The image is still being made. It was not added. Try again if you want another.");
}

export function imageBlob(data: string, mime: string): Blob {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mime });
}

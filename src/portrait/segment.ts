import { FilesetResolver, ImageSegmenter, type ImageSegmenterResult } from "@mediapipe/tasks-vision";
import { applyAlpha, blurAlpha, categoryMaskToAlpha, foregroundRatio, scaleAlpha } from "./mask";

const MAX_EDGE = 1280;
const MIN_PERSON = 0.02;

let segmenterPromise: Promise<ImageSegmenter> | null = null;

function segmenter(): Promise<ImageSegmenter> {
  if (!segmenterPromise) {
    const pending = FilesetResolver.forVisionTasks("/mediapipe").then((fileset) =>
      ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: "/models/selfie_multiclass_256x256.tflite" },
        runningMode: "IMAGE",
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      }),
    );
    segmenterPromise = pending;
    pending.catch(() => {
      segmenterPromise = null;
    });
  }
  return segmenterPromise;
}

/** Cut the person out of a photo in this browser. The photo is not uploaded. */
export async function cutoutFile(file: File): Promise<string> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Use a JPEG, PNG, or WebP photo.");
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    bitmap.close();
    throw new Error("This browser couldn't read the photo.");
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const image = context.getImageData(0, 0, width, height);
  const result: ImageSegmenterResult = (await segmenter()).segment(canvas);
  const mask = result.categoryMask;
  if (!mask) throw new Error("The cutout model didn't return a mask.");
  const categories = mask.getAsUint8Array();
  const maskWidth = mask.width;
  const maskHeight = mask.height;
  mask.close?.();
  const alpha = boxToPhoto(categories, maskWidth, maskHeight, width, height);
  if (foregroundRatio(alpha) < MIN_PERSON) throw new Error("Couldn't find a person in that photo.");
  image.data.set(applyAlpha(image.data, alpha));
  context.putImageData(image, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Couldn't keep the cutout.");
  return URL.createObjectURL(blob);
}

function boxToPhoto(categories: Uint8Array, maskWidth: number, maskHeight: number, width: number, height: number): Uint8ClampedArray {
  const small = categoryMaskToAlpha(categories, maskWidth, maskHeight, 0);
  const fitted = scaleAlpha(small, maskWidth, maskHeight, width, height);
  return blurAlpha(fitted, width, height, 3);
}

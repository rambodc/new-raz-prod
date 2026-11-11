import { readFileSync } from "node:fs";
import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";

const WIDTH = 1200;
const HEIGHT = 630;
const FONT = "Inter Display";
const MARK = readFileSync(new URL("../assets/razzberry-mark.svg", import.meta.url));

let fontReady = false;
let markImage = null;

function ensureFont() {
  if (fontReady) return;
  const file = new URL("../assets/InterDisplay-SemiBold.ttf", import.meta.url);
  GlobalFonts.registerFromPath(file.pathname, FONT);
  fontReady = true;
}

async function raspberry() {
  if (!markImage) markImage = await loadImage(MARK);
  return markImage;
}

function coverRect(sourceWidth, sourceHeight) {
  const scale = Math.max(WIDTH / sourceWidth, HEIGHT / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  const x = (WIDTH - width) / 2;
  const overflow = height - HEIGHT;
  // Tall photos keep more of the top, so a face is not cropped out of the frame.
  const y = overflow > 0 ? -overflow * 0.32 : (HEIGHT - height) / 2;
  return { x, y, width, height };
}

function roundedText(ctx, text, maxWidth) {
  let value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) return "";
  if (ctx.measureText(value).width <= maxWidth) return value;
  while (value.length > 1 && ctx.measureText(`${value}…`).width > maxWidth) value = value.slice(0, -1);
  return `${value.trimEnd()}…`;
}

/**
 * 1200×630 JPEG. The uploaded photo is cover-cropped, then a dark gradient,
 * the name, and the raspberry mark beside the wordmark.
 * A missing photo still produces a branded card.
 */
export async function renderOgCard({ photo, title, subtitle }) {
  ensureFont();
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#14080d";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  if (photo && photo.length) {
    try {
      const image = await loadImage(photo);
      const rect = coverRect(image.width, image.height);
      ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
    } catch {
      // Keep the flat background when the bytes are not a readable image.
    }
  }
  const fade = ctx.createLinearGradient(0, HEIGHT, 0, 0);
  fade.addColorStop(0, "rgba(0, 0, 0, 0.9)");
  fade.addColorStop(0.38, "rgba(0, 0, 0, 0.55)");
  fade.addColorStop(0.62, "rgba(0, 0, 0, 0.18)");
  fade.addColorStop(1, "rgba(0, 0, 0, 0.28)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const mark = await raspberry();
  const markHeight = 52;
  const markWidth = Math.round((mark.width / mark.height) * markHeight);
  ctx.drawImage(mark, 56, 32, markWidth, markHeight);
  ctx.font = `28px "${FONT}"`;
  ctx.fillStyle = "rgba(255, 255, 255, 0.94)";
  ctx.fillText("Razzberry", 56 + markWidth + 14, 66);

  ctx.font = `68px "${FONT}"`;
  ctx.fillStyle = "#ffffff";
  const shown = roundedText(ctx, title || "Razzberry", 1040);
  ctx.fillText(shown, 64, 500);
  if (subtitle) {
    ctx.font = `32px "${FONT}"`;
    ctx.fillStyle = "rgba(255, 255, 255, 0.88)";
    ctx.fillText(roundedText(ctx, subtitle, 1040), 64, 556);
  }
  return canvas.toBuffer("image/jpeg", 90);
}

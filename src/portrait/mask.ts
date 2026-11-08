/** Turn a MediaPipe category mask into a soft alpha matte. Class 0 is the background. */

export function categoryMaskToAlpha(categories: Uint8Array, width: number, height: number, radius = 2): Uint8ClampedArray {
  const alpha = new Uint8ClampedArray(width * height);
  const count = Math.min(categories.length, alpha.length);
  for (let i = 0; i < count; i += 1) alpha[i] = categories[i] === 0 ? 0 : 255;
  return blurAlpha(alpha, width, height, radius);
}

export function foregroundRatio(alpha: Uint8ClampedArray): number {
  if (!alpha.length) return 0;
  let present = 0;
  for (const value of alpha) if (value > 24) present += 1;
  return present / alpha.length;
}

export function scaleAlpha(alpha: Uint8ClampedArray, sourceWidth: number, sourceHeight: number, destWidth: number, destHeight: number): Uint8ClampedArray {
  if (sourceWidth === destWidth && sourceHeight === destHeight) return alpha;
  const out = new Uint8ClampedArray(destWidth * destHeight);
  for (let y = 0; y < destHeight; y += 1) {
    const sy = Math.min(sourceHeight - 1, Math.floor((y * sourceHeight) / destHeight));
    for (let x = 0; x < destWidth; x += 1) {
      const sx = Math.min(sourceWidth - 1, Math.floor((x * sourceWidth) / destWidth));
      out[y * destWidth + x] = alpha[sy * sourceWidth + sx];
    }
  }
  return out;
}

export function applyAlpha(pixels: Uint8ClampedArray, alpha: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels.length);
  const count = Math.min(alpha.length, Math.floor(pixels.length / 4));
  for (let i = 0; i < count; i += 1) {
    const cover = alpha[i] / 255;
    out[i * 4] = pixels[i * 4];
    out[i * 4 + 1] = pixels[i * 4 + 1];
    out[i * 4 + 2] = pixels[i * 4 + 2];
    out[i * 4 + 3] = Math.round(pixels[i * 4 + 3] * cover);
  }
  return out;
}

export function blurAlpha(alpha: Uint8ClampedArray, width: number, height: number, radius: number): Uint8ClampedArray {
  if (radius <= 0) return alpha;
  const horizontal = new Uint8ClampedArray(alpha.length);
  const vertical = new Uint8ClampedArray(alpha.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let total = 0;
      let count = 0;
      for (let dx = -radius; dx <= radius; dx += 1) {
        const nx = x + dx;
        if (nx < 0 || nx >= width) continue;
        total += alpha[y * width + nx];
        count += 1;
      }
      horizontal[y * width + x] = Math.round(total / count);
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let total = 0;
      let count = 0;
      for (let dy = -radius; dy <= radius; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        total += horizontal[ny * width + x];
        count += 1;
      }
      vertical[y * width + x] = Math.round(total / count);
    }
  }
  return vertical;
}

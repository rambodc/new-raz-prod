/** Shared photo checks. Bytes stay in memory for the request. No remote fetch. */

export const IMAGE_FILE_LIMITS = {
  maxBytes: 4_000_000,
  maxEdge: 2048,
};

function u16(bytes, offset) {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function u24le(bytes, offset) {
  return bytes[offset] + (bytes[offset + 1] << 8) + (bytes[offset + 2] << 16);
}

/** @param {Uint8Array} bytes */
export function sniffImage(bytes) {
  if (!bytes || bytes.length < 12) return "";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  return "";
}

function jpegSize(bytes) {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    const length = u16(bytes, offset + 2);
    if (length < 2) return null;
    if (marker >= 0xc0 && marker <= 0xc2) {
      return { width: u16(bytes, offset + 7), height: u16(bytes, offset + 5) };
    }
    offset += 2 + length;
  }
  return null;
}

function pngSize(bytes) {
  if (bytes.length < 24 || String.fromCharCode(...bytes.slice(12, 16)) !== "IHDR") return null;
  const width = ((bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]) >>> 0;
  const height = ((bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]) >>> 0;
  return { width, height };
}

function webpSize(bytes) {
  if (bytes.length < 30) return null;
  const tag = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  if (tag === "VP8X") return { width: 1 + u24le(bytes, 24), height: 1 + u24le(bytes, 27) };
  if (tag === "VP8L" && bytes[20] === 0x2f) {
    const b0 = bytes[21];
    const b1 = bytes[22];
    const b2 = bytes[23];
    const b3 = bytes[24];
    return {
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
    };
  }
  return null;
}

/** @param {Uint8Array} bytes @param {string} mime */
export function imageBounds(bytes, mime) {
  if (mime === "image/png") return pngSize(bytes);
  if (mime === "image/jpeg") return jpegSize(bytes);
  if (mime === "image/webp") return webpSize(bytes);
  return null;
}

/** @param {Uint8Array} bytes */
export function inspectImage(bytes, limits = IMAGE_FILE_LIMITS) {
  const mime = sniffImage(bytes);
  if (!mime) return { error: "Use a JPEG, PNG, or WebP photo." };
  if (bytes.length > limits.maxBytes) return { error: "That photo is too large." };
  const bounds = imageBounds(bytes, mime);
  if (!bounds || bounds.width < 1 || bounds.height < 1) return { error: "Couldn't read that photo's size." };
  if (bounds.width > limits.maxEdge || bounds.height > limits.maxEdge) return { error: `Use a photo up to ${limits.maxEdge} pixels on a side.` };
  return { mime, width: bounds.width, height: bounds.height };
}

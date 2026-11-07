#!/usr/bin/env python3
"""Classify a simulator screenshot. This is a color check, not proof of a physical device."""
import struct
import sys
import zlib
from pathlib import Path


def read_rgb(path: str) -> tuple[int, int, list[tuple[int, int, int]]]:
    data = Path(path).read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise SystemExit("Not a PNG")
    pos = 8
    width = height = None
    color = 2
    compressed = b""
    while pos + 8 <= len(data):
        length = struct.unpack(">I", data[pos : pos + 4])[0]
        kind = data[pos + 4 : pos + 8]
        chunk = data[pos + 8 : pos + 8 + length]
        pos += 12 + length
        if kind == b"IHDR":
            width, height, bit, color = struct.unpack(">IIBB", chunk[:10])
            if bit != 8 or color not in (2, 6):
                raise SystemExit(f"Unsupported PNG {bit=} {color=}")
        elif kind == b"IDAT":
            compressed += chunk
        elif kind == b"IEND":
            break
    if width is None or height is None:
        raise SystemExit("PNG has no header")
    raw = zlib.decompress(compressed)
    channels = 3 if color == 2 else 4
    stride = width * channels
    pixels: list[tuple[int, int, int]] = []
    index = 0
    for _ in range(height):
        index += 1  # filter byte
        row = raw[index : index + stride]
        index += stride
        for x in range(width):
            i = x * channels
            pixels.append((row[i], row[i + 1], row[i + 2]))
    return width, height, pixels


def saturated(pixel: tuple[int, int, int]) -> bool:
    red, green, blue = pixel
    spread = max(red, green, blue) - min(red, green, blue)
    return max(red, green, blue) > 40 and spread > 25


def upper_fraction(width: int, height: int, pixels: list[tuple[int, int, int]]) -> float:
    cutoff = int(height * 0.6)
    sample = [pixels[y * width + x] for y in range(cutoff) for x in range(width)]
    if not sample:
        return 0
    return sum(1 for pixel in sample if saturated(pixel)) / len(sample)


def main() -> None:
    if len(sys.argv) == 2 and sys.argv[1] == "--self-test":
        self_test()
        return
    if len(sys.argv) != 2:
        raise SystemExit("usage: webgl_frame.py screenshot.png")
    width, height, pixels = read_rgb(sys.argv[1])
    fraction = upper_fraction(width, height, pixels)
    # A blank launch screen is near-black. The sign-in sculpture puts saturated color in the top.
    print(f"visual-frame {width}x{height} upper-saturated={fraction:.4f}")
    if fraction < 0.01:
        raise SystemExit("Screenshot upper area has almost no color. Visual check failed.")


def write_png(path: Path, width: int, height: int, paint) -> None:
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        for x in range(width):
            raw.extend(paint(x, y))
    compressed = zlib.compress(bytes(raw))

    def chunk(tag: bytes, payload: bytes) -> bytes:
        return struct.pack(">I", len(payload)) + tag + payload + struct.pack(">I", zlib.crc32(tag + payload) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", compressed) + chunk(b"IEND", b""))


def self_test() -> None:
    blank = Path("/tmp/razz-blank.png")
    color = Path("/tmp/razz-color.png")
    write_png(blank, 20, 20, lambda _x, _y: (7, 6, 10))
    write_png(color, 20, 20, lambda x, y: (220, 30, 90) if y < 8 else (7, 6, 10))
    if upper_fraction(*read_rgb(str(blank))) >= 0.01:
        raise SystemExit("blank fixture was classified as colored")
    if upper_fraction(*read_rgb(str(color))) < 0.01:
        raise SystemExit("colored fixture was classified as blank")
    print("webgl frame self-test ok")


if __name__ == "__main__":
    main()

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { ImageCrop } from "./resizeImage";

/** Saved artist photo. Phone and desktop both cover-crop this frame. */
export const ARTIST_FRAME = 9 / 16;
export const PHONE_FRAME = 390 / 844;
export const DESKTOP_FRAME = 3 / 4;

export function coverScale(naturalW: number, naturalH: number, frameW: number, frameH: number): number {
  if (naturalW <= 0 || naturalH <= 0 || frameW <= 0 || frameH <= 0) return 1;
  return Math.max(frameW / naturalW, frameH / naturalH);
}

export function centeredOffset(naturalW: number, naturalH: number, frameW: number, frameH: number, zoom: number): { x: number; y: number } {
  const scale = coverScale(naturalW, naturalH, frameW, frameH) * zoom;
  return { x: (frameW - naturalW * scale) / 2, y: (frameH - naturalH * scale) / 2 };
}

export function clampOffset(offset: number, natural: number, frame: number, scale: number): number {
  const min = frame - natural * scale;
  return Math.min(0, Math.max(min, offset));
}

export function cropFromView(naturalW: number, naturalH: number, frameW: number, frameH: number, zoom: number, offsetX: number, offsetY: number): ImageCrop {
  const scale = coverScale(naturalW, naturalH, frameW, frameH) * Math.max(zoom, 1);
  const x = clampOffset(offsetX, naturalW, frameW, scale);
  const y = clampOffset(offsetY, naturalH, frameH, scale);
  const width = Math.min(frameW / scale, naturalW);
  const height = Math.min(frameH / scale, naturalH);
  return {
    x: Math.max(0, Math.min(naturalW - width, -x / scale)),
    y: Math.max(0, Math.min(naturalH - height, -y / scale)),
    width,
    height,
  };
}

/** Box of a guide inside the saved frame, in percentages. */
export function guideBox(frameAspect: number, target: number): { top: string; left: string; width: string; height: string } {
  if (target <= frameAspect) {
    const width = (target / frameAspect) * 100;
    return { top: "0%", left: `${(100 - width) / 2}%`, width: `${width}%`, height: "100%" };
  }
  const height = (frameAspect / target) * 100;
  return { top: `${(100 - height) / 2}%`, left: "0%", width: "100%", height: `${height}%` };
}

function zoomCap(naturalW: number, naturalH: number): number {
  const short = Math.min(naturalW, naturalH);
  if (short <= 0) return 1;
  return Math.max(1, Math.min(3, short / 900));
}

export function CropPhoto({ file, busy, onCrop }: { file: File; busy: boolean; onCrop: (crop: ImageCrop | null) => void }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const onCropRef = useRef(onCrop);
  onCropRef.current = onCrop;
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const framed = useRef("");
  const [url, setUrl] = useState("");
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [frame, setFrame] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    setZoom(1);
    setNatural({ w: 0, h: 0 });
    framed.current = "";
    return () => URL.revokeObjectURL(next);
  }, [file]);

  useEffect(() => {
    if (!url) return;
    frameRef.current?.scrollIntoView({ block: "center", behavior: "auto" });
  }, [url]);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setFrame({ w: rect.width, h: rect.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [url]);

  useEffect(() => {
    if (!natural.w || !frame.w) {
      onCropRef.current(null);
      return;
    }
    onCropRef.current(cropFromView(natural.w, natural.h, frame.w, frame.h, zoom, offset.x, offset.y));
  }, [natural, frame, zoom, offset]);

  useEffect(() => {
    if (!natural.w || !frame.w) return;
    const key = `${natural.w}x${natural.h}`;
    const scale = coverScale(natural.w, natural.h, frame.w, frame.h) * zoom;
    if (framed.current !== key) {
      framed.current = key;
      setOffset(centeredOffset(natural.w, natural.h, frame.w, frame.h, zoom));
      return;
    }
    setOffset((current) => ({
      x: clampOffset(current.x, natural.w, frame.w, scale),
      y: clampOffset(current.y, natural.h, frame.h, scale),
    }));
  }, [natural.w, natural.h, frame.w, frame.h, zoom]);

  const cap = zoomCap(natural.w, natural.h);
  const scale = natural.w && frame.w ? coverScale(natural.w, natural.h, frame.w, frame.h) * zoom : 1;

  function move(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current || busy) return;
    const scaleNow = coverScale(natural.w, natural.h, frame.w, frame.h) * zoom;
    setOffset({
      x: clampOffset(drag.current.ox + (event.clientX - drag.current.x), natural.w, frame.w, scaleNow),
      y: clampOffset(drag.current.oy + (event.clientY - drag.current.y), natural.h, frame.h, scaleNow),
    });
  }

  return (
    <div className="crop">
      <div
        ref={frameRef}
        className="crop-frame"
        onPointerDown={(event) => {
          if (busy || !natural.w) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
        }}
        onPointerMove={move}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        {url ? (
          <img
            src={url}
            alt=""
            draggable={false}
            onLoad={(event) => {
              const img = event.currentTarget;
              setNatural({ w: img.naturalWidth, h: img.naturalHeight });
              setOffset(centeredOffset(img.naturalWidth, img.naturalHeight, frame.w || img.naturalWidth, frame.h || img.naturalHeight, 1));
            }}
            style={natural.w ? { width: natural.w * scale, height: natural.h * scale, left: offset.x, top: offset.y } : undefined}
          />
        ) : null}
        <div className="crop-guide is-desktop" style={guideBox(ARTIST_FRAME, DESKTOP_FRAME)}>
          <span>Desktop</span>
        </div>
        <div className="crop-guide is-phone" style={guideBox(ARTIST_FRAME, PHONE_FRAME)}>
          <span>Phone</span>
        </div>
      </div>
      <label className="crop-zoom">
        <span>Zoom</span>
        <input
          type="range"
          min={1}
          max={cap}
          step={0.01}
          value={Math.min(zoom, cap)}
          disabled={busy || cap <= 1}
          aria-label="Zoom"
          onChange={(event) => setZoom(Number(event.target.value))}
        />
      </label>
      <p className="photo-hint">Drag to frame the photo. Phone and desktop each use the area inside their line. The rest is cropped.</p>
    </div>
  );
}

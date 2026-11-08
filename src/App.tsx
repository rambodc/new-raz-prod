import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { ChatError, sendSceneChat } from "./chat/client";
import { chatLayer, shellFrame, stickToLatest, type ShellFrame } from "./chat/keyboard";
import { cutoutFile } from "./portrait/segment";
import { loadScene, mergeScene, saveScene } from "./scene/schema";
import type { Scene } from "./scene/types";
import "./styles.css";

const BLOBS = [
  { x: "18%", y: "22%" },
  { x: "78%", y: "16%" },
  { x: "48%", y: "38%" },
  { x: "12%", y: "62%" },
  { x: "82%", y: "58%" },
  { x: "30%", y: "78%" },
  { x: "64%", y: "74%" },
];

type Turn = { role: "user" | "assistant" | "error"; content: string };

const closedFrame = (): ShellFrame => shellFrame({ innerHeight: window.innerHeight, viewportHeight: window.innerHeight, offsetTop: 0 });

export default function App() {
  const [scene, setScene] = useState<Scene>(loadScene);
  const [portrait, setPortrait] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [cutting, setCutting] = useState(false);
  const [photoNote, setPhotoNote] = useState("");
  const [focused, setFocused] = useState(false);
  const [frame, setFrame] = useState<ShellFrame>(closedFrame);
  const [width, setWidth] = useState(() => window.innerWidth);
  const fileRef = useRef<HTMLInputElement>(null);
  const portraitRef = useRef<string | null>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  useEffect(() => {
    const apply = () => {
      const viewport = window.visualViewport;
      setWidth(window.innerWidth);
      setFrame(
        shellFrame({
          innerHeight: window.innerHeight,
          viewportHeight: viewport?.height ?? window.innerHeight,
          offsetTop: viewport?.offsetTop ?? 0,
        }),
      );
      if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
    };
    apply();
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", apply);
    viewport?.addEventListener("scroll", apply);
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    return () => {
      viewport?.removeEventListener("resize", apply);
      viewport?.removeEventListener("scroll", apply);
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
    };
  }, []);

  useEffect(() => {
    saveScene(scene);
  }, [scene]);

  useEffect(
    () => () => {
      if (portraitRef.current) URL.revokeObjectURL(portraitRef.current);
    },
    [],
  );

  const chatting = chatLayer(focused, frame.keyboard > 80, width);
  const style = useMemo(() => sceneStyle(scene, frame), [scene, frame]);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el || !stickRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [turns, busy, chatting, draft]);

  function onTranscriptScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    stickRef.current = stickToLatest(el.scrollTop, el.scrollHeight, el.clientHeight);
  }

  function fitField(el: HTMLTextAreaElement) {
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
  }

  async function onPhoto(file: File | undefined) {
    if (!file || cutting) return;
    setCutting(true);
    setPhotoNote("Removing the background in this browser. The photo is not uploaded.");
    try {
      const url = await cutoutFile(file);
      if (portraitRef.current) URL.revokeObjectURL(portraitRef.current);
      portraitRef.current = url;
      setPortrait(url);
      setPhotoNote("");
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : "Couldn't use that photo.";
      console.error(message);
      setPhotoNote(message);
    } finally {
      setCutting(false);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || busy) return;
    const history = [...turns.filter((turn) => turn.role !== "error"), { role: "user" as const, content }];
    stickRef.current = true;
    setTurns(history);
    setDraft("");
    if (fieldRef.current) fieldRef.current.style.height = "";
    setBusy(true);
    try {
      const result = await sendSceneChat(
        history.map((turn) => ({ role: turn.role as "user" | "assistant", content: turn.content })),
        scene,
      );
      setScene((current) => mergeScene(current, result.scene));
      setTurns((current) => [...current, { role: "assistant", content: result.reply || "…" }]);
    } catch (error) {
      const message = error instanceof ChatError ? error.message : "Chat didn't answer.";
      setTurns((current) => [...current, { role: "error", content: message }]);
    } finally {
      setBusy(false);
    }
  }

  const transcript = [...turns, ...(busy ? [{ role: "assistant" as const, content: "…" }] : [])];

  return (
    <main className={chatting ? "stage chat" : "stage"} style={style}>
      <div className="warmth" />
      <div className="cool" />
      {BLOBS.slice(0, scene.shapes.count).map((blob, index) => (
        <span key={blob.x + blob.y} className="blob" style={{ left: blob.x, top: blob.y, animationDelay: `${index * -3}s` }} />
      ))}
      <div className="vignette" />
      <div className="frame">
        <header className="top">
          <p className="mark">Razzberry</p>
          <button type="button" className="photo" onClick={() => fileRef.current?.click()} disabled={cutting}>
            {cutting ? "Working" : "Photo"}
          </button>
          <input
            ref={fileRef}
            className="file"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Add a photo. The person is cut out in this browser and the photo is not uploaded."
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              void onPhoto(file);
            }}
          />
        </header>
        <div className="middle">
          <div className="world">
            {portrait ? <img className="cutout" src={portrait} alt="" /> : null}
            <div className="copy">
              {scene.name ? <h1>{scene.name}</h1> : null}
              {scene.line ? <p>{scene.line}</p> : null}
            </div>
          </div>
          <div ref={scrollerRef} className="transcript" role="log" aria-relevant="additions" onScroll={onTranscriptScroll}>
            {transcript.map((turn, index) => (
              <p key={`${turn.role}-${index}`} className={`msg ${turn.role}`}>
                {turn.content}
              </p>
            ))}
          </div>
        </div>
        {photoNote ? <p className="photo-note">{photoNote}</p> : null}
        <form className="composer" onSubmit={onSubmit}>
          <label className="status" htmlFor="ask">
            Message
          </label>
          <textarea
            ref={fieldRef}
            id="ask"
            rows={1}
            value={draft}
            placeholder="What would you like to create?"
            maxLength={500}
            enterKeyHint="enter"
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onChange={(event) => {
              setDraft(event.target.value);
              fitField(event.target);
            }}
          />
          <button type="submit" className="send" aria-label={busy ? "Sending" : "Send"} disabled={busy || !draft.trim()}>
            {busy ? "…" : "↑"}
          </button>
        </form>
      </div>
    </main>
  );
}

function sceneStyle(scene: Scene, frame: ShellFrame): CSSProperties {
  const softness = 28 + scene.shapes.softness * 70;
  const drift = 36 - scene.shapes.drift * 20;
  return {
    "--base": scene.colors.base,
    "--glow": scene.colors.glow,
    "--deep": scene.colors.deep,
    "--warmth": String(scene.light.warmth),
    "--intensity": String(scene.light.intensity),
    "--softness": `${softness}px`,
    "--drift": `${drift}s`,
    "--portrait-x": `${scene.portrait.x * 10}%`,
    "--portrait-y": `${scene.portrait.y * 8}%`,
    "--portrait-scale": String(scene.portrait.scale),
    top: frame.top,
    height: frame.height,
  } as CSSProperties;
}

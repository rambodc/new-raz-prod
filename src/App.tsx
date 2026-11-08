import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { ChatError, sendSceneChat } from "./chat/client";
import { keyboardInset, keyboardOpen } from "./chat/keyboard";
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

type Turn = { role: "user" | "assistant"; content: string };

export default function App() {
  const [scene, setScene] = useState<Scene>(loadScene);
  const [portrait, setPortrait] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [cutting, setCutting] = useState(false);
  const [notice, setNotice] = useState("");
  const [failed, setFailed] = useState(false);
  const [inset, setInset] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const portraitRef = useRef<string | null>(null);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const apply = () => setInset(keyboardInset(window.innerHeight, viewport.height, viewport.offsetTop));
    apply();
    viewport.addEventListener("resize", apply);
    viewport.addEventListener("scroll", apply);
    return () => {
      viewport.removeEventListener("resize", apply);
      viewport.removeEventListener("scroll", apply);
    };
  }, []);

  useEffect(() => {
    saveScene(scene);
  }, [scene]);

  useEffect(() => () => {
    if (portraitRef.current) URL.revokeObjectURL(portraitRef.current);
  }, []);

  const style = useMemo(() => sceneStyle(scene, inset), [scene, inset]);
  const open = keyboardOpen(inset);

  async function onPhoto(file: File | undefined) {
    if (!file || cutting) return;
    setCutting(true);
    setFailed(false);
    setNotice("Loading the cutout model, then removing the background in this browser. The photo is not uploaded.");
    try {
      const url = await cutoutFile(file);
      if (portraitRef.current) URL.revokeObjectURL(portraitRef.current);
      portraitRef.current = url;
      setPortrait(url);
      setNotice("");
    } catch (error) {
      setFailed(true);
      const message = error instanceof Error && error.message ? error.message : "Couldn't use that photo.";
      console.error(message);
      setNotice(message);
    } finally {
      setCutting(false);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || busy) return;
    const history = [...turns, { role: "user" as const, content }];
    setTurns(history);
    setDraft("");
    setBusy(true);
    setFailed(false);
    setNotice("");
    try {
      const result = await sendSceneChat(history, scene);
      setScene((current) => mergeScene(current, result.scene));
      setTurns((current) => [...current, { role: "assistant", content: result.reply }]);
      if (result.reply) setNotice(result.reply);
    } catch (error) {
      setFailed(true);
      setNotice(error instanceof ChatError ? error.message : "Chat didn't answer.");
      setTurns(turns);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={open ? "stage keyboard-open" : "stage"} style={style}>
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
        <div className="world">
          {portrait ? <img className="cutout" src={portrait} alt="" /> : null}
        </div>
        <div className="copy">
          {scene.name ? <h1>{scene.name}</h1> : null}
          {scene.line ? <p>{scene.line}</p> : null}
        </div>
        <p className={failed ? "reply error" : "reply"} role="status">
          {notice}
        </p>
        <form className="composer" onSubmit={onSubmit}>
          <label className="status" htmlFor="ask">
            Message
          </label>
          <input
            id="ask"
            value={draft}
            placeholder="What would you like to create?"
            enterKeyHint="send"
            maxLength={500}
            disabled={busy}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button type="submit" className="send" aria-label="Send" disabled={busy || !draft.trim()}>
            ↑
          </button>
        </form>
      </div>
    </main>
  );
}

function sceneStyle(scene: Scene, inset: number): CSSProperties {
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
    "--keyboard": `${inset}px`,
    "--portrait-x": `${scene.portrait.x * 10}%`,
    "--portrait-y": `${scene.portrait.y * 8}%`,
    "--portrait-scale": String(scene.portrait.scale),
  } as CSSProperties;
}

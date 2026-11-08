import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from "react";
import { ChatError, sendSceneChat } from "./chat/client";
import { CardView } from "./chat/CardView";
import { acceptSubmit, chatLayer, composingKey, enterInsertsLine, layoutWidth, shellFrame, stickToLatest, type ShellFrame } from "./chat/keyboard";
import { EMPTY_DRAFT, answerChoice, appendAssistant, decideApproval, submitForm, type Card, type Draft, type TranscriptItem } from "./chat/flow";
import { cutoutFile } from "./portrait/segment";
import { RoomPreview } from "./preview/RoomPreview";
import { loadScene, mergeScene, saveScene } from "./scene/schema";
import type { Scene } from "./scene/types";
import "./styles.css";

const STARTER: Card = {
  type: "choice",
  id: "start",
  status: "pending",
  prompt: "What should we shape?",
  options: [
    { id: "room", label: "The room" },
    { id: "artist", label: "The artist" },
    { id: "night", label: "The night" },
  ],
};

const closedFrame = (): ShellFrame => shellFrame({ innerHeight: window.innerHeight, viewportHeight: window.innerHeight, offsetTop: 0 });

export default function App() {
  const [scene, setScene] = useState<Scene>(loadScene);
  const [draft, setDraftState] = useState<Draft>(EMPTY_DRAFT);
  const [items, setItems] = useState<TranscriptItem[]>([{ kind: "card", card: STARTER }]);
  const [portrait, setPortrait] = useState<string | null>(null);
  const [composer, setComposer] = useState("");
  const [busy, setBusy] = useState(false);
  const [cutting, setCutting] = useState(false);
  const [photoNote, setPhotoNote] = useState("");
  const [focused, setFocused] = useState(false);
  const [preview, setPreview] = useState(false);
  const [frame, setFrame] = useState<ShellFrame>(closedFrame);
  const [width, setWidth] = useState(() => layoutWidth(window.innerWidth, document.documentElement.clientWidth));
  const fileRef = useRef<HTMLInputElement>(null);
  const portraitRef = useRef<string | null>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const sendFromButton = useRef(false);
  const stickRef = useRef(true);
  const sceneRef = useRef(scene);
  const draftRef = useRef(draft);
  sceneRef.current = scene;
  draftRef.current = draft;

  useEffect(() => {
    const apply = () => {
      const viewport = window.visualViewport;
      setWidth(layoutWidth(window.innerWidth, document.documentElement.clientWidth));
      setFrame(shellFrame({ innerHeight: window.innerHeight, viewportHeight: viewport?.height ?? window.innerHeight, offsetTop: viewport?.offsetTop ?? 0 }));
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
  const style = useMemo(() => ({ top: frame.top, height: frame.height }) as CSSProperties, [frame]);

  useLayoutEffect(() => {
    const el = logRef.current;
    if (!el || !stickRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [items, busy, chatting, composer]);

  function onLogScroll() {
    const el = logRef.current;
    if (!el) return;
    stickRef.current = stickToLatest(el.scrollTop, el.scrollHeight, el.clientHeight);
  }

  function fitField(el: HTMLTextAreaElement) {
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
  }

  async function continueFrom(nextItems: TranscriptItem[]) {
    setItems(nextItems);
    setBusy(true);
    stickRef.current = true;
    try {
      const messages = nextItems.flatMap((item) => (item.kind === "text" && item.role !== "error" ? [{ role: item.role, content: item.text }] : []));
      const result = await sendSceneChat(messages, sceneRef.current, draftRef.current);
      setItems((current) => appendAssistant(current, result.reply, result.card));
      if (result.card?.type !== "approval" && Object.keys(result.scene).length) setScene((current) => mergeScene(current, result.scene));
    } catch (error) {
      const message = error instanceof ChatError ? error.message : "Chat didn't answer.";
      setItems((current) => [...current, { kind: "text", role: "error", text: message }]);
    } finally {
      setBusy(false);
    }
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
      setPreview(true);
    } catch (error) {
      setPhotoNote(error instanceof Error && error.message ? error.message : "Couldn't use that photo.");
    } finally {
      setCutting(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fromButton = sendFromButton.current;
    sendFromButton.current = false;
    if (!acceptSubmit(fromButton)) return;
    const text = composer.trim();
    if (!text || busy) return;
    setComposer("");
    if (fieldRef.current) fieldRef.current.style.height = "";
    void continueFrom([...items, { kind: "text", role: "user", text }]);
  }

  function onChoice(cardId: string, optionId: string) {
    if (busy) return;
    const result = answerChoice(items, cardId, optionId);
    if ("error" in result) return;
    void continueFrom(result.items);
  }

  function onForm(cardId: string, values: Record<string, string>) {
    const result = submitForm(items, cardId, values, draft);
    if ("error" in result) return result.errors ?? { form: result.error };
    setDraftState(result.draft);
    void continueFrom(result.items);
    return null;
  }

  function onApproval(cardId: string, accept: boolean) {
    const result = decideApproval(items, cardId, accept, scene, draft);
    if ("error" in result) return;
    setItems(result.items);
    if (result.changed) {
      setScene(result.scene);
      setDraftState(result.draft);
      setPreview(true);
    }
  }

  function onFieldKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const composing = composingKey(event.nativeEvent.isComposing, event.keyCode);
    if (!enterInsertsLine(event.key, composing)) return;
  }

  return (
    <main className={chatting ? "workspace chat" : "workspace"} style={style}>
      <header className="top">
        <p className="mark">Razzberry</p>
        <div className="top-actions">
          <button type="button" className="ghost" onClick={() => setPreview((open) => !open)}>
            {preview ? "Chat" : "Preview"}
          </button>
          <button type="button" className="ghost" onClick={() => fileRef.current?.click()} disabled={cutting}>
            {cutting ? "Working" : "Photo"}
          </button>
        </div>
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
      <div className="body">
        <section className="conversation" aria-label="Conversation">
          <div ref={logRef} className="log" role="log" aria-relevant="additions" onScroll={onLogScroll}>
            {items.map((item, index) =>
              item.kind === "text" ? (
                <p key={`${item.role}-${index}`} className={`bubble ${item.role}`}>
                  {item.text}
                </p>
              ) : (
                <CardView key={item.card.id} item={item} onChoice={onChoice} onForm={onForm} onApproval={onApproval} />
              ),
            )}
            {busy ? <p className="bubble assistant">…</p> : null}
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
              value={composer}
              placeholder="Ask, or answer in your own words"
              maxLength={500}
              enterKeyHint="enter"
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={onFieldKeyDown}
              onChange={(event) => {
                setComposer(event.target.value);
                fitField(event.target);
              }}
            />
            <button
              type="submit"
              className="send"
              aria-label={busy ? "Sending" : "Send"}
              disabled={busy || !composer.trim()}
              onClick={() => {
                sendFromButton.current = true;
              }}
            >
              {busy ? "…" : "↑"}
            </button>
          </form>
        </section>
        <aside className={preview ? "preview is-open" : "preview"}>
          <RoomPreview scene={scene} draft={draft} portrait={portrait} />
        </aside>
      </div>
    </main>
  );
}

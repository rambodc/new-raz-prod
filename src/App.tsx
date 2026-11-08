import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from "react";
import { ChatError, sendSceneChat } from "./chat/client";
import { CardView } from "./chat/CardView";
import { acceptSubmit, chatLayer, composingKey, enterInsertsLine, layoutWidth, shellFrame, stickToLatest, type ShellFrame } from "./chat/keyboard";
import { EMPTY_DRAFT, answerChoice, appendAssistant, decideApproval, submitForm, type Card, type Draft, type TranscriptItem } from "./chat/flow";
import { EventPageView } from "./event/EventPage";
import { localTurn } from "./event/turn";
import type { EventPage } from "./event/types";
import { answerGuestQuestion, restoreEvent } from "../functions/lib/event.js";
import { cutoutFile } from "./portrait/segment";
import { loadScene, mergeScene, saveScene } from "./scene/schema";
import type { Scene } from "./scene/types";
import "./styles.css";

const EVENT_KEY = "razzberry-event-session";

const STARTER: Card = {
  type: "choice",
  id: "start",
  status: "pending",
  prompt: "What should we shape?",
  options: [
    { id: "event", label: "The event" },
    { id: "guests", label: "Guests" },
    { id: "look", label: "The look" },
  ],
};

function loadHeld(): { event: EventPage; draft: Draft } {
  try {
    const raw = sessionStorage.getItem(EVENT_KEY);
    if (!raw) return { event: restoreEvent(null), draft: EMPTY_DRAFT };
    const parsed = JSON.parse(raw) as { event?: unknown; draft?: Partial<Draft> };
    const draft = { ...EMPTY_DRAFT };
    (Object.keys(EMPTY_DRAFT) as (keyof Draft)[]).forEach((key) => {
      const value = parsed.draft?.[key];
      if (typeof value === "string") draft[key] = value.slice(0, 200);
    });
    return { event: restoreEvent(parsed.event), draft };
  } catch {
    return { event: restoreEvent(null), draft: EMPTY_DRAFT };
  }
}

const closedFrame = (): ShellFrame => shellFrame({ innerHeight: window.innerHeight, viewportHeight: window.innerHeight, offsetTop: 0 });

export default function App() {
  const [scene, setScene] = useState<Scene>(loadScene);
  const [event, setEvent] = useState<EventPage>(() => loadHeld().event);
  const [draft, setDraftState] = useState<Draft>(() => loadHeld().draft);
  const [rateNote, setRateNote] = useState("");
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
  const eventRef = useRef(event);
  sceneRef.current = scene;
  draftRef.current = draft;
  eventRef.current = event;

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

  useEffect(() => {
    try {
      sessionStorage.setItem(EVENT_KEY, JSON.stringify({ event, draft }));
    } catch {
      // The event still lives in memory for this page.
    }
  }, [event, draft]);

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
    stickRef.current = true;
    const last = [...nextItems].reverse().find((item) => item.kind === "text" && item.role === "user");
    const text = last && last.kind === "text" ? last.text : "";
    const local = localTurn(eventRef.current, text, nextItems.length);
    if (local) {
      setItems(appendAssistant(nextItems, local.reply, local.card));
      return;
    }
    setBusy(true);
    try {
      const messages = nextItems.flatMap((item) => (item.kind === "text" && item.role !== "error" ? [{ role: item.role, content: item.text }] : []));
      const result = await sendSceneChat(messages, sceneRef.current, draftRef.current, {
        event: eventRef.current,
        guestFacts: answerGuestQuestion(eventRef.current, "guests") || "",
      });
      setRateNote("");
      setItems((current) => appendAssistant(current, result.reply, result.card));
      if (result.card?.type !== "approval" && Object.keys(result.scene).length) setScene((current) => mergeScene(current, result.scene));
    } catch (error) {
      const message = error instanceof ChatError ? error.message : "Chat didn't answer.";
      if (error instanceof ChatError && error.code === "rate-limited") {
        setRateNote(message);
        setComposer((current) => current || text);
      }
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
    if (result.skipModel) {
      setItems(result.items);
      return null;
    }
    void continueFrom(result.items);
    return null;
  }

  function onApproval(cardId: string, accept: boolean) {
    const result = decideApproval(items, cardId, accept, scene, draft, event);
    if ("error" in result) return;
    setItems(result.items);
    if (result.changed) {
      setScene(result.scene);
      setDraftState(result.draft);
      setEvent(result.event);
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
            {preview ? "Chat" : "Event"}
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
          {rateNote ? <p className="limit-note">{rateNote}</p> : null}
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
          <EventPageView event={event} scene={scene} portrait={portrait} />
        </aside>
      </div>
    </main>
  );
}

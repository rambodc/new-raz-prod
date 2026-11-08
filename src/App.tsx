import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ChatError, sendSceneChat, sendWebSearch } from "./chat/client";
import { Composer } from "./chat/Composer";
import { answerChoice, appendAssistant, decideApproval, EMPTY_DRAFT, submitForm, type Card, type Draft, type TranscriptItem } from "./chat/flow";
import { shellFrame, stickToLatest, type ShellFrame } from "./chat/keyboard";
import { searchRequest } from "./chat/search";
import { Transcript } from "./chat/Transcript";
import { EventCard } from "./event/EventCard";
import { EventPageView } from "./event/EventPage";
import { localTurn } from "./event/turn";
import type { EventPage } from "./event/types";
import { answerGuestQuestion, restoreEvent } from "../functions/lib/event.js";
import { imageBlob, readPhoto, requestImage } from "./image/client";
import type { HeldImage } from "./image/held";
import { cutoutFile } from "./portrait/segment";
import { loadScene, mergeScene, saveScene } from "./scene/schema";
import type { Scene } from "./scene/types";
import "./styles.css";

const EVENT_KEY = "razzberry-event-session";
type Surface = "main" | "event" | "page";
type ImageSpec = { kind: "image"; action: "generate" | "edit"; prompt: string; aspect: "foreground" | "background"; sourceId: string | null };
type SearchSpec = { kind: "search"; surface: "main" | "page"; query: string };
type Spec = ImageSpec | SearchSpec;
type Job = { surface: "main" | "page"; label: string; retry: Spec | null };
type Failure = { surface: "main" | "page"; message: string; retry: Spec };

const PAGE_STARTER: Card = {
  type: "choice",
  id: "page-start",
  status: "pending",
  prompt: "What should we change on this page?",
  options: [
    { id: "event", label: "The event" },
    { id: "look", label: "The look" },
  ],
};

const PAGE_INTRO = "This chat edits only this page. Accept a proposal before the title or details change. Edit image sends a photo to the image provider. Cut out stays on this device.";

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

function isAbort(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

const closedFrame = (): ShellFrame => shellFrame({ innerHeight: window.innerHeight, viewportHeight: window.visualViewport?.height ?? window.innerHeight, offsetTop: window.visualViewport?.offsetTop ?? 0 });

export default function App() {
  const held = useMemo(loadHeld, []);
  const [scene, setScene] = useState<Scene>(loadScene);
  const [event, setEvent] = useState<EventPage>(held.event);
  const [draft, setDraft] = useState<Draft>(held.draft);
  const [surface, setSurface] = useState<Surface>("main");
  const [mainItems, setMainItems] = useState<TranscriptItem[]>([
    { kind: "text", role: "assistant", text: "This is the main conversation. Open the event to edit that page. Search the public web from here and the answer comes back with sources." },
  ]);
  const [pageItems, setPageItems] = useState<TranscriptItem[]>([
    { kind: "text", role: "assistant", text: PAGE_INTRO },
    { kind: "card", card: PAGE_STARTER },
  ]);
  const [images, setImages] = useState<HeldImage[]>([]);
  const [foregroundId, setForegroundId] = useState<string | null>(null);
  const [backgroundId, setBackgroundId] = useState<string | null>(null);
  const [editSourceId, setEditSourceId] = useState<string | null>(null);
  const [mainText, setMainText] = useState("");
  const [pageText, setPageText] = useState("");
  const [pending, setPending] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [frame, setFrame] = useState<ShellFrame>(closedFrame);
  const bytesRef = useRef(new Map<string, Blob>());
  const serial = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const cutoutToken = useRef<object | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const eventRef = useRef<HTMLDivElement | null>(null);
  const scrolls = useRef({ main: 0, event: 0, page: 0 });
  const stick = useRef({ main: true, page: true });
  const surfaceRef = useRef(surface);
  const sceneRef = useRef(scene);
  const draftRef = useRef(draft);
  const eventStateRef = useRef(event);
  const fileRef = useRef<HTMLInputElement>(null);
  surfaceRef.current = surface;
  sceneRef.current = scene;
  draftRef.current = draft;
  eventStateRef.current = event;

  const foreground = images.find((image) => image.id === foregroundId) ?? null;
  const background = images.find((image) => image.id === backgroundId) ?? null;
  const editSource = images.find((image) => image.id === editSourceId) ?? null;
  const locked = pending || job !== null;

  useEffect(() => {
    const apply = () => {
      const viewport = window.visualViewport;
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
      // The page text still lives in memory for this tab.
    }
  }, [event, draft]);

  const imagesRef = useRef(images);
  imagesRef.current = images;

  useEffect(() => () => {
    imagesRef.current.forEach((image) => URL.revokeObjectURL(image.url));
  }, []);

  const seenSurface = useRef(surface);
  useLayoutEffect(() => {
    const el = surface === "event" ? eventRef.current : scrollerRef.current;
    if (!el) return;
    if (seenSurface.current !== surface) {
      seenSurface.current = surface;
      el.scrollTop = scrolls.current[surface];
      return;
    }
    if (surface !== "event" && stick.current[surface]) el.scrollTop = el.scrollHeight;
  }, [surface, mainItems, pageItems, pending, job]);

  function onScroll() {
    const el = surfaceRef.current === "event" ? eventRef.current : scrollerRef.current;
    if (!el) return;
    scrolls.current[surfaceRef.current] = el.scrollTop;
    if (surfaceRef.current === "main" || surfaceRef.current === "page") {
      stick.current[surfaceRef.current] = stickToLatest(el.scrollTop, el.scrollHeight, el.clientHeight);
    }
  }

  function show(next: Surface) {
    const el = surfaceRef.current === "event" ? eventRef.current : scrollerRef.current;
    if (el) scrolls.current[surfaceRef.current] = el.scrollTop;
    setSurface(next);
  }

  function hold(blob: Blob, meta: Omit<HeldImage, "id" | "url">) {
    serial.current += 1;
    const image: HeldImage = { id: `img-${serial.current}`, url: URL.createObjectURL(blob), ...meta };
    bytesRef.current.set(image.id, blob);
    setImages((current) => [...current, image]);
    return image;
  }

  function addPage(items: TranscriptItem[]) {
    stick.current.page = true;
    setPageItems((current) => [...current, ...items]);
  }

  function addMain(items: TranscriptItem[]) {
    stick.current.main = true;
    setMainItems((current) => [...current, ...items]);
  }

  async function runSearch(spec: SearchSpec) {
    const controller = new AbortController();
    abortRef.current = controller;
    setFailure(null);
    setJob({ surface: spec.surface, label: "Searching the public web…", retry: spec });
    const add = spec.surface === "main" ? addMain : addPage;
    try {
      const result = await sendWebSearch(spec.query, controller.signal);
      if (controller.signal.aborted) return;
      add([
        { kind: "text", role: "assistant", text: result.reply },
        { kind: "sources", sources: result.sources },
      ]);
    } catch (error) {
      if (controller.signal.aborted || isAbort(error)) {
        add([{ kind: "text", role: "assistant", text: "Canceled. Nothing was changed." }]);
        return;
      }
      const message = error instanceof ChatError ? error.message : "Web search didn't answer.";
      setFailure({ surface: spec.surface, message, retry: spec });
      add([{ kind: "text", role: "error", text: message }]);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setJob(null);
    }
  }

  async function runImage(spec: ImageSpec) {
    const controller = new AbortController();
    abortRef.current = controller;
    setFailure(null);
    setJob({
      surface: "page",
      label: spec.action === "edit" ? "Editing your photo… This sends the photo to the image provider." : "Creating a new image…",
      retry: spec,
    });
    try {
      const blob = spec.sourceId ? bytesRef.current.get(spec.sourceId) : undefined;
      if (spec.action === "edit" && !blob) throw new Error("That photo is no longer in this tab.");
      const result = await requestImage({ action: spec.action, prompt: spec.prompt, aspect: spec.aspect, blob, signal: controller.signal });
      if (controller.signal.aborted) return;
      const image = hold(imageBlob(result.image, result.mime), {
        mime: result.mime,
        kind: result.kind,
        sourceId: spec.sourceId,
        prompt: spec.prompt,
        label: result.kind === "ai-edited" ? "AI-edited" : "AI-generated",
      });
      addPage([
        { kind: "image", imageId: image.id },
        {
          kind: "text",
          role: "assistant",
          text: result.kind === "ai-edited"
            ? "AI-edited preview. The original photo is unchanged. The page changes only if you choose foreground or background."
            : "New image preview. The page changes only if you choose foreground or background.",
        },
      ]);
      setPageText("");
    } catch (error) {
      if (controller.signal.aborted || isAbort(error)) {
        addPage([{ kind: "text", role: "assistant", text: "Canceled. Nothing was changed." }]);
        return;
      }
      const message = error instanceof Error && error.message ? error.message : "The image provider didn't answer.";
      setFailure({ surface: "page", message, retry: spec });
      addPage([{ kind: "text", role: "error", text: message }]);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setJob(null);
    }
  }

  function cancelJob() {
    abortRef.current?.abort();
    cutoutToken.current = null;
  }

  function onMainSend() {
    const text = mainText.trim();
    if (!text || locked) return;
    setMainText("");
    const names = eventStateRef.current.guests.map((guest) => guest.name);
    const search = searchRequest(text, names);
    addMain([{ kind: "text", role: "user", text }]);
    if (search && "error" in search) {
      addMain([{ kind: "text", role: "error", text: search.error }]);
      return;
    }
    if (search && "query" in search) {
      void runSearch({ kind: "search", surface: "main", query: search.query });
      return;
    }
    addMain([{ kind: "text", role: "assistant", text: "Open the event to change the page. From here, start a message with “Search the web for” and a public question." }]);
  }

  async function onPageSend() {
    const text = pageText.trim();
    if (!text || locked) return;
    setPageText("");
    const names = eventStateRef.current.guests.map((guest) => guest.name);
    const search = searchRequest(text, names);
    const base = [...pageItems, { kind: "text" as const, role: "user" as const, text }];
    stick.current.page = true;
    setPageItems(base);
    if (search && "error" in search) {
      setPageItems([...base, { kind: "text", role: "error", text: search.error }]);
      return;
    }
    if (search && "query" in search) {
      await runSearch({ kind: "search", surface: "page", query: search.query });
      return;
    }
    const local = localTurn(eventStateRef.current, text, base.length);
    if (local) {
      setPageItems(appendAssistant(base, local.reply, local.card));
      return;
    }
    setPending(true);
    try {
      const messages = base.flatMap((item) => (item.kind === "text" && item.role !== "error" ? [{ role: item.role, content: item.text }] : []));
      const result = await sendSceneChat(messages, sceneRef.current, draftRef.current, {
        event: eventStateRef.current,
        guestFacts: answerGuestQuestion(eventStateRef.current, "guests") || "",
      });
      setPageItems((current) => appendAssistant(current, result.reply, result.card));
      if (result.card?.type !== "approval" && Object.keys(result.scene).length) setScene((current) => mergeScene(current, result.scene));
    } catch (error) {
      const message = error instanceof ChatError ? error.message : "Chat didn't answer.";
      setPageItems((current) => [...current, { kind: "text", role: "error", text: message }]);
    } finally {
      setPending(false);
    }
  }

  async function onAttach(file: File | undefined) {
    if (!file || locked) return;
    try {
      const photo = await readPhoto(file);
      const image = hold(photo.blob, { mime: photo.mime, kind: "original", sourceId: null, prompt: "", label: "Your photo" });
      setEditSourceId(image.id);
      addPage([{ kind: "image", imageId: image.id }]);
    } catch (error) {
      addPage([{ kind: "text", role: "error", text: error instanceof Error && error.message ? error.message : "Couldn't use that photo." }]);
    }
  }

  function onNewImage() {
    const prompt = pageText.trim();
    if (!prompt || locked) return;
    if (searchRequest(prompt, eventStateRef.current.guests.map((guest) => guest.name))) {
      addPage([{ kind: "text", role: "error", text: "New image uses those words as a picture prompt. Start with “Search the web for” and press Send to search." }]);
      return;
    }
    void runImage({ kind: "image", action: "generate", prompt, aspect: "background", sourceId: null });
  }

  function onEditImage() {
    const prompt = pageText.trim();
    if (!prompt || !editSourceId || locked) return;
    void runImage({ kind: "image", action: "edit", prompt, aspect: "foreground", sourceId: editSourceId });
  }

  async function onCutout(imageId: string) {
    if (locked) return;
    const blob = bytesRef.current.get(imageId);
    if (!blob) return;
    const token = {};
    cutoutToken.current = token;
    setJob({ surface: "page", label: "Cutting out the person on this device. The photo is not uploaded.", retry: null });
    try {
      const file = new File([blob], "photo.jpg", { type: blob.type || "image/jpeg" });
      const url = await cutoutFile(file);
      if (cutoutToken.current !== token) {
        URL.revokeObjectURL(url);
        addPage([{ kind: "text", role: "assistant", text: "Canceled. Nothing was changed." }]);
        return;
      }
      const cut = await fetch(url).then((response) => response.blob());
      URL.revokeObjectURL(url);
      const image = hold(cut, { mime: "image/png", kind: "cutout", sourceId: imageId, prompt: "", label: "Cut out on this device" });
      addPage([{ kind: "image", imageId: image.id }]);
    } catch (error) {
      addPage([{ kind: "text", role: "error", text: error instanceof Error && error.message ? error.message : "Couldn't cut out that photo." }]);
    } finally {
      if (cutoutToken.current === token) cutoutToken.current = null;
      setJob(null);
    }
  }

  function onUse(imageId: string, slot: "foreground" | "background") {
    if (!images.some((image) => image.id === imageId)) return;
    if (slot === "foreground") setForegroundId(imageId);
    else setBackgroundId(imageId);
    addPage([{ kind: "text", role: "assistant", text: slot === "foreground" ? "Foreground updated. Other photos are unchanged." : "Background updated. Other photos are unchanged." }]);
  }

  function onChoice(cardId: string, optionId: string) {
    if (locked) return;
    const result = answerChoice(pageItems, cardId, optionId);
    if ("error" in result) return;
    const local = localTurn(eventStateRef.current, result.text, result.items.length);
    setPageItems(local ? appendAssistant(result.items, local.reply, local.card) : result.items);
  }

  function onForm(cardId: string, values: Record<string, string>) {
    const result = submitForm(pageItems, cardId, values, draft);
    if ("error" in result) return result.errors ?? { form: result.error };
    setDraft(result.draft);
    setPageItems(result.items);
    return null;
  }

  function onApproval(cardId: string, accept: boolean) {
    const result = decideApproval(pageItems, cardId, accept, scene, draft, event);
    if ("error" in result) return;
    setPageItems(result.items);
    if (result.changed) {
      setScene(result.scene);
      setDraft(result.draft);
      setEvent(result.event);
    }
  }

  function retry(spec: Spec) {
    if (spec.kind === "search") void runSearch(spec);
    else void runImage(spec);
  }

  const style = { top: frame.top, height: frame.height } as CSSProperties;
  const status = (which: "main" | "page") => (
    <>
      {job?.surface === which ? (
        <p className="job" role="status">
          {job.label}
          <button type="button" onClick={cancelJob}>
            Cancel
          </button>
        </p>
      ) : null}
      {failure?.surface === which && !job ? (
        <p className="job error">
          {failure.message}
          <button type="button" onClick={() => retry(failure.retry)}>
            Retry
          </button>
        </p>
      ) : null}
    </>
  );

  return (
    <main className={frame.height < 700 ? "workspace is-short" : "workspace"} style={style} data-surface={surface}>
      {surface === "main" ? (
        <section className="surface" aria-label="Main conversation">
          <header className="bar">
            <p className="mark">Razzberry</p>
          </header>
          <Transcript
            items={mainItems}
            images={images}
            scrollerRef={scrollerRef}
            onScroll={onScroll}
            busy={false}
            leading={
              <>
                <EventCard event={event} scene={scene} photo={foreground?.url ?? null} onOpen={() => show("event")} />
                <button type="button" className="text-prompt" onClick={() => setMainText("Search the web for ")}>
                  Search the web for…
                </button>
              </>
            }
            onChoice={() => undefined}
            onForm={() => null}
            onApproval={() => undefined}
            onUse={onUse}
            onCutout={(id) => void onCutout(id)}
            onRegenerate={() => undefined}
            onEditImage={setEditSourceId}
          />
          {status("main")}
          <Composer id="ask" value={mainText} placeholder="Search the web for a public question" busy={locked} onChange={setMainText} onSend={onMainSend} />
        </section>
      ) : null}
      {surface === "event" ? (
        <EventPageView
          event={event}
          scene={scene}
          foreground={foreground}
          background={background}
          scrollerRef={eventRef}
          onScroll={onScroll}
          onBack={() => show("main")}
          onChat={() => show("page")}
          onClearForeground={() => setForegroundId(null)}
          onClearBackground={() => setBackgroundId(null)}
        />
      ) : null}
      {surface === "page" ? (
        <section className="surface" aria-label="Page chat">
          <header className="bar">
            <button type="button" onClick={() => show("event")} autoFocus aria-label="Back to the event page">
              Back
            </button>
            <p>This page</p>
          </header>
          <p className="scope-note">AI edit uploads the chosen photo. A cutout does not.</p>
          <Transcript
            items={pageItems}
            images={images}
            scrollerRef={scrollerRef}
            onScroll={onScroll}
            busy={pending}
            onChoice={onChoice}
            onForm={onForm}
            onApproval={onApproval}
            onUse={onUse}
            onCutout={(id) => void onCutout(id)}
            onRegenerate={(id) => {
              const image = images.find((entry) => entry.id === id);
              if (!image?.prompt || locked) return;
              void runImage({
                kind: "image",
                action: image.kind === "ai-generated" ? "generate" : "edit",
                prompt: image.prompt,
                aspect: image.kind === "ai-generated" ? "background" : "foreground",
                sourceId: image.kind === "ai-generated" ? null : image.sourceId,
              });
            }}
            onEditImage={(id) => {
              setEditSourceId(id);
              addPage([{ kind: "text", role: "assistant", text: "Write the change, then press Edit image. That sends this photo to the image provider." }]);
            }}
          />
          {status("page")}
          <Composer
            id="ask"
            value={pageText}
            placeholder="Title, details, or an image"
            busy={locked}
            onChange={setPageText}
            onSend={() => void onPageSend()}
            note={editSource ? <p className="attach-chip">Editing {editSource.label}. Edit image sends this photo to the image provider. <button type="button" onClick={() => setEditSourceId(null)}>Clear</button></p> : null}
            attach={
              <>
                <button type="button" className="attach" disabled={locked} onClick={() => fileRef.current?.click()}>
                  Attach
                </button>
                <input
                  ref={fileRef}
                  className="file"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  aria-label="Attach a photo"
                  onChange={(change) => {
                    const file = change.target.files?.[0];
                    change.target.value = "";
                    void onAttach(file);
                  }}
                />
              </>
            }
            actions={
              <div className="image-actions">
                <button type="button" disabled={locked || !pageText.trim()} onClick={onNewImage}>
                  New image
                </button>
                <button type="button" disabled={locked || !pageText.trim() || !editSource} onClick={onEditImage}>
                  Edit image
                </button>
              </div>
            }
          />
        </section>
      ) : null}
    </main>
  );
}

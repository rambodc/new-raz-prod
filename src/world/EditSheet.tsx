import { useEffect, useRef, type FormEvent } from "react";
import type { DemoState } from "./demoModel";
import { THEMES } from "./theme";

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Local artist edit preview. It never opens the microphone or sends the line anywhere. */
export default function EditSheet({
  state,
  onLine,
  onVoice,
  onInsert,
  onPreview,
  onApprove,
  onCancel,
}: {
  state: DemoState;
  onLine: (line: string) => void;
  onVoice: (on: boolean) => void;
  onInsert: () => void;
  onPreview: () => void;
  onApprove: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const previously = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const items = () => [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1);
    items()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const list = items();
      if (list.length === 0) return;
      const first = list[0]!;
      const last = list[list.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previously?.focus();
    };
  }, []);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    onPreview();
  }

  const staged = state.stagedThemeId ? THEMES[state.stagedThemeId] : null;

  return (
    <div ref={ref} className="world-edit" role="dialog" aria-modal="true" aria-labelledby="edit-title" aria-describedby="edit-note">
      <form onSubmit={onSubmit}>
        <div className="world-edit-copy">
          <h2 id="edit-title">Edit preview</h2>
          <p id="edit-note">Stays on this device. Nothing is saved or sent.</p>
        </div>
        <div className="world-voice">
          <button type="button" className="world-voice-btn" aria-pressed={state.voicePreview} aria-describedby="voice-note" onClick={() => onVoice(!state.voicePreview)}>
            <span className="world-mic" aria-hidden="true" />
            Voice mode
          </button>
          <p id="voice-note" className="world-voice-note">
            Visual preview only. Razzberry is not listening and no microphone is used.
          </p>
          {state.voicePreview && (
            <div className="world-voice-sample">
              <div className="world-wave" aria-hidden="true">
                {Array.from({ length: 7 }, (_, i) => (
                  <span key={i} style={{ animationDelay: `${i * 0.08}s` }} />
                ))}
              </div>
              <button type="button" className="world-text-btn" onClick={onInsert}>
                Insert sample phrase
              </button>
            </div>
          )}
        </div>
        <label className="world-line">
          <span>Event line</span>
          <input
            name="event-line"
            value={state.line}
            onChange={(event) => onLine(event.target.value)}
            maxLength={80}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="done"
            placeholder="Create Friday's event"
          />
        </label>
        <div className="world-edit-actions">
          <button type="submit" className="btn btn-ghost">
            Preview
          </button>
          <button type="button" className="btn btn-primary" onClick={onApprove}>
            Approve
          </button>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
        {staged && (
          <p className="world-edit-status" role="status">
            Previewing {staged.name}. It is not applied until you approve, and it is not saved to Razzberry.
          </p>
        )}
      </form>
    </div>
  );
}

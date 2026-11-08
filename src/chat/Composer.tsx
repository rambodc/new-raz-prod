import { useRef, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { acceptSubmit, composingKey, enterInsertsLine } from "./keyboard";

export function Composer({
  id,
  value,
  placeholder,
  busy,
  onChange,
  onSend,
  note,
  attach,
  actions,
}: {
  id: string;
  value: string;
  placeholder: string;
  busy: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
  note?: ReactNode;
  attach?: ReactNode;
  actions?: ReactNode;
}) {
  const sendFromButton = useRef(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fromButton = sendFromButton.current;
    sendFromButton.current = false;
    if (!acceptSubmit(fromButton)) return;
    onSend();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const composing = composingKey(event.nativeEvent.isComposing, event.keyCode);
    if (!enterInsertsLine(event.key, composing)) return;
  }

  return (
    <form className="composer" onSubmit={onSubmit}>
      {note}
      <div className="composer-row">
        {attach}
        <label className="status" htmlFor={id}>
          Message
        </label>
        <textarea
          id={id}
          rows={1}
          value={value}
          placeholder={placeholder}
          maxLength={500}
          enterKeyHint="enter"
          disabled={busy}
          onKeyDown={onKeyDown}
          onChange={(event) => {
            onChange(event.target.value);
            const field = event.target;
            field.style.height = "0px";
            field.style.height = `${Math.min(field.scrollHeight, 112)}px`;
          }}
        />
        <button
          type="submit"
          className="send"
          aria-label={busy ? "Sending" : "Send"}
          disabled={busy || !value.trim()}
          onClick={() => {
            sendFromButton.current = true;
          }}
        >
          {busy ? "…" : "↑"}
        </button>
      </div>
      {actions}
    </form>
  );
}

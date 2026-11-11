import { useEffect, useState } from "react";

export function ShareButton({ title, text, path, label }: { title: string; text: string; path: string; label: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function share() {
    const url = new URL(path, window.location.origin).href;
    const payload = { title, text, url };
    if (typeof navigator.share === "function") {
      try {
        await navigator.share(payload);
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const input = document.createElement("textarea");
      input.value = url;
      input.setAttribute("readonly", "true");
      input.style.position = "fixed";
      input.style.left = "-9999px";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
    setCopied(true);
  }

  return (
    <>
      <button type="button" className="share-btn" aria-label={label} onClick={() => void share()}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="6" cy="12" r="2.2" />
          <circle cx="17" cy="7" r="2.2" />
          <circle cx="17" cy="17" r="2.2" />
          <path d="M8 11.2 14.8 8.2M8 12.8l6.8 3" />
        </svg>
      </button>
      {copied ? (
        <span className="toast" role="status">
          Link copied
        </span>
      ) : null}
    </>
  );
}

import { useEffect, useState } from "react";

export function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 15.5V4.5" />
      <path d="m7.8 8.2 4.2-4.2 4.2 4.2" />
      <path d="M8 10.5H6.8A2.3 2.3 0 0 0 4.5 12.8v6.4A2.3 2.3 0 0 0 6.8 21.5h10.4a2.3 2.3 0 0 0 2.3-2.3v-6.4a2.3 2.3 0 0 0-2.3-2.3H16" />
    </svg>
  );
}

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
        <ShareIcon />
      </button>
      {copied ? (
        <span className="toast" role="status">
          Link copied
        </span>
      ) : null}
    </>
  );
}

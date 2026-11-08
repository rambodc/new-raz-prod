import type { ReactNode, Ref } from "react";
import { CardView } from "./CardView";
import type { HeldImage } from "../image/held";
import type { TranscriptItem } from "./flow";

export function Transcript({
  items,
  images,
  scrollerRef,
  onScroll,
  busy,
  leading,
  onChoice,
  onForm,
  onApproval,
  onUse,
  onCutout,
  onRegenerate,
  onEditImage,
}: {
  items: TranscriptItem[];
  images: HeldImage[];
  scrollerRef: Ref<HTMLDivElement>;
  onScroll: () => void;
  busy: boolean;
  leading?: ReactNode;
  onChoice: (cardId: string, optionId: string) => void;
  onForm: (cardId: string, values: Record<string, string>) => Record<string, string> | null;
  onApproval: (cardId: string, accept: boolean) => void;
  onUse: (imageId: string, slot: "foreground" | "background") => void;
  onCutout: (imageId: string) => void;
  onRegenerate: (imageId: string) => void;
  onEditImage: (imageId: string) => void;
}) {
  return (
    <div ref={scrollerRef} className="log" role="log" aria-relevant="additions" onScroll={onScroll}>
      {leading}
      {items.map((item, index) => {
        if (item.kind === "text") {
          return (
            <p key={`${item.role}-${index}`} className={`bubble ${item.role}`}>
              {item.text}
            </p>
          );
        }
        if (item.kind === "card") return <CardView key={item.card.id} item={item} onChoice={onChoice} onForm={onForm} onApproval={onApproval} />;
        if (item.kind === "sources") {
          return (
            <ul key={`sources-${index}`} className="source-list">
              {item.sources.map((source) => (
                <li key={source.url}>
                  <a href={source.url} target="_blank" rel="noopener noreferrer">
                    {source.title}
                  </a>
                  <span>{source.host}</span>
                </li>
              ))}
            </ul>
          );
        }
        const image = images.find((entry) => entry.id === item.imageId);
        if (!image) {
          return (
            <p key={item.imageId} className="bubble assistant">
              That photo was cleared with this tab.
            </p>
          );
        }
        return (
          <article key={image.id} className="image-card" data-image-kind={image.kind}>
            <img src={image.url} alt={image.label} />
            <p className="card-kicker">{image.label}</p>
            <p className="card-note">
              {image.kind === "original"
                ? "Not uploaded yet. Edit image sends it to the image provider. Cut out stays on this device."
                : image.kind === "cutout"
                  ? "Made on this device from the photo above. The original is unchanged."
                  : image.kind === "ai-edited"
                    ? "AI-edited preview. This can change how a person looks. The original photo is still here."
                    : "AI-generated preview. The page does not change until you use it."}
            </p>
            <div className="image-actions">
              <button type="button" disabled={busy} onClick={() => onUse(image.id, "foreground")}>
                Foreground
              </button>
              <button type="button" disabled={busy} onClick={() => onUse(image.id, "background")}>
                Background
              </button>
              {image.kind !== "cutout" ? (
                <button type="button" disabled={busy} onClick={() => onCutout(image.id)}>
                  Cut out here
                </button>
              ) : null}
              {image.prompt ? (
                <button type="button" disabled={busy} onClick={() => onRegenerate(image.id)}>
                  Regenerate
                </button>
              ) : null}
              <button type="button" disabled={busy} onClick={() => onEditImage(image.id)}>
                Edit this
              </button>
            </div>
          </article>
        );
      })}
      {busy ? <p className="bubble assistant">…</p> : null}
    </div>
  );
}

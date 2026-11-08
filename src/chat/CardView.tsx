import { useState } from "react";
import { DRAFT_FIELDS } from "../../functions/lib/cards.js";
import type { Draft, TranscriptItem } from "./flow";

const STATUS_LABEL: Record<string, string> = {
  answered: "Answered",
  submitted: "Submitted",
  applied: "Applied in this session",
  rejected: "Not applied",
  superseded: "Replaced",
};

export function CardView({
  item,
  onChoice,
  onForm,
  onApproval,
}: {
  item: Extract<TranscriptItem, { kind: "card" }>;
  onChoice: (cardId: string, optionId: string) => void;
  onForm: (cardId: string, values: Record<string, string>) => Record<string, string> | null;
  onApproval: (cardId: string, accept: boolean) => void;
}) {
  const card = item.card;
  const closed = card.status !== "pending";
  return (
    <article className={`card ${closed ? "is-closed" : ""}`} aria-disabled={closed}>
      <p className="card-kicker">{card.type === "approval" ? "Proposal" : card.type === "form" ? "Session draft" : "Question"}</p>
      <h2>{card.prompt}</h2>
      {card.type === "choice" ? (
        <div className="options">
          {card.options.map((option) => (
            <button key={option.id} type="button" disabled={closed} onClick={() => onChoice(card.id, option.id)}>
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
      {card.type === "form" ? <DraftForm cardId={card.id} fields={card.fields} closed={closed} onForm={onForm} /> : null}
      {card.type === "approval" ? (
        <div className="proposal">
          <ProposalSummary scene={card.proposal.scene} draft={card.proposal.draft} />
          <p className="card-note">Accept changes this browser session only. Nothing is published or saved.</p>
          <div className="decision">
            <button type="button" className="primary" disabled={closed} onClick={() => onApproval(card.id, true)}>
              Accept
            </button>
            <button type="button" disabled={closed} onClick={() => onApproval(card.id, false)}>
              Not now
            </button>
          </div>
        </div>
      ) : null}
      {closed ? <p className="card-status">{card.status === "answered" && "answer" in card && card.answer ? `Answered: ${card.answer}` : STATUS_LABEL[card.status]}</p> : null}
    </article>
  );
}

function DraftForm({
  cardId,
  fields,
  closed,
  onForm,
}: {
  cardId: string;
  fields: string[];
  closed: boolean;
  onForm: (cardId: string, values: Record<string, string>) => Record<string, string> | null;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  return (
    <form
      className="draft-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (closed) return;
        const next = onForm(cardId, values);
        setErrors(next ?? {});
      }}
    >
      {fields.map((key) => {
        const spec = DRAFT_FIELDS[key as keyof typeof DRAFT_FIELDS];
        if (!spec) return null;
        const long = key === "details";
        return (
          <label key={key}>
            {spec.label}
            {long ? (
              <textarea maxLength={spec.max} value={values[key] ?? ""} disabled={closed} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} />
            ) : (
              <input maxLength={spec.max} value={values[key] ?? ""} disabled={closed} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} />
            )}
            {errors[key] ? <span>{errors[key]}</span> : null}
          </label>
        );
      })}
      <button type="submit" className="primary" disabled={closed}>
        Use these details
      </button>
    </form>
  );
}

function ProposalSummary({ scene, draft }: { scene: { colors?: { glow?: string; base?: string; deep?: string }; name?: string; line?: string }; draft: Partial<Draft> }) {
  const colors = [scene.colors?.deep, scene.colors?.base, scene.colors?.glow].filter(Boolean) as string[];
  const notes = (Object.keys(DRAFT_FIELDS) as (keyof Draft)[]).filter((key) => draft[key]);
  return (
    <div className="proposal-body">
      {colors.length ? (
        <p className="swatches" aria-label="Proposed colors">
          {colors.map((color) => (
            <span key={color} style={{ background: color }} />
          ))}
        </p>
      ) : null}
      {scene.name ? <p>{scene.name}</p> : null}
      {scene.line ? <p>{scene.line}</p> : null}
      {notes.map((key) => (
        <p key={key}>
          {DRAFT_FIELDS[key].label}: {draft[key]}
        </p>
      ))}
    </div>
  );
}

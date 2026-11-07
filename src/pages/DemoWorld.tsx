import { useReducer, useState } from "react";
import { Link } from "react-router-dom";
import { RaspberryMark, Wordmark } from "../components/RaspberryMark";
import EditSheet from "../world/EditSheet";
import {
  activeTheme,
  approveEdit,
  cancelEdit,
  confirmHere,
  createDemo,
  enterEvent,
  hereLabel,
  insertSamplePhrase,
  leaveEvent,
  openEdit,
  previewEdit,
  setLine,
  setVoicePreview,
  toggleFollow,
  type DemoState,
} from "../world/demoModel";
import WorldStage, { Anchored, PortalButton, WorldDock, WorldHeader } from "../world/WorldStage";

type Action =
  | { type: "follow" }
  | { type: "enter" }
  | { type: "leave" }
  | { type: "here" }
  | { type: "edit" }
  | { type: "cancel" }
  | { type: "line"; line: string }
  | { type: "voice"; on: boolean }
  | { type: "phrase" }
  | { type: "preview" }
  | { type: "approve" };

function reducer(state: DemoState, action: Action): DemoState {
  switch (action.type) {
    case "follow":
      return toggleFollow(state);
    case "enter":
      return enterEvent(state);
    case "leave":
      return leaveEvent(state);
    case "here":
      return confirmHere(state);
    case "edit":
      return openEdit(state);
    case "cancel":
      return cancelEdit(state);
    case "line":
      return setLine(state, action.line);
    case "voice":
      return setVoicePreview(state, action.on);
    case "phrase":
      return insertSamplePhrase(state);
    case "preview":
      return previewEdit(state);
    case "approve":
      return approveEdit(state);
  }
}

/** Fictional NOVA room. Every control stays on this device — nothing is written to Razzberry. */
export default function DemoWorld() {
  const [state, dispatch] = useReducer(reducer, undefined, createDemo);
  const [notice, setNotice] = useState("Sample artist world for NOVA. Counts marked sample are not live attendance.");
  const theme = activeTheme(state);
  const inside = state.place === "event";
  const detail = state.editing ? `${state.eventTitle} · ${state.eventWhen}` : hereLabel(state);

  return (
    <WorldStage
      stage={inside ? "event" : "artist"}
      theme={theme}
      portalStyle={state.editing ? "draft" : "live"}
      description="Sample 3D world for the fictional artist NOVA. Nothing here is saved, and the count is not live attendance."
    >
      <WorldHeader
        start={
          inside ? (
            <button type="button" className="world-back" onClick={() => dispatch({ type: "leave" })}>
              ← Back
            </button>
          ) : (
            <Link to="/signin" className="brand" aria-label="Razzberry, back to sign in">
              <RaspberryMark className="brand-mark" />
              <Wordmark className="brand-word" />
            </Link>
          )
        }
        end={
          <>
            <span className="world-sample">Sample</span>
            {!inside && !state.editing && (
              <button type="button" className="world-text-btn" onClick={() => dispatch({ type: "edit" })}>
                Edit
              </button>
            )}
          </>
        }
      />
      <p className="sr-only" aria-live="polite">
        {notice}
      </p>
      {inside ? (
        <div className="world-banner">
          <h1>
            NOVA / {state.eventTitle}
          </h1>
          <p>{detail}</p>
        </div>
      ) : (
        <>
          <Anchored name="sign" className="world-sign-block">
            <h1 className="world-sign is-short">NOVA</h1>
          </Anchored>
          <Anchored name="portalLabel" className="world-portal-label">
            <p className="world-kicker">{state.editing ? "Draft" : state.eventTitle}</p>
            <p className="world-detail">{detail}</p>
          </Anchored>
          <PortalButton
            label={`Enter ${state.eventTitle}`}
            onClick={() => {
              dispatch({ type: "enter" });
              setNotice(`Inside ${state.eventTitle}. This is a sample event. ${hereLabel(state)} is not live attendance.`);
            }}
          />
        </>
      )}
      {inside && (
        <Anchored name="here" className="world-here">
          <button
            type="button"
            className="world-here-btn"
            disabled={state.present}
            onClick={() => {
              dispatch({ type: "here" });
              setNotice("Sample confirmation only. Your location was not used, and this is not a real visit.");
            }}
          >
            I'm here
          </button>
          {state.present && (
            <p className="world-here-status" role="status">
              Sample only. Counted on this device — your location was not used and this is not a real visit.
            </p>
          )}
        </Anchored>
      )}
      {!inside && !state.editing && (
        <WorldDock>
          <button type="button" className="world-follow" aria-pressed={state.following} onClick={() => dispatch({ type: "follow" })}>
            {state.following ? "Following" : "Follow"}
          </button>
        </WorldDock>
      )}
      {state.editing && (
        <EditSheet
          state={state}
          onLine={(line) => dispatch({ type: "line", line })}
          onVoice={(on) => dispatch({ type: "voice", on })}
          onInsert={() => dispatch({ type: "phrase" })}
          onPreview={() => {
            dispatch({ type: "preview" });
            setNotice("Preview is on screen only. Approve keeps it on this device. Nothing is sent.");
          }}
          onApprove={() => {
            dispatch({ type: "approve" });
            setNotice("Applied on this device only. Nothing was saved to Razzberry.");
          }}
          onCancel={() => {
            dispatch({ type: "cancel" });
            setNotice("Edit cancelled. The sample world is unchanged.");
          }}
        />
      )}
    </WorldStage>
  );
}

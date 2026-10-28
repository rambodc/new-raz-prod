import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { checkIn } from "../data/api";
import { checkInProblem, geolocationProblem, type CheckInProblem } from "../data/checkInErrors";
import { getPosition } from "../data/geo";
import type { CheckInResult } from "../data/types";

type Step = "idle" | "locating" | "sending" | "done";

/** The big "I'm here" button. It says why it needs your location before the browser asks. */
export default function CheckInButton({ showId, onChecked }: { showId: string; onChecked: (result: CheckInResult) => void }) {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("idle");
  const [message, setMessage] = useState<string | null>(null);

  function fail(problem: CheckInProblem) {
    setStep("idle");
    if (problem.kind === "denied") navigate("/location-help");
    else setMessage(problem.text);
  }

  async function go() {
    setMessage(null);
    setStep("locating");
    let position;
    try {
      position = await getPosition();
    } catch (error) {
      fail(geolocationProblem(error as { code?: number }));
      return;
    }
    setStep("sending");
    try {
      const result = await checkIn(showId, position);
      setStep("done");
      onChecked(result);
    } catch (error) {
      fail(checkInProblem(error));
    }
  }

  const busy = step === "locating" || step === "sending";
  return (
    <div className="checkin">
      <button type="button" className="lb-btn lb-btn--big" onClick={go} disabled={busy}>
        {step === "locating" ? "Finding you…" : step === "sending" ? "Checking in…" : "I'm here"}
      </button>
      {step === "locating" && <p className="checkin-note">We use your location once to confirm you're at the show.</p>}
      {message && (
        <p className="checkin-note checkin-note--bad" role="alert">
          {message}
        </p>
      )}
    </div>
  );
}

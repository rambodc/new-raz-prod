import { Link } from "react-router-dom";

/** Shown when the browser says no to location. Short steps for the two common phones. */
export default function LocationHelp() {
  return (
    <div className="help">
      <h1 className="lb-display">Turn on location</h1>
      <p className="muted">We only use it once, to confirm you're at the show.</p>
      <div className="lb-card help-card">
        <h2 className="lb-label">iPhone</h2>
        <ol>
          <li>Open Settings, then Privacy &amp; Security, then Location Services. Make sure it's on.</li>
          <li>Scroll to your browser (Safari or Chrome) and choose "While Using".</li>
          <li>Come back here and tap "I'm here".</li>
        </ol>
      </div>
      <div className="lb-card help-card">
        <h2 className="lb-label">Android</h2>
        <ol>
          <li>Tap the lock icon next to the web address.</li>
          <li>Tap Permissions, then Location, then Allow.</li>
          <li>Come back here and tap "I'm here".</li>
        </ol>
      </div>
      <p className="muted">On a computer, click the lock icon in the address bar and allow Location.</p>
      <Link to="/" className="lb-btn lb-btn--big">
        Try again
      </Link>
    </div>
  );
}

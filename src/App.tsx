import { useState } from "react";

const SCENES = [
  { time: "7:00pm, Daily", detail: "3 scenes, 11 accessories" },
  { time: "1:00pm, Daily", detail: "1 scene, 2 accessories" },
  { time: "11:00pm, Daily", detail: "2 scenes, 8 accessories" },
];

export default function App() {
  const [lightOn, setLightOn] = useState(true);
  const [level, setLevel] = useState(72);
  const [cameraOn, setCameraOn] = useState(false);

  return (
    <main>
      <header className="top">
        <p className="brand">Razzberry</p>
        <p className="place">Home</p>
      </header>
      <h1>25°</h1>
      <House />
      <section className="controls" aria-label="Devices">
        <article className="device">
          <span className="device-icon" aria-hidden="true">
            <LightIcon />
          </span>
          <span className="device-copy">
            <strong>Light</strong>
            <span>Outdoor</span>
          </span>
          <span className="device-state">{lightOn ? "ON" : "OFF"}</span>
          <button type="button" className={lightOn ? "switch is-on" : "switch"} role="switch" aria-checked={lightOn} aria-label="Outdoor light" onClick={() => setLightOn((on) => !on)}>
            <span />
          </button>
          <label className="level">
            Brightness
            <input type="range" min={0} max={100} value={lightOn ? level : 0} disabled={!lightOn} onChange={(event) => setLevel(Number(event.target.value))} />
          </label>
        </article>
        <article className="device">
          <span className="device-icon" aria-hidden="true">
            <CameraIcon />
          </span>
          <span className="device-copy">
            <strong>Camera</strong>
            <span>Front Door</span>
          </span>
          <span className="device-state">{cameraOn ? "ON" : "OFF"}</span>
          <button type="button" className={cameraOn ? "switch is-on" : "switch"} role="switch" aria-checked={cameraOn} aria-label="Front door camera" onClick={() => setCameraOn((on) => !on)}>
            <span />
          </button>
        </article>
      </section>
      <section className="scenes" aria-label="Scenes">
        <ul>
          {SCENES.map((scene) => (
            <li key={scene.time}>
              <strong>{scene.time}</strong>
              <span>{scene.detail}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function House() {
  return (
    <figure className="stage" aria-hidden="true">
      <svg viewBox="0 0 320 250" className="house">
        <ellipse cx="160" cy="214" rx="118" ry="22" className="shadow" />
        <path d="M48 168h224a28 28 0 0 1 28 28v8c0 18-62 34-140 34S20 222 20 204v-8a28 28 0 0 1 28-28z" className="plinth" />
        <path d="M70 168c8-28 28-78 90-96 62 18 82 68 90 96" className="lawn" />
        <path d="M118 132l42-34 42 34v46h-84z" className="walls" />
        <path d="M110 134l50-42 50 42" className="roof" />
        <path d="M146 154h16v24h-16z" className="door" />
        <path d="M128 146h12v12h-12zm40 0h12v12h-12z" className="windows" />
        <circle cx="92" cy="150" r="16" className="tree" />
        <circle cx="228" cy="146" r="18" className="tree" />
        <circle cx="78" cy="168" r="10" className="tree small" />
        <circle cx="246" cy="170" r="11" className="tree small" />
      </svg>
    </figure>
  );
}

function LightIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M4 8h4l2-2h4l2 2h4v10H4z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

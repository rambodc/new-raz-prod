import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./inter.css";
import "./styles.css";

const RELOAD_KEY = "razzberry.chunk-reload";

function reloadForNewBuild() {
  try {
    if (sessionStorage.getItem(RELOAD_KEY) === "1") return;
    sessionStorage.setItem(RELOAD_KEY, "1");
  } catch {
    return;
  }
  window.location.reload();
}

window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  reloadForNewBuild();
});

window.setTimeout(() => {
  try {
    sessionStorage.removeItem(RELOAD_KEY);
  } catch {
    // Storage can be blocked. The next failed chunk load will try again.
  }
}, 15000);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

import { cpSync, mkdirSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/** MediaPipe's WASM stays on our origin. It is copied out of the package at build and dev start. */
function copyVisionWasm(): Plugin {
  const copy = () => {
    mkdirSync("public/mediapipe", { recursive: true });
    cpSync("node_modules/@mediapipe/tasks-vision/wasm", "public/mediapipe", { recursive: true });
  };
  return { name: "copy-vision-wasm", buildStart: copy, configureServer: copy };
}

export default defineConfig({
  plugins: [react(), copyVisionWasm()],
  build: { target: "es2022", chunkSizeWarningLimit: 1000 },
  server: {
    proxy: { "/api/scene": "http://127.0.0.1:8787" },
  },
});

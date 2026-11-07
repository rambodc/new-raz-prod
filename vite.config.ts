import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { stripCrossOriginAttributes } from "./src/ios/startupDocument.ts";

/** Run after Vite injects module tags. Those tags must not require CORS on capacitor://. */
function stripModuleCrossOrigin(): Plugin {
  return {
    name: "strip-module-crossorigin",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        return stripCrossOriginAttributes(html);
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), stripModuleCrossOrigin()],
  // Firebase and the Three.js room are large on purpose, and each is its own chunk.
  build: { target: "es2022", chunkSizeWarningLimit: 1000 },
});

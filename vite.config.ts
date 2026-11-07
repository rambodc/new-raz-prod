import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Firebase and the Three.js room are large on purpose, and each is its own chunk.
  build: { target: "es2022", chunkSizeWarningLimit: 1000 },
});

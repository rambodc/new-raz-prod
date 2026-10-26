import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // The lazy 3D chunk (three.js) and the lazy Firebase Auth chunk each exceed 500 kB minified on purpose.
  build: { target: "es2022", chunkSizeWarningLimit: 650 },
});

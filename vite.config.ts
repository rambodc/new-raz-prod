import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // The lazy Firebase chunks (Auth, Firestore) are over 500 kB minified on purpose.
  build: { target: "es2022", chunkSizeWarningLimit: 650 },
});

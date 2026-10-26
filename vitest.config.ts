import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Kept separate from vite.config.ts: Vitest ships its own Vite copy, so mixing the two breaks type-checking.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
  },
});

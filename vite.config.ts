import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: { target: "es2022" },
  server: {
    proxy: {
      "/api/scene": "http://127.0.0.1:8787",
      "/api/image": "http://127.0.0.1:8787",
      "/api/invite-cover": {
        target: "http://127.0.0.1:5001",
        rewrite: (path) => `/new-raz-prod/us-central1/inviteCover${path.replace(/^\/api\/invite-cover/, "")}`,
      },
    },
  },
});

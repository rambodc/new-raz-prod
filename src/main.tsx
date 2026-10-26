import "@fontsource-variable/outfit/wght.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AppRoutes } from "./App";
import { AuthProvider } from "./auth/AuthProvider";
import { ThemeProvider } from "./components/ThemeProvider";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/pages.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
);

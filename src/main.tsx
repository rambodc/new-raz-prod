import "@fontsource-variable/outfit/wght.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AppRoutes } from "./App";
import { AuthProvider } from "./auth/AuthProvider";
import { StartupBoundary } from "./boot/StartupBoundary";
import { ThemeProvider } from "./components/ThemeProvider";
import { markNativeShell, prepareNativeShell } from "./world/shellLifecycle";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/pages.css";

markNativeShell();
void prepareNativeShell();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StartupBoundary>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </StartupBoundary>
  </StrictMode>,
);

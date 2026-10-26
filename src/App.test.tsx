import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "./auth/service";

// A tiny in-memory stand-in for the Firebase-backed service layer.
const state = vi.hoisted(() => ({
  user: null as AuthUser | null,
  listeners: new Set<(u: AuthUser | null) => void>(),
}));

const service = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  sendPasswordReset: vi.fn(),
  signOutUser: vi.fn(),
}));

vi.mock("./auth/service", () => ({
  subscribeToAuth: async (onUser: (u: AuthUser | null) => void) => {
    state.listeners.add(onUser);
    queueMicrotask(() => onUser(state.user));
    return () => state.listeners.delete(onUser);
  },
  currentUser: async () => state.user,
  ...service,
}));

vi.mock("./lib/webgl", () => ({ hasWebGL: () => false, prefersReducedMotion: () => false }));

import { AppRoutes } from "./App";
import { AuthProvider } from "./auth/AuthProvider";
import { ThemeProvider } from "./components/ThemeProvider";

function renderAt(path: string) {
  return render(
    <ThemeProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  state.user = null;
  state.listeners.clear();
  Object.values(service).forEach((fn) => fn.mockReset());
  localStorage.clear();
});

afterEach(cleanup);

describe("home page", () => {
  it("renders the hero, steps and calls to action without errors", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    renderAt("/");
    expect(await screen.findByRole("heading", { level: 1, name: /permanent identity/i })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Create. Prove. Own." })).toBeTruthy();
    expect(screen.getByRole("img", { name: /raspberry/i })).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /create your account/i }).length).toBeGreaterThan(0);
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it("switches theme, persists the choice and updates the document", async () => {
    renderAt("/");
    const toggle = await screen.findByRole("button", { name: /switch to light mode/i });
    expect(document.documentElement.dataset.theme).toBe("dark");
    fireEvent.click(toggle);
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("razzberry-theme")).toBe("light");
    expect(screen.getByRole("button", { name: /switch to dark mode/i })).toBeTruthy();
  });
});

describe("sign in", () => {
  it("shows friendly validation errors for empty fields", async () => {
    renderAt("/signin");
    fireEvent.click(await screen.findByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Enter your email address.")).toBeTruthy();
    expect(screen.getByText("Enter your password.")).toBeTruthy();
    expect(service.signIn).not.toHaveBeenCalled();
  });

  it("submits credentials and maps Firebase errors to plain language", async () => {
    service.signIn.mockRejectedValue({ code: "auth/invalid-credential" });
    renderAt("/signin");
    fireEvent.change(await screen.findByLabelText("Email"), { target: { value: "ada@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("That email and password don't match. Please try again.")).toBeTruthy();
    expect(service.signIn).toHaveBeenCalledWith("ada@example.com", "wrong-password");
  });

  it("can show and hide the password", async () => {
    renderAt("/signin");
    const input = (await screen.findByLabelText("Password")) as HTMLInputElement;
    expect(input.type).toBe("password");
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(input.type).toBe("text");
  });
});

describe("sign up", () => {
  it("validates name, email, password length and confirmation", async () => {
    renderAt("/signup");
    fireEvent.click(await screen.findByRole("button", { name: "Create account" }));
    expect(await screen.findByText("Tell us what to call you.")).toBeTruthy();
    expect(screen.getByText("Choose a password.")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Ada" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ada@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("Use at least 8 characters.")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "long-enough-1" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "different-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("The passwords don't match.")).toBeTruthy();
    expect(service.signUp).not.toHaveBeenCalled();
  });

  it("creates the account with the entered details", async () => {
    service.signUp.mockResolvedValue({ profileSaved: true });
    renderAt("/signup");
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Ada Lovelace" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ada@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "long-enough-1" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "long-enough-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(service.signUp).toHaveBeenCalledWith({ name: "Ada Lovelace", email: "ada@example.com", password: "long-enough-1" }));
  });
});

describe("forgot password", () => {
  it("sends a reset email and shows a non-revealing confirmation", async () => {
    service.sendPasswordReset.mockResolvedValue(undefined);
    renderAt("/forgot-password");
    fireEvent.change(await screen.findByLabelText("Email"), { target: { value: "ada@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByText(/if an account exists/i)).toBeTruthy();
    expect(service.sendPasswordReset).toHaveBeenCalledWith("ada@example.com");
  });
});

describe("route guards", () => {
  it("sends signed-out visitors from /welcome to sign in", async () => {
    renderAt("/welcome");
    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeTruthy();
  });

  it("shows the signed-in welcome page with the user's name", async () => {
    state.user = { uid: "u1", displayName: "Ada Lovelace", email: "ada@example.com" };
    renderAt("/welcome");
    expect(await screen.findByRole("heading", { level: 1, name: /welcome, ada/i })).toBeTruthy();
    expect(screen.getByText("ada@example.com")).toBeTruthy();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeTruthy();
  });

  it("redirects signed-in users away from the auth pages", async () => {
    state.user = { uid: "u1", displayName: "Ada Lovelace", email: "ada@example.com" };
    renderAt("/signin");
    expect(await screen.findByRole("heading", { level: 1, name: /welcome, ada/i })).toBeTruthy();
  });

  it("shows a friendly 404", async () => {
    renderAt("/nope");
    expect(await screen.findByRole("heading", { name: /isn't here/i })).toBeTruthy();
  });
});

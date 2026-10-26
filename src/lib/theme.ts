export type Theme = "dark" | "light";

export const THEME_KEY = "razzberry-theme";

/** Dark is the default. Only an explicit, stored choice switches to light. */
export function resolveTheme(stored: string | null | undefined): Theme {
  return stored === "light" ? "light" : "dark";
}

export function readStoredTheme(): Theme {
  try {
    return resolveTheme(localStorage.getItem(THEME_KEY));
  } catch {
    return "dark";
  }
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#07060a" : "#fbf6f9");
}

export function storeTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* private mode: the choice just won't persist */
  }
}

/**
 * Display preferences.
 *
 * These are the settings that change how *this browser* renders the app —
 * theme, motion, confirmation toasts. They live in localStorage rather than the
 * database on purpose: they are device-level choices, not account facts, and a
 * phone and a laptop can reasonably disagree about dark mode.
 *
 * Anything that belongs to the account — name, institution, leaderboard
 * visibility, password — goes to the API instead. See pages/Settings.tsx.
 */

export type Theme = "system" | "light" | "dark";

export interface Preferences {
  theme: Theme;
  reduceMotion: boolean;
  /** Confirmation toasts for saves, comments, joins and so on. */
  toasts: boolean;
}

const KEY = "medly.preferences";

export const DEFAULTS: Preferences = {
  theme: "system",
  reduceMotion: false,
  toasts: true,
};

export function readPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Preferences>) };
  } catch {
    return DEFAULTS;
  }
}

export function writePreferences(next: Preferences) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private browsing — the setting simply does not persist */
  }
  applyPreferences(next);
  window.dispatchEvent(new CustomEvent<Preferences>(EVENT, { detail: next }));
}

export const EVENT = "medly:preferences";

function prefersDark(): boolean {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

/** Write the preferences onto <html>. Everything else reads CSS variables. */
export function applyPreferences(preferences: Preferences) {
  const root = document.documentElement;
  const dark = preferences.theme === "dark" || (preferences.theme === "system" && prefersDark());
  root.classList.toggle("dark", dark);
  root.classList.toggle("reduce-motion", preferences.reduceMotion);
}

/** Called once at startup, before React renders, to avoid a flash of light theme. */
export function initPreferences(): Preferences {
  const preferences = readPreferences();
  applyPreferences(preferences);

  // Follow the OS while the theme is on "system".
  window
    .matchMedia?.("(prefers-color-scheme: dark)")
    .addEventListener?.("change", () => {
      const current = readPreferences();
      if (current.theme === "system") applyPreferences(current);
    });

  return preferences;
}

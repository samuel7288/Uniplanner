import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from "react";

export type ThemePreset = "ocean" | "forest" | "sunset" | "violet";

type ThemeContextValue = {
  isDark: boolean;
  toggleDark: () => void;
  setDarkMode: (value: boolean) => void;
  preset: ThemePreset;
  setPreset: (preset: ThemePreset) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const PRESET_VARS: Record<ThemePreset, Record<string, string>> = {
  ocean: {
    "--brand": "#264ad1",
    "--brand-soft": "#d9e5ff",
    "--accent": "#1c9366",
  },
  forest: {
    "--brand": "#1a6e3c",
    "--brand-soft": "#d1f5e0",
    "--accent": "#0e5c6b",
  },
  sunset: {
    "--brand": "#c0451e",
    "--brand-soft": "#ffe5da",
    "--accent": "#b8820d",
  },
  violet: {
    "--brand": "#6b28c8",
    "--brand-soft": "#ede0ff",
    "--accent": "#c428a0",
  },
};

export function ThemeProvider({ children }: PropsWithChildren) {
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem("uniplanner_dark");
    if (stored !== null) return stored === "true";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  const [preset, setPresetState] = useState<ThemePreset>(() => {
    if (typeof window === "undefined") return "ocean";
    return (localStorage.getItem("uniplanner_preset") as ThemePreset) ?? "ocean";
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", isDark);
    localStorage.setItem("uniplanner_dark", String(isDark));
  }, [isDark]);

  useEffect(() => {
    const root = document.documentElement;
    const vars = PRESET_VARS[preset];
    Object.entries(vars).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
    localStorage.setItem("uniplanner_preset", preset);
  }, [preset]);

  function toggleDark() {
    setIsDark((prev) => !prev);
  }

  function setDarkMode(value: boolean) {
    setIsDark(value);
  }

  function setPreset(p: ThemePreset) {
    setPresetState(p);
  }

  const value = useMemo<ThemeContextValue>(
    () => ({ isDark, toggleDark, setDarkMode, preset, setPreset }),
    [isDark, preset],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

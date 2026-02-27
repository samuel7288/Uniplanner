import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type ThemePreset = "ocean" | "forest" | "sunset" | "violet";

type ThemeContextValue = {
  isDark: boolean;
  toggleDark: () => void;
  setDarkMode: (value: boolean) => void;
  preset: ThemePreset;
  setPreset: (preset: ThemePreset) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

type Shade = "50" | "100" | "200" | "300" | "400" | "500" | "600" | "700" | "800" | "900";
type ColorScale = Record<Shade, string>;
type ThemeScale = {
  brand: ColorScale;
  accent: ColorScale;
};

const SHADES: Shade[] = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900"];

const PRESET_PALETTES: Record<ThemePreset, { light: ThemeScale; dark: ThemeScale }> = {
  ocean: {
    light: {
      brand: {
        "50": "#eef3ff",
        "100": "#d9e5ff",
        "200": "#b8ccff",
        "300": "#93b0ff",
        "400": "#678eff",
        "500": "#2f5be7",
        "600": "#264ad1",
        "700": "#213ea6",
        "800": "#1d337f",
        "900": "#1b2d66",
      },
      accent: {
        "50": "#eefbf6",
        "100": "#d5f5e8",
        "200": "#acebd3",
        "300": "#7fddb9",
        "400": "#4fcf9e",
        "500": "#27b37e",
        "600": "#1c9366",
        "700": "#1a7655",
        "800": "#195f48",
        "900": "#154f3c",
      },
    },
    dark: {
      brand: {
        "50": "#1a2a52",
        "100": "#1d315f",
        "200": "#25407a",
        "300": "#2f4f95",
        "400": "#3b61ba",
        "500": "#4d72f5",
        "600": "#5b80ff",
        "700": "#7d9bff",
        "800": "#a3b8ff",
        "900": "#ccd7ff",
      },
      accent: {
        "50": "#163328",
        "100": "#1a3d2f",
        "200": "#1f5942",
        "300": "#267056",
        "400": "#2f8d6c",
        "500": "#34c98a",
        "600": "#44d99a",
        "700": "#69e3b2",
        "800": "#97edd0",
        "900": "#c8f7ea",
      },
    },
  },
  forest: {
    light: {
      brand: {
        "50": "#edf8f1",
        "100": "#d1f5e0",
        "200": "#abe9c8",
        "300": "#81d8ac",
        "400": "#57c18f",
        "500": "#2f915f",
        "600": "#1a6e3c",
        "700": "#145a31",
        "800": "#124a2a",
        "900": "#103e24",
      },
      accent: {
        "50": "#ecf8fb",
        "100": "#d2f0f5",
        "200": "#a8e0ea",
        "300": "#77ccdb",
        "400": "#44b2c8",
        "500": "#1789a0",
        "600": "#0e5c6b",
        "700": "#0f4d59",
        "800": "#123f48",
        "900": "#133740",
      },
    },
    dark: {
      brand: {
        "50": "#163126",
        "100": "#1b3b2d",
        "200": "#24573e",
        "300": "#2e7150",
        "400": "#3a8d63",
        "500": "#46b074",
        "600": "#5cc587",
        "700": "#7ed5a2",
        "800": "#a9e6c3",
        "900": "#d4f5e2",
      },
      accent: {
        "50": "#162a31",
        "100": "#1a323b",
        "200": "#224855",
        "300": "#2a6070",
        "400": "#35798b",
        "500": "#4ca6bd",
        "600": "#66bdd0",
        "700": "#87cfdd",
        "800": "#acdfea",
        "900": "#d3eef4",
      },
    },
  },
  sunset: {
    light: {
      brand: {
        "50": "#fff2ec",
        "100": "#ffe5da",
        "200": "#ffd1bc",
        "300": "#ffb69a",
        "400": "#ff946f",
        "500": "#e56634",
        "600": "#c0451e",
        "700": "#9d3619",
        "800": "#7f2d18",
        "900": "#682715",
      },
      accent: {
        "50": "#fff8eb",
        "100": "#ffefcf",
        "200": "#ffe09a",
        "300": "#ffd06e",
        "400": "#f6bd42",
        "500": "#d89b1f",
        "600": "#b8820d",
        "700": "#95690f",
        "800": "#785610",
        "900": "#624a11",
      },
    },
    dark: {
      brand: {
        "50": "#3b2218",
        "100": "#4a2a1c",
        "200": "#6b3a22",
        "300": "#8a4b29",
        "400": "#ad5f32",
        "500": "#d6753d",
        "600": "#f08a52",
        "700": "#f9a074",
        "800": "#ffbc9c",
        "900": "#ffd9c9",
      },
      accent: {
        "50": "#3b2e15",
        "100": "#4a3817",
        "200": "#6a4e1a",
        "300": "#8a661f",
        "400": "#ad8126",
        "500": "#d5a233",
        "600": "#ebb64f",
        "700": "#f2ca73",
        "800": "#f7ddb1",
        "900": "#fcefd8",
      },
    },
  },
  violet: {
    light: {
      brand: {
        "50": "#f4efff",
        "100": "#ede0ff",
        "200": "#dbc2ff",
        "300": "#c69cff",
        "400": "#ae73f2",
        "500": "#8544d9",
        "600": "#6b28c8",
        "700": "#5520a5",
        "800": "#451b84",
        "900": "#3a1970",
      },
      accent: {
        "50": "#fff0fa",
        "100": "#ffdff4",
        "200": "#ffbfe8",
        "300": "#ff94d7",
        "400": "#ec63be",
        "500": "#d53ba9",
        "600": "#c428a0",
        "700": "#9f2084",
        "800": "#811d6c",
        "900": "#6d1b5b",
      },
    },
    dark: {
      brand: {
        "50": "#2d1f4e",
        "100": "#35235d",
        "200": "#4a2d83",
        "300": "#5d37aa",
        "400": "#7445d0",
        "500": "#8e5bf0",
        "600": "#a173ff",
        "700": "#b995ff",
        "800": "#d1bcff",
        "900": "#e9ddff",
      },
      accent: {
        "50": "#3a1733",
        "100": "#481b40",
        "200": "#652359",
        "300": "#812d73",
        "400": "#a33a92",
        "500": "#cb4bb3",
        "600": "#e05fc4",
        "700": "#ea84d5",
        "800": "#f3b4e8",
        "900": "#f9dbf4",
      },
    },
  },
};

function hexToRgbChannels(hexColor: string): string {
  const normalized = hexColor.replace("#", "");
  const expanded = normalized.length === 3
    ? normalized.split("").map((char) => char + char).join("")
    : normalized;

  const parsed = Number.parseInt(expanded, 16);
  if (Number.isNaN(parsed)) return "0 0 0";

  const r = (parsed >> 16) & 255;
  const g = (parsed >> 8) & 255;
  const b = parsed & 255;
  return `${r} ${g} ${b}`;
}

function applyScale(root: HTMLElement, palette: ThemeScale): void {
  for (const shade of SHADES) {
    const brandHex = palette.brand[shade];
    const accentHex = palette.accent[shade];

    root.style.setProperty(`--brand-${shade}`, brandHex);
    root.style.setProperty(`--brand-${shade}-rgb`, hexToRgbChannels(brandHex));
    root.style.setProperty(`--accent-${shade}`, accentHex);
    root.style.setProperty(`--accent-${shade}-rgb`, hexToRgbChannels(accentHex));
  }

  root.style.setProperty("--brand", palette.brand["600"]);
  root.style.setProperty("--brand-rgb", hexToRgbChannels(palette.brand["600"]));
  root.style.setProperty("--brand-soft", palette.brand["100"]);
  root.style.setProperty("--brand-soft-rgb", hexToRgbChannels(palette.brand["100"]));
  root.style.setProperty("--accent", palette.accent["600"]);
  root.style.setProperty("--accent-rgb", hexToRgbChannels(palette.accent["600"]));
}

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
    const scale = PRESET_PALETTES[preset][isDark ? "dark" : "light"];
    applyScale(root, scale);
    localStorage.setItem("uniplanner_preset", preset);
  }, [isDark, preset]);

  const toggleDark = useCallback(() => {
    setIsDark((prev) => !prev);
  }, []);

  const setDarkMode = useCallback((value: boolean) => {
    setIsDark(value);
  }, []);

  const setPreset = useCallback((p: ThemePreset) => {
    setPresetState(p);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ isDark, toggleDark, setDarkMode, preset, setPreset }),
    [isDark, preset, toggleDark, setDarkMode, setPreset],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

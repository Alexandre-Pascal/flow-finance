/**
 * @file theme-provider.tsx
 * @description Fournisseur de thème clair/sombre (remplace next-themes).
 * Le script anti-flash est injecté dans le flux HTML via useServerInsertedHTML,
 * donc hors de l'arbre React : React 19 interdit les <script> rendus par un composant.
 */

"use client";

import { useServerInsertedHTML } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";
const THEMES = ["light", "dark", "system"] as const;

export type Theme = (typeof THEMES)[number];
export type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  systemTheme: ResolvedTheme;
  themes: readonly Theme[];
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isTheme(value: string | null): value is Theme {
  return value !== null && (THEMES as readonly string[]).includes(value);
}

function readStoredTheme(): Theme | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isTheme(stored) ? stored : null;
  } catch {
    return null;
  }
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

/** Coupe les transitions CSS le temps du changement de thème pour éviter le fondu. */
function suspendTransitions(): () => void {
  const style = document.createElement("style");
  style.appendChild(
    document.createTextNode(
      "*,*::before,*::after{transition:none!important}",
    ),
  );
  document.head.appendChild(style);

  return () => {
    window.getComputedStyle(document.body);
    setTimeout(() => style.remove(), 1);
  };
}

function applyResolvedTheme(resolved: ResolvedTheme, animate: boolean) {
  const root = document.documentElement;
  const restore = animate ? null : suspendTransitions();

  root.classList.remove("light", "dark");
  root.classList.add(resolved);
  root.style.colorScheme = resolved;

  restore?.();
}

interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: Theme;
}

export function ThemeProvider({
  children,
  defaultTheme = "light",
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(
    () => readStoredTheme() ?? defaultTheme,
  );
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme);

  // Le callback est rappelé à chaque flush du stream : on n'injecte qu'au premier.
  const scriptInserted = useRef(false);

  useServerInsertedHTML(() => {
    if (scriptInserted.current) return null;
    scriptInserted.current = true;

    return (
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{var d=document.documentElement,s=localStorage.getItem(${JSON.stringify(STORAGE_KEY)})||${JSON.stringify(defaultTheme)},t=s==="system"?(window.matchMedia(${JSON.stringify(DARK_QUERY)}).matches?"dark":"light"):s;d.classList.remove("light","dark");d.classList.add(t);d.style.colorScheme=t}catch(e){}})()`,
        }}
      />
    );
  });

  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY);
    const sync = () => setSystemTheme(media.matches ? "dark" : "light");

    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      setThemeState(isTheme(event.newValue) ? event.newValue : defaultTheme);
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [defaultTheme]);

  const resolvedTheme = theme === "system" ? systemTheme : theme;

  useEffect(() => {
    applyResolvedTheme(resolvedTheme, false);
  }, [resolvedTheme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Stockage indisponible (mode privé) : le thème reste valable pour la session.
    }
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, systemTheme, themes: THEMES, setTheme }),
    [theme, resolvedTheme, systemTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);

  if (!context) {
    return {
      theme: "light",
      resolvedTheme: "light",
      systemTheme: "light",
      themes: THEMES,
      setTheme: () => {},
    };
  }

  return context;
}

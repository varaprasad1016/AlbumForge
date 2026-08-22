import { useEffect, useState } from "react";

const THEME_KEY = "albumforge-theme";

export function initTheme(): void {
  const saved = localStorage.getItem(THEME_KEY);
  const dark = saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle("dark", dark);
}

export function useTheme(): { dark: boolean; toggle: () => void } {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
  }, [dark]);
  return { dark, toggle: () => setDark((d) => !d) };
}

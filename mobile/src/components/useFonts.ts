import { useEffect, useState } from "react";

/** Loads the full local font library into the document so Konva/canvas can use it. */
export function useFonts(): string[] {
  const [fonts, setFonts] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const families = await window.albumforge.fonts.list();
      if (cancelled) return;
      setFonts(families);
      for (const family of families) {
        try {
          const url = await window.albumforge.assets.font(family);
          const ff = new FontFace(family, `url(${url})`);
          document.fonts.add(ff);
          await ff.load();
        } catch {
          /* ignore individual font load failures */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return fonts;
}

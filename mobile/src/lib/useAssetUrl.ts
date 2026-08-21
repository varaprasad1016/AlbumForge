import { useEffect, useState } from "react";

export function useAssetUrl(
  kind: "thumb256" | "preview1024" | "original",
  id?: string | null,
): string | undefined {
  const [url, setUrl] = useState<string | undefined>();
  useEffect(() => {
    if (!id) {
      setUrl(undefined);
      return;
    }
    let cancelled = false;
    window.albumforge.assets.url(kind, id).then((u) => {
      if (!cancelled && u) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [kind, id]);
  return url;
}

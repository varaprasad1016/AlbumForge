/** Module 7 — "Elements" sidebar: search Freepik's stock library through the
 *  main-process proxy, show lightweight thumbnails, and let the user drag a
 *  result onto the page (or click to place it at the centre).
 *
 *  Only preview URLs ever reach the renderer — the API key stays in the main
 *  process, and the hi-res asset is downloaded + cached there on drop. */
import { useEffect, useRef, useState } from "react";
import type { StockSearchResult } from "@shared/api";
import { fallbackToPlaceholder } from "../lib/imageFallback";

/** Payload carried by a stock drag (also used for click-to-add). */
export interface StockDragPayload {
  providerId: string;
  sourceUrl: string;
  previewUrl?: string;
  kind: "vector" | "bitmap";
  title: string;
  author: string | null;
  attributionRequired: boolean;
  width: number | null;
  height: number | null;
  mode?: "layer" | "background";
}

const STOCK_MIME = "application/x-albumforge-stock";
const PROVIDERS = [
  { id: "pixabay", label: "Pixabay", note: "free · no attribution needed" },
  { id: "unsplash", label: "Unsplash", note: "free · attribution requested" },
  { id: "freepik", label: "Freepik", note: "paid · attribution may apply" },
] as const;

export default function StockPanel({
  onAdd,
}: {
  onAdd: (payload: StockDragPayload, mode: "layer" | "background") => void;
}) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"layer" | "background">("layer");
  const [kind, setKind] = useState<"vector" | "bitmap">("vector");
  const [items, setItems] = useState<StockSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [cached, setCached] = useState(false);
  const [provider, setProvider] = useState<string | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);
  const seqRef = useRef(0);

  async function refreshProvider(p?: string) {
    const current = p ?? (await window.albumforge.stock.provider());
    setProvider(current);
    setConfigured(await window.albumforge.stock.configured());
    return current;
  }

  useEffect(() => {
    void refreshProvider();
    void window.albumforge.stock.recent().then(setRecent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runSearch(q: string, k: "vector" | "bitmap") {
    if (!q.trim()) {
      setItems([]);
      setError(null);
      return;
    }
    const token = ++seqRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await window.albumforge.stock.search(q, k);
      if (token !== seqRef.current) return;
      setItems(res.items);
      setCached(res.cached);
      if (res.items.length === 0) setError("No matching assets found — try a different term.");
    } catch (e) {
      if (token === seqRef.current) setError(String(e));
    } finally {
      if (token === seqRef.current) setLoading(false);
    }
  }

  function onQueryChange(v: string) {
    setQuery(v);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => void runSearch(v, kind), 450);
  }

  function dragPayload(r: StockSearchResult): StockDragPayload {
    return {
      providerId: r.providerId,
      sourceUrl: r.sourceUrl,
      previewUrl: r.previewUrl,
      kind: r.kind,
      title: r.title,
      author: r.author,
      attributionRequired: r.attributionRequired,
      width: r.width,
      height: r.height,
    };
  }

  const activeProvider = PROVIDERS.find((p) => p.id === provider) ?? PROVIDERS[0];

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {PROVIDERS.map((p) => (
          <button
            key={p.id}
            title={p.note}
            onClick={async () => {
              await window.albumforge.stock.setProvider(p.id);
              await refreshProvider(p.id);
            }}
            className={`chip !px-2.5 !py-1 text-[11px] ${
              provider === p.id ? "!border-indigo-500 !bg-indigo-50 !text-indigo-600" : ""
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex gap-1">
        {(["layer", "background"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`chip !px-2.5 !py-1 text-[11px] ${
              mode === m ? "!border-indigo-500 !bg-indigo-50 !text-indigo-600" : ""
            }`}
          >
            {m === "layer" ? "Add as layer" : "As background"}
          </button>
        ))}
      </div>

      {configured === false && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] leading-snug text-amber-800">
          <p className="font-medium">
            Connect {activeProvider.label}
            <span className="font-normal"> — {activeProvider.note}</span>
          </p>
          <p className="mt-0.5">Paste your API key below. It stays on this machine.</p>
          <input
            type="password"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder={`${activeProvider.id} api key`}
            className="input mt-1.5 !py-1 text-[11px]"
          />
          <button
            className="btn-primary mt-1.5 w-full !py-1 text-[11px]"
            onClick={async () => {
              const ok = await window.albumforge.stock.setApiKey(provider ?? "pixabay", apiKeyInput);
              if (ok) {
                setConfigured(true);
                setApiKeyInput("");
                setError(null);
              } else {
                setError("Could not save the key.");
              }
            }}
          >
            Save key
          </button>
        </div>
      )}

      <div className="relative">
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search stock… e.g. gold mandala"
          className="input w-full !py-1.5 pl-7 text-sm"
        />
        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-300">
          ⌕
        </span>
      </div>

      <div className="flex gap-1">
        {(["vector", "bitmap"] as const).map((k) => (
          <button
            key={k}
            onClick={() => {
              setKind(k);
              void runSearch(query, k);
            }}
            className={`chip !px-2.5 !py-1 text-[11px] ${
              kind === k ? "!border-indigo-500 !bg-indigo-50 !text-indigo-600" : ""
            }`}
          >
            {k === "vector" ? "Vectors" : "PNG / photos"}
          </button>
        ))}
      </div>

      {recent.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {recent.map((t) => (
            <button
              key={t}
              onClick={() => {
                setQuery(t);
                void runSearch(t, kind);
              }}
              className="chip !px-2 !py-0.5 text-[10px]"
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {loading && <p className="text-[11px] text-slate-400">Searching…</p>}
      {!loading && cached && items.length > 0 && (
        <p className="text-[10px] text-slate-400">Cached results — hit the API again next week</p>
      )}
      {error && <p className="text-[11px] text-red-500">{error}</p>}

      <div className="grid grid-cols-2 gap-2">
        {items.map((r) => (
          <button
            key={r.providerId}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(STOCK_MIME, JSON.stringify({ ...dragPayload(r), mode }));
              e.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() => onAdd(dragPayload(r), mode)}
            className="group relative aspect-square overflow-hidden rounded border border-transparent bg-neutral-100 transition-colors hover:border-brand"
            title={`${r.title}${r.author ? ` · by ${r.author}` : ""}`}
          >
            {r.previewUrl && (
              <img
                src={r.previewUrl}
                alt={r.title}
                className="h-full w-full object-contain"
                draggable={false}
                loading="lazy"
                onError={fallbackToPlaceholder}
              />
            )}
            <span className="absolute bottom-0 right-0 rounded-tl bg-black/50 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-white">
              {r.kind === "vector" ? "SVG" : "PNG"}
            </span>
          </button>
        ))}
      </div>

      {configured && !loading && items.length === 0 && !error && (
        <p className="text-[11px] text-slate-400">Drag a result onto the page, or type to search.</p>
      )}
    </div>
  );
}

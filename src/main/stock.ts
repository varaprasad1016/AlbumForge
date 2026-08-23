/** Module 7 — external stock asset search & ingestion.
 *
 *  The renderer never talks to a stock provider directly. Every request goes
 *  through this service in the main process, where the API keys live (env vars
 *  or `userData/stock-config.json`, written only via the `stock:setApiKey` IPC).
 *
 *  Providers (switchable, persisted in stock-config.json):
 *    - `pixabay` (default) — free, no attribution. Search via /api/, originals
 *      (incl. transparent PNGs for vector/illustration assets) via /api/download/.
 *    - `freepik` (retained for later) — paid; Bearer-token proxy to the
 *      Resources API. Serves raster previews on free keys; real SVG recolor
 *      activates on SVG-serving sources.
 *
 *  Search results are cached in SQLite + an LRU so popular terms don't hit the
 *  API twice; downloaded assets are cached under `cache/stock/` and content-
 *  sniffed: SVG → parsed into recolourable vector paths, PNG → transparent
 *  bitmap layer. Albums reference the local copies, so they stay self-contained
 *  and export offline.
 */
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import svgpath from "svgpath";
import { parseSync, type INode } from "svgson";
import type { DB } from "./db";
import { now } from "./db";
import type {
  StockDownloadInput,
  StockDownloadResult,
  StockSearchResult,
  StockVectorData,
} from "@shared/api";

const FREEPIK_ENDPOINT = "https://api.freepik.com/v1/resources";
const PIXABAY_ENDPOINT = "https://pixabay.com/api/";
const UNSPLASH_ENDPOINT = "https://api.unsplash.com/search/photos";
const SEARCH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // re-hit the API weekly per term
const RECENT_CAP = 12;
const DEFAULT_DIM = 100;

export type StockProviderId = "pixabay" | "freepik" | "unsplash";

/** Where each provider's key lives: env var + field in stock-config.json. */
const PROVIDERS: Record<StockProviderId, { keyEnv: string; configField: keyof StockConfig }> = {
  pixabay: { keyEnv: "PIXABAY_API_KEY", configField: "pixabayApiKey" },
  freepik: { keyEnv: "FREEPIK_API_KEY", configField: "freepikApiKey" },
  unsplash: { keyEnv: "UNSPLASH_API_KEY", configField: "unsplashApiKey" },
};

const PROVIDER_IDS: StockProviderId[] = ["pixabay", "freepik", "unsplash"];

/* ------------------------------------------------------------------ */
/* Pure, testable helpers                                              */
/* ------------------------------------------------------------------ */

function num(v: string | undefined, fallback: number): number {
  if (v === undefined) return fallback;
  const n = Number.parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

/** Effective fill colour for a node: its fill, else inherited, else its stroke
 *  when the shape is stroke-only. `undefined` means the shape is invisible. */
function effectiveColor(attrs: Record<string, string>, inheritedFill: string | undefined): string | undefined {
  const fill = attrs["fill"] ?? inheritedFill;
  if (fill !== undefined && fill.trim().toLowerCase() !== "none") return fill.trim().toLowerCase();
  const stroke = attrs["stroke"];
  if (stroke && stroke.trim().toLowerCase() !== "none") return stroke.trim().toLowerCase();
  return undefined;
}

function pointsToPath(points: string | undefined, close: boolean): string {
  if (!points) return "";
  const pts = points
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((p) => Number.parseFloat(p));
  if (pts.length < 4) return "";
  let d = `M${pts[0]} ${pts[1]}`;
  for (let i = 2; i + 1 < pts.length; i += 2) d += `L${pts[i]} ${pts[i + 1]}`;
  if (close) d += "Z";
  return d;
}

const SKIP_SUBTREES = new Set([
  "defs",
  "clipPath",
  "mask",
  "filter",
  "pattern",
  "symbol",
  "linearGradient",
  "radialGradient",
  "metadata",
  "title",
  "desc",
  "style",
  "use",
]);

function visit(node: INode, inheritedFill: string | undefined, inheritedTransform: string, out: Map<string, string[]>): void {
  const attrs = node.attributes ?? {};
  const transform = [inheritedTransform, attrs["transform"]].filter(Boolean).join(" ");
  const fill = effectiveColor(attrs, inheritedFill);

  const push = (d: string | undefined): void => {
    if (!d || !fill) return;
    let p = svgpath(d);
    if (transform) p = p.transform(transform);
    p = p.round(2);
    const flat = p.toString();
    if (!flat) return;
    const bucket = out.get(fill) ?? [];
    bucket.push(flat);
    out.set(fill, bucket);
  };

  switch (node.name) {
    case "path":
      push(attrs["d"]);
      break;
    case "circle": {
      const r = num(attrs["r"], 0);
      if (r > 0) {
        const cx = num(attrs["cx"], 0);
        const cy = num(attrs["cy"], 0);
        push(`M${cx - r} ${cy}A${r} ${r} 0 1 0 ${cx + r} ${cy}A${r} ${r} 0 1 0 ${cx - r} ${cy}Z`);
      }
      break;
    }
    case "ellipse": {
      const rx = num(attrs["rx"], 0);
      const ry = num(attrs["ry"], 0);
      if (rx > 0 && ry > 0) {
        const cx = num(attrs["cx"], 0);
        const cy = num(attrs["cy"], 0);
        push(`M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`);
      }
      break;
    }
    case "rect": {
      const x = num(attrs["x"], 0);
      const y = num(attrs["y"], 0);
      const w = num(attrs["width"], 0);
      const h = num(attrs["height"], 0);
      if (w > 0 && h > 0) push(`M${x} ${y}h${w}v${h}h${-w}Z`);
      break;
    }
    case "line": {
      const x1 = num(attrs["x1"], 0);
      const y1 = num(attrs["y1"], 0);
      const x2 = num(attrs["x2"], 0);
      const y2 = num(attrs["y2"], 0);
      push(`M${x1} ${y1}L${x2} ${y2}`);
      break;
    }
    case "polygon":
      push(pointsToPath(attrs["points"], true));
      break;
    case "polyline":
      push(pointsToPath(attrs["points"], false));
      break;
  }

  for (const child of node.children ?? []) {
    if (!SKIP_SUBTREES.has(child.name)) visit(child, fill, transform, out);
  }
}

/** Parse an external SVG into recolourable path groups (bucketed by fill
 *  colour), with all transforms flattened into the path data. */
export function parseSvg(svg: string): StockVectorData {
  let root: INode;
  try {
    root = parseSync(svg);
  } catch {
    throw new Error("Could not parse SVG — unsupported or malformed markup.");
  }
  const attrs = root.attributes ?? {};
  let width = DEFAULT_DIM;
  let height = DEFAULT_DIM;
  const vb = (attrs["viewBox"] ?? "").trim().split(/[\s,]+/).filter(Boolean).map((s) => Number.parseFloat(s));
  if (vb.length >= 4 && vb.every(Number.isFinite)) {
    width = vb[2];
    height = vb[3];
  } else {
    width = num(attrs["width"], DEFAULT_DIM);
    height = num(attrs["height"], width);
  }
  const groups = new Map<string, string[]>();
  visit(root, undefined, "", groups);
  if (groups.size === 0) throw new Error("No drawable paths found in the SVG.");
  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
    groups: [...groups.entries()].map(([color, paths]) => ({ color, paths })),
  };
}

/** Map a Freepik `/v1/resources` item onto our provider-agnostic shape.
 *  Premium items are dropped (they can't be downloaded with a free key). */
export function mapFreepikResource(r: unknown): StockSearchResult | null {
  if (!r || typeof r !== "object") return null;
  const rec = r as Record<string, unknown>;
  const type = String(rec["type"] ?? "");
  const kind: "vector" | "bitmap" = type === "vector" || type === "icon" ? "vector" : "bitmap";
  const licenses = Array.isArray(rec["licenses"]) ? (rec["licenses"] as Array<Record<string, unknown>>) : [];
  const lic = licenses[0] ?? {};
  if (!!rec["is_premium"] || !!lic["is_premium"]) return null;
  const image = (rec["image"] ?? {}) as Record<string, unknown>;
  const preview = (image["preview"] ?? {}) as Record<string, unknown>;
  const source = (image["source"] ?? {}) as Record<string, unknown>;
  const author = (rec["author"] ?? {}) as Record<string, unknown>;
  const w = source["width"] != null ? Number(source["width"]) : null;
  const h = source["height"] != null ? Number(source["height"]) : null;
  return {
    providerId: `freepik-${rec["id"]}`,
    provider: "freepik",
    title: String(rec["title"] ?? "Untitled"),
    kind,
    previewUrl: String(preview["url"] ?? ""),
    sourceUrl: String(source["url"] ?? ""),
    width: Number.isFinite(w) ? w : null,
    height: Number.isFinite(h) ? h : null,
    author: author["name"] ? String(author["name"]) : null,
    isPremium: false,
    attributionRequired: !!lic["attribution_required"],
  };
}

/** Map a Pixabay `/api/` hit. Pixabay serves vector/illustration assets as
 *  transparent PNGs via its download endpoint (no SVG), so everything ingests
 *  as a bitmap layer — but the vector search filter still finds the right kind
 *  of decorative asset. No attribution is required under the Pixabay license. */
export function mapPixabayHit(r: unknown): StockSearchResult | null {
  if (!r || typeof r !== "object") return null;
  const h = r as Record<string, unknown>;
  if (h["id"] == null) return null;
  const tags = String(h["tags"] ?? "");
  return {
    providerId: `pixabay-${h["id"]}`,
    provider: "pixabay",
    title: tags.split(",")[0]?.trim() || "Untitled",
    kind: "bitmap",
    previewUrl: String(h["previewURL"] ?? ""),
    sourceUrl: String(h["largeImageURL"] ?? ""),
    width: h["imageWidth"] != null ? Number(h["imageWidth"]) : null,
    height: h["imageHeight"] != null ? Number(h["imageHeight"]) : null,
    author: h["user"] ? String(h["user"]) : null,
    isPremium: false,
    attributionRequired: false,
  };
}

/** Map an Unsplash search result. Photos only — ideal for texture/luxury
 *  backgrounds. The raw URL is clamped to a print-friendly 2400px JPG. Unsplash's
 *  API guidelines request attribution, so `attributionRequired` is set. */
export function mapUnsplashPhoto(r: unknown): StockSearchResult | null {
  if (!r || typeof r !== "object") return null;
  const p = r as Record<string, unknown>;
  if (!p["id"]) return null;
  const urls = (p["urls"] ?? {}) as Record<string, unknown>;
  const user = (p["user"] ?? {}) as Record<string, unknown>;
  const raw = String(urls["raw"] ?? "");
  const sourceUrl = raw
    ? `${raw}${raw.includes("?") ? "&" : "?"}fm=jpg&fit=max&w=2400&q=85`
    : String(urls["full"] ?? "");
  return {
    providerId: `unsplash-${p["id"]}`,
    provider: "unsplash",
    title: (String(p["alt_description"] || p["description"] || "Unsplash photo")).slice(0, 80),
    kind: "bitmap",
    previewUrl: String(urls["small"] ?? urls["thumb"] ?? ""),
    sourceUrl,
    width: p["width"] != null ? Number(p["width"]) : null,
    height: p["height"] != null ? Number(p["height"]) : null,
    author: user["name"] ? String(user["name"]) : null,
    isPremium: false,
    attributionRequired: true,
  };
}

/* ------------------------------------------------------------------ */
/* Service                                                             */
/* ------------------------------------------------------------------ */

interface StockAssetRow {
  provider_id: string;
  kind: string;
  local_path: string;
  title: string | null;
  author: string | null;
  license: string | null;
  width: number | null;
  height: number | null;
}

interface StockConfig {
  provider?: StockProviderId;
  pixabayApiKey?: string;
  freepikApiKey?: string;
  unsplashApiKey?: string;
}

export class StockService {
  private readonly db: DB;
  private readonly cacheDir: string;
  private readonly configPath: string;
  private readonly recentPath: string;
  private lru = new Map<string, { items: StockSearchResult[] }>();
  private recentTerms: string[] = [];

  constructor(opts: { db: DB; cacheDir: string; dataDir: string }) {
    this.db = opts.db;
    this.cacheDir = join(opts.cacheDir, "stock");
    this.configPath = join(opts.dataDir, "stock-config.json");
    this.recentPath = join(opts.cacheDir, "stock-recent.json");
    mkdirSync(this.cacheDir, { recursive: true });
    try {
      this.recentTerms = JSON.parse(readFileSync(this.recentPath, "utf8")) as string[];
    } catch {
      this.recentTerms = [];
    }
  }

  private readConfig(): StockConfig {
    try {
      return JSON.parse(readFileSync(this.configPath, "utf8")) as StockConfig;
    } catch {
      return {};
    }
  }

  private writeConfig(cfg: StockConfig): void {
    try {
      writeFileSync(this.configPath, JSON.stringify(cfg), { mode: 0o600 });
    } catch {
      /* non-fatal — key will be re-requested next launch */
    }
  }

  provider(): StockProviderId {
    const cfg = this.readConfig();
    return cfg.provider === "pixabay" || cfg.provider === "freepik" ? cfg.provider : "pixabay";
  }

  setProvider(p: string): boolean {
    if (!PROVIDER_IDS.includes(p as StockProviderId)) return false;
    const cfg = this.readConfig();
    cfg.provider = p as StockProviderId;
    this.writeConfig(cfg);
    return true;
  }

  /** Provider API key never crosses IPC: it stays in the main process. */
  private apiKey(p: StockProviderId = this.provider()): string | null {
    const meta = PROVIDERS[p];
    if (process.env[meta.keyEnv]) return process.env[meta.keyEnv] ?? null;
    const cfg = this.readConfig();
    const k = cfg[meta.configField] as string | undefined;
    return k?.trim() || null;
  }

  isConfigured(): boolean {
    return !!this.apiKey();
  }

  /** Save a key for a provider and make it the active one. */
  setApiKey(p: string, key: string): boolean {
    const pid = p as StockProviderId;
    const meta = PROVIDERS[pid];
    const clean = (key ?? "").trim();
    if (!meta || !clean) return false;
    const cfg = this.readConfig();
    (cfg as Record<string, unknown>)[meta.configField] = clean;
    cfg.provider = pid;
    this.writeConfig(cfg);
    return true;
  }

  recent(limit = RECENT_CAP): string[] {
    return this.recentTerms.slice(0, Math.max(1, limit));
  }

  private remember(term: string): void {
    const t = term.trim();
    if (!t) return;
    this.recentTerms = [t, ...this.recentTerms.filter((x) => x !== t)].slice(0, RECENT_CAP);
    try {
      writeFileSync(this.recentPath, JSON.stringify(this.recentTerms));
    } catch {
      /* non-fatal */
    }
  }

  /* ---- provider search implementations ---- */

  private async freepikSearch(term: string, kind: "vector" | "bitmap", apiKey: string): Promise<StockSearchResult[]> {
    const url = new URL(FREEPIK_ENDPOINT);
    url.searchParams.set("term", term);
    url.searchParams.set("type", kind === "vector" ? "vector" : "photo");
    url.searchParams.set("limit", "30");
    url.searchParams.set("order", "relevance");
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}`, "Accept-Language": "en-US" },
    });
    if (!res.ok) throw new Error(`Freepik search failed (${res.status}) — check your API key and plan.`);
    const json = (await res.json()) as { data?: unknown[] };
    return (json.data ?? []).map(mapFreepikResource).filter((x): x is StockSearchResult => !!x);
  }

  private async unsplashSearch(term: string, apiKey: string): Promise<StockSearchResult[]> {
    const url = new URL(UNSPLASH_ENDPOINT);
    url.searchParams.set("query", term);
    url.searchParams.set("per_page", "30");
    const res = await fetch(url, { headers: { Authorization: `Client-ID ${apiKey}` } });
    if (!res.ok) throw new Error(`Unsplash search failed (${res.status}) — check your API key.`);
    const json = (await res.json()) as { results?: unknown[] };
    return (json.results ?? []).map(mapUnsplashPhoto).filter((x): x is StockSearchResult => !!x);
  }

  private async pixabaySearch(term: string, kind: "vector" | "bitmap", apiKey: string): Promise<StockSearchResult[]> {
    const url = new URL(PIXABAY_ENDPOINT);
    url.searchParams.set("key", apiKey);
    url.searchParams.set("q", term);
    url.searchParams.set("image_type", kind === "vector" ? "vector" : "photo");
    url.searchParams.set("per_page", "30");
    url.searchParams.set("safesearch", "true");
    url.searchParams.set("lang", "en");
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Pixabay search failed (${res.status}) — check your API key.`);
    const json = (await res.json()) as { hits?: unknown[] };
    return (json.hits ?? []).map(mapPixabayHit).filter((x): x is StockSearchResult => !!x);
  }

  async search(term: string, kind: "vector" | "bitmap"): Promise<{ items: StockSearchResult[]; cached: boolean }> {
    const q = term.trim();
    if (!q) return { items: [], cached: false };
    const provider = this.provider();
    const key = `${provider}:${kind}:${q.toLowerCase()}`;

    const lruHit = this.lru.get(key);
    if (lruHit) return { items: lruHit.items, cached: true };

    const row = this.db
      .prepare("SELECT payload, created_at FROM stock_search_cache WHERE cache_key = ?")
      .get(key) as { payload: string; created_at: string } | undefined;
    if (row && Date.now() - Date.parse(row.created_at) < SEARCH_TTL_MS) {
      const items = JSON.parse(row.payload) as StockSearchResult[];
      this.lru.set(key, { items });
      return { items, cached: true };
    }

    const apiKey = this.apiKey(provider);
    if (!apiKey) {
      throw new Error(
        provider === "pixabay"
          ? "Pixabay API key not configured (free). Add one below or set PIXABAY_API_KEY."
          : provider === "unsplash"
            ? "Unsplash API key not configured (free). Add one below or set UNSPLASH_API_KEY."
            : "Freepik API key not configured. Add one below or set FREEPIK_API_KEY.",
      );
    }
    const items =
      provider === "pixabay"
        ? await this.pixabaySearch(q, kind, apiKey)
        : provider === "unsplash"
          ? await this.unsplashSearch(q, apiKey)
          : await this.freepikSearch(q, kind, apiKey);

    this.db
      .prepare("INSERT OR REPLACE INTO stock_search_cache (cache_key, payload, created_at) VALUES (?, ?, ?)")
      .run(key, JSON.stringify(items), now());
    this.lru.set(key, { items });
    this.remember(q);
    return { items, cached: false };
  }

  private async toResult(row: StockAssetRow, fromCache: boolean): Promise<StockDownloadResult> {
    const kind = row.kind === "vector" ? "vector" : "bitmap";
    let vector: StockVectorData | null = null;
    if (kind === "vector") {
      try {
        vector = parseSvg(readFileSync(row.local_path, "utf8"));
      } catch {
        vector = null;
      }
    }
    return {
      providerId: row.provider_id,
      kind,
      width: row.width,
      height: row.height,
      vector,
      title: row.title ?? "",
      author: row.author,
      attributionRequired: row.license === "freepik-free-attribution" || row.license === "unsplash-free",
      fromCache,
    };
  }

  /** Download (or reuse) a stock asset locally. Provider is inferred from the
   *  `providerId` prefix. Content is sniffed: real SVG → recolourable vector;
   *  PNG/other → bitmap layer. */
  async download(providerId: string, input?: StockDownloadInput): Promise<StockDownloadResult> {
    const existing = this.db
      .prepare("SELECT * FROM stock_assets WHERE provider_id = ?")
      .get(providerId) as StockAssetRow | undefined;
    if (existing) return this.toResult(existing, true);

    const provider = String(providerId.split("-")[0] ?? "") as StockProviderId;
    if (!PROVIDER_IDS.includes(provider)) throw new Error(`Unknown asset provider: ${providerId}`);

    let url: string | null = null;
    if (provider === "pixabay") {
      // Pixabay's /api/download/ endpoint 404s for many assets (verified live). The
      // search result's largeImageURL is a public CDN PNG — transparent for
      // vector/illustration types — so we download it directly, no key required.
      if (!input?.sourceUrl) throw new Error("No download URL for this Pixabay asset.");
      url = input.sourceUrl;
    } else if (provider === "unsplash") {
      // The mapped raw URL already carries sizing params (fm=jpg, w=2400).
      if (!input?.sourceUrl) throw new Error("No download URL for this Unsplash photo.");
      url = input.sourceUrl;
    } else {
      if (!input?.sourceUrl) throw new Error("No source URL for this Freepik asset.");
      url = input.sourceUrl;
    }

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed (${res.status}) — this asset may not be downloadable with your plan.`);
    const buf = Buffer.from(await res.arrayBuffer());
    const ctype = res.headers.get("content-type") ?? "";
    const head = buf.subarray(0, 1024).toString("latin1");
    const isSvg = ctype.includes("svg") || /<svg[\s>]/i.test(head);

    let ext = "png";
    if (isSvg) ext = "svg";
    else if (ctype.includes("jpeg") || ctype.includes("jpg")) ext = "jpg";
    else if (ctype.includes("webp")) ext = "webp";

    const localPath = join(this.cacheDir, `${providerId}.${ext}`);
    writeFileSync(localPath, buf);

    let kind: "vector" | "bitmap" = isSvg ? "vector" : "bitmap";
    let vector: StockVectorData | null = null;
    if (isSvg) {
      try {
        vector = parseSvg(buf.toString("utf8"));
      } catch {
        kind = "bitmap"; // unparseable SVG → keep as a bitmap layer
        ext = "png";
      }
    }
    // Rasterize unparseable SVG so the layer still renders everywhere.
    if (kind === "bitmap" && isSvg) {
      const sharp = (await import("sharp")).default;
      const png = await sharp(localPath).png().toBuffer();
      writeFileSync(localPath, png);
    }

    const width = input?.width ?? null;
    const height = input?.height ?? null;
    this.db
      .prepare(
        `INSERT OR REPLACE INTO stock_assets
           (provider_id, kind, local_path, source_url, preview_url, title, author, license, width, height, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        providerId,
        kind,
        localPath,
        url,
        input?.previewUrl ?? "",
        input?.title ?? "",
        input?.author ?? null,
        provider === "pixabay"
          ? "pixabay-free"
          : provider === "unsplash"
            ? "unsplash-free"
            : input?.attributionRequired
              ? "freepik-free-attribution"
              : "freepik-free",
        width,
        height,
        now(),
      );

    return {
      providerId,
      kind,
      width,
      height,
      vector,
      title: input?.title ?? "",
      author: input?.author ?? null,
      attributionRequired: (provider === "freepik" || provider === "unsplash") && !!input?.attributionRequired,
      fromCache: false,
    };
  }
}

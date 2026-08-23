/** AI element generation — turn a text description into a usable graphic.
 *
 *  The renderer never talks to an image provider directly. All requests go
 *  through this service in the main process, where API keys live (env vars or
 *  `userData/gen-config.json`, written only via the `gen:setApiKey` IPC).
 *
 *  Providers (switchable, persisted in gen-config.json):
 *    - `pollinations` (default) — free, no API key. GET image.pollinations.ai
 *      with the prompt; returns image bytes directly. Verified live.
 *    - `bfl` — Black Forest Labs FLUX (paid). POST /v1/flux-pro-1.1 with a
 *      Bearer key, poll /v1/get_result until Ready, download the sample URL.
 *
 *  Generated images are saved as PNG assets into the `assets` table, so they
 *  appear in the editor's "your graphics" library automatically and can be
 *  dropped onto any page like an imported graphic.
 */
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { DB } from "./db";
import { now } from "./db";

const POLLINATIONS_ENDPOINT = "https://image.pollinations.ai/prompt";
const BFL_ENDPOINT = "https://api.bfl.ai/v1/flux-pro-1.1";
const BFL_RESULT_ENDPOINT = "https://api.bfl.ai/v1/get_result";
const MAX_POLL_SECONDS = 120;

export type GenProviderId = "pollinations" | "bfl";

const PROVIDER_IDS: GenProviderId[] = ["pollinations", "bfl"];

export interface GenResult {
  ok: boolean;
  asset?: { id: string; name: string; kind: "png"; dataUri: string };
  error?: string;
}

interface GenConfig {
  provider?: GenProviderId;
  bflApiKey?: string;
}

/** Build the pollinations GET URL (pure — unit tested). */
export function pollinationsUrl(prompt: string, opts?: { width?: number; height?: number; seed?: number }): string {
  const w = opts?.width ?? 768;
  const h = opts?.height ?? 768;
  const seed = opts?.seed ?? Math.floor(Math.random() * 1_000_000);
  const params = new URLSearchParams({
    width: String(w),
    height: String(h),
    nologo: "true",
    seed: String(seed),
  });
  return `${POLLINATIONS_ENDPOINT}/${encodeURIComponent(prompt)}?${params.toString()}`;
}

/** Poll a BFL job until Ready and return the sample URL (pure — unit tested). */
export async function pollBflResult(
  id: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  maxMs = MAX_POLL_SECONDS * 1000,
): Promise<string> {
  const started = Date.now();
  for (;;) {
    const res = await fetchImpl(`${BFL_RESULT_ENDPOINT}?id=${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`FLUX status check failed (${res.status})`);
    const data = (await res.json()) as { status?: string; result?: { sample?: string }; error?: string };
    if (data.error) throw new Error(String(data.error));
    if (data.status === "Ready" && data.result?.sample) return data.result.sample;
    if (Date.now() - started > maxMs) throw new Error("FLUX generation timed out");
    await new Promise((r) => setTimeout(r, 1500));
  }
}

/** Sniff a buffer's mime type from its magic bytes. */
export function sniffImageType(buf: Buffer): "png" | "jpeg" | "webp" {
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.length > 12 && buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") {
    return "webp";
  }
  return "png";
}

export class GenService {
  private readonly db: DB;
  private readonly cacheDir: string;
  private readonly configPath: string;

  constructor(opts: { db: DB; cacheDir: string; dataDir: string }) {
    this.db = opts.db;
    this.cacheDir = join(opts.cacheDir, "gen");
    this.configPath = join(opts.dataDir, "gen-config.json");
    mkdirSync(this.cacheDir, { recursive: true });
  }

  provider(): GenProviderId {
    const cfg = this.readConfig();
    return cfg.provider === "bfl" ? "bfl" : "pollinations";
  }

  setProvider(p: string): boolean {
    if (!PROVIDER_IDS.includes(p as GenProviderId)) return false;
    const cfg = this.readConfig();
    cfg.provider = p as GenProviderId;
    this.writeConfig(cfg);
    return true;
  }

  setApiKey(provider: string, key: string): boolean {
    if (provider !== "bfl") return false;
    const cfg = this.readConfig();
    cfg.bflApiKey = key.trim();
    cfg.provider = "bfl";
    this.writeConfig(cfg);
    return true;
  }

  /** True when the active provider can generate right now. */
  configured(): boolean {
    if (this.provider() === "pollinations") return true; // free, no key
    return !!this.readConfig().bflApiKey;
  }

  private readConfig(): GenConfig {
    try {
      return JSON.parse(readFileSync(this.configPath, "utf8")) as GenConfig;
    } catch {
      return {};
    }
  }

  private writeConfig(cfg: GenConfig): void {
    try {
      writeFileSync(this.configPath, JSON.stringify(cfg), { mode: 0o600 });
    } catch {
      /* non-fatal */
    }
  }

  /** Generate an image from a description and save it into the assets library. */
  async generate(prompt: string, opts?: { width?: number; height?: number }): Promise<GenResult> {
    const clean = prompt.trim();
    if (!clean) return { ok: false, error: "Enter a description first." };

    const provider = this.provider();
    let buf: Buffer | null = null;
    try {
      if (provider === "pollinations") {
        const res = await fetch(pollinationsUrl(clean, opts));
        if (!res.ok) throw new Error(`Pollinations returned ${res.status}`);
        buf = Buffer.from(await res.arrayBuffer());
      } else {
        const key = this.readConfig().bflApiKey;
        if (!key) return { ok: false, error: "Add a Black Forest Labs API key to use FLUX." };
        const jobRes = await fetch(BFL_ENDPOINT, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: clean,
            width: opts?.width ?? 1024,
            height: opts?.height ?? 1024,
          }),
        });
        if (!jobRes.ok) throw new Error(`FLUX request failed (${jobRes.status})`);
        const job = (await jobRes.json()) as { id?: string };
        if (!job.id) throw new Error("FLUX returned no job id");
        const sample = await pollBflResult(job.id, key);
        const imgRes = await fetch(sample);
        if (!imgRes.ok) throw new Error(`FLUX image download failed (${imgRes.status})`);
        buf = Buffer.from(await imgRes.arrayBuffer());
      }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    if (!buf || buf.length === 0) return { ok: false, error: "Empty image received from provider." };

    // Normalize everything to PNG so the renderer and export treat it uniformly.
    let png = buf;
    if (sniffImageType(buf) !== "png") {
      try {
        const sharp = (await import("sharp")).default;
        png = await sharp(buf).png().toBuffer();
      } catch {
        /* keep original bytes — sharp may be unavailable in tests */
      }
    }

    const id = `gen-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const localPath = join(this.cacheDir, `${id}.png`);
    writeFileSync(localPath, png);
    const dataUri = `data:image/png;base64,${png.toString("base64")}`;

    const name = clean.slice(0, 60);
    this.db.prepare("INSERT INTO assets (id, name, kind, data, created_at) VALUES (?, ?, ?, ?, ?)").run(
      id,
      name,
      "png",
      dataUri,
      now(),
    );

    return { ok: true, asset: { id, name, kind: "png", dataUri } };
  }
}

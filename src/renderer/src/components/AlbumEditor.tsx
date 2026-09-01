import { useCallback, useEffect, useRef, useState } from "react";
import {
  Arrow,
  Ellipse,
  Group,
  Image as KImage,
  Layer,
  Line,
  Path,
  Rect,
  Stage,
  Star,
  Text as KText,
  Transformer,
} from "react-konva";
import Konva from "konva";
import type { AlbumElement, AlbumPage, CropRect, DesignAsset, PageDesign, PageSize, StockVectorData } from "@shared/api";
import { PAGE_PATTERNS, patternDataUri } from "@shared/patterns";
import { findGraphic, graphicCategory, graphicPreviewUri, GRAPHICS, type ShapeKind } from "@shared/designs";
import { coverCrop, panCropRect, reorderLayer, stageToPage, zoomCropRect, type LayerOp } from "../lib/layoutMath";
import PhotoPicker from "./PhotoPicker";
import StockPanel, { type StockDragPayload } from "./StockPanel";
import PromptModal from "./PromptModal";
import { toast } from "./Toast";
import { useFonts } from "./useFonts";

const PAGE_W = 600;

/** Page offset inside the stage (left/top margin). Drag handlers convert stage
 *  coordinates back to normalized page coordinates by subtracting this. */
const PAGE_X = 40;
const PAGE_Y = 40;

/** Map canonical filter values (brightness/saturation/hue/contrast/blur, with
 *  neutral defaults) onto Konva filters + node props. Canonical ranges keep the
 *  editor preview and the sharp export pipeline on the same numbers. */
type ImageFilter = (imageData: ImageData) => void;

/** Composite a photo (cropped) with its subject matte (destination-in) into a
 *  canvas — the masked result becomes the KImage source. Exact, no Konva filter. */
function compositeMaskedCanvas(
  photo: HTMLImageElement,
  matte: HTMLImageElement,
  cropPx: { x: number; y: number; width: number; height: number } | null,
  w: number,
  h: number,
): HTMLCanvasElement | null {
  const cw = Math.max(1, Math.round(w));
  const ch = Math.max(1, Math.round(h));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  if (cropPx) {
    ctx.drawImage(photo, cropPx.x, cropPx.y, cropPx.width, cropPx.height, 0, 0, cw, ch);
  } else {
    ctx.drawImage(photo, 0, 0, cw, ch);
  }
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(matte, 0, 0, cw, ch);
  return canvas;
}

function imageFilterProps(f?: Record<string, number>): {
  filters?: ImageFilter[];
  props: Record<string, number>;
} {
  if (!f) return { filters: undefined, props: {} };
  const filters: ImageFilter[] = [];
  const props: Record<string, number> = {};
  if (f.brightness !== undefined && f.brightness !== 1) {
    filters.push(Konva.Filters.Brighten as ImageFilter);
    props.brightness = (f.brightness - 1) * 255;
  }
  if ((f.saturation !== undefined && f.saturation !== 1) || (f.hue !== undefined && f.hue !== 0)) {
    filters.push(Konva.Filters.HSL as ImageFilter);
    if (f.saturation !== undefined) props.saturation = Math.log2(f.saturation);
    if (f.hue !== undefined) props.hue = f.hue;
  }
  if (f.contrast !== undefined && f.contrast !== 1) {
    filters.push(Konva.Filters.Contrast as ImageFilter);
    props.contrast = Math.sqrt(f.contrast) * 100 - 100;
  }
  if ((f.blur ?? 0) > 0) {
    filters.push(Konva.Filters.Blur as ImageFilter);
    props.blurRadius = f.blur * 3;
  }
  return { filters: filters.length ? filters : undefined, props };
}

function layerLabel(el: AlbumElement): string {
  if (el.type === "image") return el.photoId ? "Image" : "Image (empty)";
  if (el.type === "text") {
    const content = (el.text as { content?: string } | null)?.content ?? "";
    return `Text: ${content.slice(0, 24) || "…"}`;
  }
  if (el.type === "shape") return `Shape: ${(el.style as { shape?: string } | null)?.shape ?? "rect"}`;
  if (el.type === "graphic") return "Graphic";
  if (el.type === "stock-vector") return "Stock vector";
  if (el.type === "stock-photo") return "Stock image";
  return el.type;
}

function FilterSlider({
  label,
  min,
  max,
  step = 1,
  value,
  display,
  onChange,
  onEditStart,
  onEditEnd,
}: {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  display: (v: number) => string;
  onChange: (v: number) => void;
  onEditStart: () => void;
  onEditEnd: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-[11px] text-slate-500">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={onEditStart}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onEditEnd}
        onBlur={onEditEnd}
        className="flex-1"
      />
      <span className="w-10 text-right text-[11px] tabular-nums text-slate-500">{display(value)}</span>
    </div>
  );
}

interface LayoutOption {
  key: string;
  name: string;
}

function useLoadedImage(src?: string): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    const image = new window.Image();
    image.onload = () => {
      if (!cancelled) setImg(image);
    };
    image.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);
  return img;
}

export default function AlbumEditor({
  albumId,
  projectId,
  pages,
  pageSize,
  layouts = [],
  onPageUpdated,
  onPagesChanged,
}: {
  albumId: string;
  projectId: string;
  pages: AlbumPage[];
  pageSize: PageSize;
  layouts?: LayoutOption[];
  onPageUpdated: (page: AlbumPage) => void;
  onPagesChanged: (pages: AlbumPage[]) => void;
}) {
  const aspect = pageSize.width / pageSize.height;
  const PAGE_H = PAGE_W / aspect;
  const [pageIndex, setPageIndex] = useState(0);
  const [pagesState, setPagesState] = useState<AlbumPage[]>(pages);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<AlbumPage[][]>([]);
  const [future, setFuture] = useState<AlbumPage[][]>([]);
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState<"add" | "replace" | null>(null);
  const [prompt, setPrompt] = useState<{ title: string; initial: string; onConfirm: (v: string) => void } | null>(null);
  const [assets, setAssets] = useState<DesignAsset[]>([]);
  const [designs, setDesigns] = useState<PageDesign[]>([]);
  const [panelOpen, setPanelOpen] = useState(true);
  const [stockOpen, setStockOpen] = useState(false);
  const [stockBusy, setStockBusy] = useState(false);
  const [showGuides, setShowGuides] = useState<{ safe: boolean; trim: boolean; bleed: boolean }>({
    safe: true,
    trim: true,
    bleed: false,
  });
  const [elemQuery, setElemQuery] = useState("");
  const [elemCat, setElemCat] = useState("All");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [guides, setGuides] = useState<{ x?: number; y?: number }>({});
  const [cropModeId, setCropModeId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const srcDimsRef = useRef<Record<string, { w: number; h: number }>>({});
  const liveRef = useRef<AlbumPage[]>([]);
  const liveSnapRef = useRef<AlbumPage[] | null>(null);
  const liveDirtyRef = useRef(false);
  const autosaveTimer = useRef<number | null>(null);
  const [eventType, setEventType] = useState("wedding");
  const [suggesting, setSuggesting] = useState(false);
  const [segmenting, setSegmenting] = useState<string | null>(null);
  const [genPrompt, setGenPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genProvider, setGenProvider] = useState<"pollinations" | "bfl">("pollinations");
  const [genKey, setGenKey] = useState("");
  const [recentColors, setRecentColors] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("af-recent-colors") ?? "[]") as string[];
    } catch {
      return [];
    }
  });

  function pushColor(c: string) {
    setRecentColors((prev) => {
      const next = [c, ...prev.filter((x) => x !== c)].slice(0, 8);
      localStorage.setItem("af-recent-colors", JSON.stringify(next));
      return next;
    });
  }

  useEffect(() => {
    window.albumforge.assets.list().then(setAssets);
    window.albumforge.designs.list().then(setDesigns);
    window.albumforge.gen.provider().then((p) => {
      if (p === "pollinations" || p === "bfl") setGenProvider(p);
    });
  }, []);

  const trRef = useRef<Konva.Transformer>(null);
  const nodeRefs = useRef<Record<string, Konva.Group | null>>({});
  const fonts = useFonts();

  // Keep local page state in sync with the prop (pages load asynchronously after mount,
  // and structural changes update the parent list).
  useEffect(() => {
    setPagesState(pages);
  }, [pages]);

  // Leave crop/pan mode when switching pages.
  useEffect(() => {
    setCropModeId(null);
  }, [pageIndex]);

  const page = pagesState[pageIndex];
  const elements = page?.elements ?? [];
  const selected = elements.find((e) => e.id === [...selectedIds][selectedIds.size - 1]);
  const selectedFilters = (selected?.style as { filters?: Record<string, number> } | null)?.filters ?? {};
  const selectedBlend = (selected?.style as { blendMode?: string } | null)?.blendMode ?? "";
  const selectedMask = (selected?.style as { mask?: { kind?: string } | null } | null)?.mask?.kind === "alpha";
  const bg = (page?.background as {
    color?: string;
    pattern?: string;
    image?: { stockId?: string; title?: string; author?: string | null; attributionRequired?: boolean };
  } | null) ?? {};
  const bgColor = bg.color ?? "#fffdf8";
  const bgPattern = bg.pattern ?? null;
  const patternImg = useLoadedImage(patternDataUri(bgPattern) ?? undefined);
  const bgImg = useLoadedImage(bg.image?.stockId ? `stock://asset/${bg.image.stockId}` : undefined);
  const spread = page?.isSpread ?? false;
  const canvasW = spread ? PAGE_W * 2 : PAGE_W;

  function selectOne(id: string, additive: boolean) {
    if (additive) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      return;
    }
    setSelectedIds(new Set([id]));
    setCropModeId((c) => (c && c !== id ? null : c));
  }

  function scheduleAutosave(next: AlbumPage[]) {
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(() => {
      void persist(next);
    }, 1200);
  }

  function commit(next: AlbumPage[]) {
    setHistory((h) => [...h, pagesState]);
    setFuture([]);
    setPagesState(next);
    scheduleAutosave(next);
  }

  /** Live (no-history) element patch for high-frequency edits (crop pan/zoom). */
  function updateElementLive(elId: string, patch: Record<string, unknown>) {
    setPagesState((prev) => {
      const next = prev.map((p) =>
        p.id === page.id
          ? { ...p, elements: p.elements.map((e) => (e.id === elId ? { ...e, ...patch } : e)) }
          : p,
      );
      liveRef.current = next;
      return next;
    });
    liveDirtyRef.current = true;
  }

  /** Start a live edit — snapshot pre-edit state so undo returns to it. */
  function startLiveEdit() {
    liveSnapRef.current = pagesState;
    liveRef.current = pagesState;
    liveDirtyRef.current = false;
  }

  /** End a live edit — fold the working copy into history once and autosave. */
  function endLiveEdit() {
    const snap = liveSnapRef.current;
    liveSnapRef.current = null;
    if (!liveDirtyRef.current) return;
    liveDirtyRef.current = false;
    const next = liveRef.current;
    if (!next) return;
    setHistory((h) => [...h, ...(snap ? [snap] : [])]);
    setFuture([]);
    setPagesState(next);
    scheduleAutosave(next);
  }

  /** Inline text editing: begin editing a text element on the canvas (no dialog). */
  function beginTextEdit(el: AlbumElement) {
    startLiveEdit();
    setEditingTextId(el.id);
    setSelectedIds(new Set([el.id]));
    setDraftText((el.text as { content?: string } | null)?.content ?? "");
    requestAnimationFrame(() => textAreaRef.current?.select());
  }

  /** Commit inline text edits (Enter / blur). */
  function commitTextEdit() {
    if (!editingTextId) return;
    // Fold the live draft into history once and autosave.
    endLiveEdit();
    setEditingTextId(null);
  }

  /** Cancel inline text editing (Escape) — restore the pre-edit snapshot. */
  function cancelTextEdit() {
    if (!editingTextId) return;
    const snap = liveSnapRef.current;
    liveSnapRef.current = null;
    liveDirtyRef.current = false;
    if (snap) setPagesState(snap);
    setEditingTextId(null);
  }

  function undo() {
    if (!history.length) return;
    setFuture((f) => [pagesState, ...f]);
    setPagesState(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
  }

  function redo() {
    if (!future.length) return;
    setHistory((h) => [...h, pagesState]);
    setPagesState(future[0]);
    setFuture((f) => f.slice(1));
  }

  async function persist(targetPages: AlbumPage[]) {
    const p = targetPages[pageIndex];
    if (!p) return;
    setSaving(true);
    // Fingerprint the page right before saving. If the user edits it while the
    // save is in flight (e.g. grabs the freshly-inserted element and drags it),
    // we must NOT replace their live work with the server's stale snapshot.
    const before = JSON.stringify(p.elements.map((e) => [e.id, e.x, e.y, e.width, e.height, e.rotation, e.crop]));
    try {
      const updated = await window.albumforge.albums.savePage(albumId, p.id, {
        layoutKey: p.layoutKey,
        background: p.background,
        elements: p.elements.map((e) => ({
          id: e.id,
          type: e.type,
          z: e.z,
          x: e.x,
          y: e.y,
          width: e.width,
          height: e.height,
          rotation: e.rotation,
          photoId: e.photoId,
          crop: e.crop,
          text: e.text,
          style: e.style,
        })),
      });
      setPagesState((prev) => {
        const cur = prev.find((x) => x.id === p.id);
        if (!cur) return prev;
        const now = JSON.stringify(cur.elements.map((e) => [e.id, e.x, e.y, e.width, e.height, e.rotation, e.crop]));
        // Local edits won the race — keep the live state; the autosave loop will
        // persist them on the next quiet moment.
        if (now !== before) return prev;
        return prev.map((x) => (x.id === p.id ? updated : x));
      });
      setSelectedIds(new Set());
      onPageUpdated(updated);
      toast("Page saved");
    } finally {
      setSaving(false);
    }
  }

  function updateElement(elId: string, patch: Record<string, unknown>) {
    commit(
      pagesState.map((p) =>
        p.id === page.id ? { ...p, elements: p.elements.map((e) => (e.id === elId ? { ...e, ...patch } : e)) } : p,
      ),
    );
  }

  function mutateElements(next: AlbumElement[]) {
    const p = { ...page, elements: next };
    commit(pagesState.map((x) => (x.id === p.id ? p : x)));
    return pagesState.map((x) => (x.id === p.id ? p : x));
  }

  function addPhoto(photoId: string) {
    const maxZ = elements.reduce((m, e) => Math.max(m, e.z), -1);
    const el: AlbumElement = {
      id: `new-${Date.now()}`,
      type: "image",
      z: maxZ + 1,
      x: 0.1,
      y: 0.1,
      width: 0.8,
      height: 0.8,
      rotation: 0,
      photoId,
      crop: null,
      text: null,
      style: null,
    };
    void persist(mutateElements([...elements, el]));
    setPicker(null);
  }

  function replacePhoto(photoId: string) {
    if (!selected) return;
    void persist(
      pagesState.map((p) =>
        p.id === page.id
          ? { ...p, elements: p.elements.map((e) => (e.id === selected.id ? { ...e, photoId, crop: null } : e)) }
          : p,
      ),
    );
    setPicker(null);
  }

  function deleteSelected() {
    if (selectedIds.size === 0) return;
    void persist(
      pagesState.map((p) =>
        p.id === page.id ? { ...p, elements: p.elements.filter((e) => !selectedIds.has(e.id)) } : p,
      ),
    );
    setSelectedIds(new Set());
    setEditingTextId(null);
  }

  /** Free-form drag with optional Shift-to-snap. Stage coordinates (which
   *  include the page offset) are converted to normalized page space and the
   *  element is live-synced on every move, so re-renders apply the current
   *  position instead of resetting the dragged node to a stale value. */
  function dragElement(node: Konva.Group, el: AlbumElement, shiftKey: boolean) {
    const w = el.width;
    const h = el.height;
    const { x, y } = stageToPage(node.x(), node.y(), PAGE_X, PAGE_Y, canvasW, PAGE_H);
    let gx: number | undefined;
    let gy: number | undefined;
    if (shiftKey) {
      const SNAP = 6 / canvasW;
      const others = elements.filter((e) => e.id !== el.id && !selectedIds.has(e.id));
      const targetsX = [0, 0.5, 1, ...others.flatMap((e) => [e.x, e.x + e.width, e.x + e.width / 2])];
      const targetsY = [0, 0.5, 1, ...others.flatMap((e) => [e.y, e.y + e.height, e.y + e.height / 2])];
      for (const t of targetsX) {
        for (const [off, val] of [[0, x], [w, x + w], [w / 2, x + w / 2]] as const) {
          if (Math.abs(val - t) < SNAP) {
            gx = t - off;
            node.x(gx * canvasW + PAGE_X);
          }
        }
      }
      for (const t of targetsY) {
        for (const [off, val] of [[0, y], [h, y + h], [h / 2, y + h / 2]] as const) {
          if (Math.abs(val - t) < SNAP) {
            gy = t - off;
            node.y(gy * PAGE_H + PAGE_Y);
          }
        }
      }
    }
    updateElementLive(el.id, stageToPage(node.x(), node.y(), PAGE_X, PAGE_Y, canvasW, PAGE_H));
    setGuides((g) => (g.x === gx && g.y === gy ? g : { x: gx, y: gy }));
  }

  function alignSel(mode: "left" | "centerH" | "right" | "top" | "middleV" | "bottom") {
    const sels = elements.filter((e) => selectedIds.has(e.id));
    if (sels.length === 0) return;
    const minX = Math.min(...sels.map((e) => e.x));
    const maxX = Math.max(...sels.map((e) => e.x + e.width));
    const minY = Math.min(...sels.map((e) => e.y));
    const maxY = Math.max(...sels.map((e) => e.y + e.height));
    const next = elements.map((e) => {
      if (!selectedIds.has(e.id)) return e;
      const box = { x: e.x, y: e.y };
      if (mode === "left") box.x = minX;
      if (mode === "right") box.x = maxX - e.width;
      if (mode === "centerH") box.x = (minX + maxX) / 2 - e.width / 2;
      if (mode === "top") box.y = minY;
      if (mode === "bottom") box.y = maxY - e.height;
      if (mode === "middleV") box.y = (minY + maxY) / 2 - e.height / 2;
      return { ...e, ...box };
    });
    commit(pagesState.map((p) => (p.id === page.id ? { ...p, elements: next } : p)));
  }

  /** Current zoom factor (1× = full cover crop) of an image element. */
  function cropZoomValue(el: AlbumElement): number {
    const dims = srcDimsRef.current[el.id];
    if (!dims) return 1;
    const cover = coverCrop(dims.w, dims.h, el.width * canvasW, el.height * PAGE_H);
    const cur = el.crop ?? cover;
    return Math.max(1, cover.width / (cur.width || cover.width));
  }

  /** Zoom an image's crop around its centre (1× = full object-fit cover frame). */
  function setCropZoom(el: AlbumElement, zoom: number) {
    const dims = srcDimsRef.current[el.id];
    if (!dims) return;
    const cover = coverCrop(dims.w, dims.h, el.width * canvasW, el.height * PAGE_H);
    const cur = el.crop ?? cover;
    updateElementLive(el.id, { crop: zoomCropRect(cur, cover, zoom) });
  }

  /** Return an image to the automatic object-fit cover crop. */
  function resetCrop(el: AlbumElement) {
    updateElement(el.id, { crop: null });
    setCropModeId(null);
  }

  /** On-device subject cutout: segment the selected photo and mask the element. */
  async function removeBackground() {
    if (!selected || selected.type !== "image" || !selected.photoId) return;
    // Toggle off when the subject is already isolated.
    if (selectedMask) {
      updateElement(selected.id, { style: { ...(selected.style ?? {}), mask: undefined } });
      toast("Background restored");
      return;
    }
    setSegmenting(selected.id);
    try {
      const res = await window.albumforge.photos.segment(selected.photoId);
      if (res.ok) {
        updateElement(selected.id, {
          style: { ...(selected.style ?? {}), mask: { kind: "alpha" } },
        });
        toast("Background removed — layer ornaments behind the subject");
      } else {
        toast(`Segmentation failed: ${res.error ?? "unknown error"}`);
      }
    } finally {
      setSegmenting(null);
    }
  }

  const FILTER_DEFAULTS: Record<string, number> = { brightness: 1, saturation: 1, hue: 0, contrast: 1, blur: 0 };

  /** Live-edit a single filter channel (dropped from the stored object at its neutral value). */
  function setFilter(elId: string, key: string, value: number) {
    const el = elements.find((e) => e.id === elId);
    const f = { ...((el?.style as { filters?: Record<string, number> } | null)?.filters ?? {}) };
    if (Math.abs(value - (FILTER_DEFAULTS[key] ?? 0)) < 1e-4) delete f[key];
    else f[key] = value;
    updateElementLive(elId, {
      style: { ...(el?.style ?? {}), filters: Object.keys(f).length ? f : undefined },
    });
  }

  /** Drop a dragged photo onto a specific position on the page. */
  function addPhotoAt(photoId: string, x: number, y: number, width: number, height: number) {
    const maxZ = elements.reduce((m, e) => Math.max(m, e.z), -1);
    const el: AlbumElement = {
      id: `new-${Date.now()}`,
      type: "image",
      z: maxZ + 1,
      x,
      y,
      width,
      height,
      rotation: 0,
      photoId,
      crop: null,
      text: null,
      style: null,
    };
    void persist(mutateElements([...elements, el]));
  }

  /** Module 7: place a stock asset (from the Elements panel) on the page.
   *  `center` is the drop point in page-normalised coordinates; the element is
   *  sized from the asset's aspect and centred there. SVGs arrive from the main
   *  process already parsed into recolourable path groups. */
  async function addStockAsset(payload: StockDragPayload, center?: { x: number; y: number }) {
    setStockBusy(true);
    try {
      const res = await window.albumforge.stock.download(payload.providerId, {
        sourceUrl: payload.sourceUrl,
        title: payload.title,
        kind: payload.kind,
        author: payload.author,
        attributionRequired: payload.attributionRequired,
        width: payload.width,
        height: payload.height,
      });
      if (res.error) {
        toast(res.error);
        return;
      }
      const isVector = res.kind === "vector" && !!res.vector;
      const natW = isVector ? res.vector!.width : res.width;
      const natH = isVector ? res.vector!.height : res.height;
      const aspect = natW && natH ? natW / natH : 1;
      const h = 0.5;
      const w = Math.min(0.92, Math.max(0.2, h * aspect));
      const cx = center ? Math.min(Math.max(center.x, 0), 1) : 0.5;
      const cy = center ? Math.min(Math.max(center.y, 0), 1) : 0.5;
      const x = Math.min(Math.max(cx - w / 2, 0), 1 - w);
      const y = Math.min(Math.max(cy - h / 2, 0), 1 - h);
      const maxZ = elements.reduce((m, e) => Math.max(m, e.z), -1);
      const style: Record<string, unknown> = isVector
        ? {
            stockId: res.providerId,
            title: res.title,
            author: res.author,
            attributionRequired: res.attributionRequired,
            width: res.vector!.width,
            height: res.vector!.height,
            opacity: 1,
            vector: res.vector,
          }
        : {
            stockId: res.providerId,
            title: res.title,
            author: res.author,
            attributionRequired: res.attributionRequired,
            width: res.width,
            height: res.height,
            opacity: 1,
          };
      const el: AlbumElement = {
        id: `new-${Date.now()}`,
        type: isVector ? "stock-vector" : "stock-photo",
        z: maxZ + 1,
        x,
        y,
        width: w,
        height: h,
        rotation: 0,
        photoId: null,
        crop: null,
        text: null,
        style,
      };
      void persist(mutateElements([...elements, el]));
    } catch (e) {
      toast(`Could not add asset: ${String(e)}`);
    } finally {
      setStockBusy(false);
    }
  }

  /** Place a parsed SVG (from the local assets library) as a recolourable vector element. */
  function addParsedVectorElement(vector: StockVectorData, title: string) {
    const aspect = vector.width / Math.max(1, vector.height);
    const h = 0.5;
    const w = Math.min(0.92, Math.max(0.2, h * aspect));
    const maxZ = elements.reduce((m, e) => Math.max(m, e.z), -1);
    const el: AlbumElement = {
      id: `new-${Date.now()}`,
      type: "stock-vector",
      z: maxZ + 1,
      x: (1 - w) / 2,
      y: (1 - h) / 2,
      width: w,
      height: h,
      rotation: 0,
      photoId: null,
      crop: null,
      text: null,
      style: {
        stockId: `imported-${Date.now()}`,
        title,
        author: null,
        attributionRequired: false,
        width: vector.width,
        height: vector.height,
        opacity: 1,
        vector,
      },
    };
    void persist(mutateElements([...elements, el]));
  }

  /** Smart Frame drag-and-drop: photo dropped onto a frame → replace with cover-crop; empty canvas → add. */
  function handleCanvasDrop(e: React.DragEvent) {
    e.preventDefault();
    const rawStock = e.dataTransfer.getData("application/x-albumforge-stock");
    if (rawStock) {
      let data: StockDragPayload;
      try {
        data = JSON.parse(rawStock) as StockDragPayload;
      } catch {
        return;
      }
      const stage = stageRef.current;
      if (!stage) return;
      const rect = stage.container().getBoundingClientRect();
      const inv = stage.getAbsoluteTransform().copy().invert();
      const pos = inv.point({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      if (data.mode === "background") {
        void applyStockBackground(data);
      } else {
        void addStockAsset(data, { x: (pos.x - 40) / canvasW, y: (pos.y - 40) / PAGE_H });
      }
      return;
    }
    const raw = e.dataTransfer.getData("application/x-albumforge-photo");
    if (!raw) return;
    let data: { id: string; w?: number | null; h?: number | null };
    try {
      data = JSON.parse(raw) as { id: string; w?: number | null; h?: number | null };
    } catch {
      return;
    }
    const stage = stageRef.current;
    if (!stage || !data.id) return;

    // Map the screen drop point into stage-local coordinates (accounts for zoom + pan).
    const rect = stage.container().getBoundingClientRect();
    const inv = stage.getAbsoluteTransform().copy().invert();
    const pos = inv.point({ x: e.clientX - rect.left, y: e.clientY - rect.top });

    // Smart frame hit test — walk up from the topmost shape to the owning element group.
    let hitEl: AlbumElement | undefined;
    const top = stage.getIntersection(pos);
    let n: Konva.Node | null = top;
    while (n && n !== stage) {
      const nid = n.id();
      if (nid && elements.some((el) => el.id === nid)) {
        hitEl = elements.find((el) => el.id === nid);
        break;
      }
      n = n.getParent();
    }

    // 1) Dropped onto a frame → replace the photo; crop: null = auto object-fit cover.
    if (hitEl?.type === "image") {
      void persist(
        pagesState.map((p) =>
          p.id === page.id
            ? {
                ...p,
                elements: p.elements.map((x) => (x.id === hitEl!.id ? { ...x, photoId: data.id, crop: null } : x)),
              }
            : p,
        ),
      );
      setPicker(null);
      return;
    }

    // 2) Replace mode with an active selection → replace it in place.
    if (picker === "replace" && selected) {
      void persist(
        pagesState.map((p) =>
          p.id === page.id
            ? {
                ...p,
                elements: p.elements.map((x) => (x.id === selected.id ? { ...x, photoId: data.id, crop: null } : x)),
              }
            : p,
        ),
      );
      setPicker(null);
      return;
    }

    // 3) Dropped on empty canvas → add a new photo centred on the drop point.
    const pw = data.w ?? 1;
    const ph = data.h ?? 1;
    const newH = 0.5;
    const newW = Math.max(0.2, Math.min(0.92, (newH * PAGE_H * pw) / (ph * canvasW)));
    const px = Math.min(Math.max((pos.x - 40) / canvasW - newW / 2, 0), 1 - newW);
    const py = Math.min(Math.max((pos.y - 40) / PAGE_H - newH / 2, 0), 1 - newH);
    addPhotoAt(data.id, px, py, newW, newH);
    setPicker(null);
  }

  function addText() {
    const maxZ = elements.reduce((m, e) => Math.max(m, e.z), -1);
    const el: AlbumElement = {
      id: `new-${Date.now()}`,
      type: "text",
      z: maxZ + 1,
      x: 0.25,
      y: 0.45,
      width: 0.5,
      height: 0.1,
      rotation: 0,
      photoId: null,
      crop: null,
      text: { content: "Double-click to edit" },
      style: { color: "#000000", fontSize: 28 },
    };
    void persist(mutateElements([...elements, el]));
  }

  function addShape(shape: ShapeKind) {
    const maxZ = elements.reduce((m, e) => Math.max(m, e.z), -1);
    const dims: Record<ShapeKind, [number, number, number, number]> = {
      rect: [0.25, 0.25, 0.3, 0.3],
      ellipse: [0.25, 0.25, 0.3, 0.3],
      star: [0.3, 0.25, 0.25, 0.25],
      line: [0.2, 0.48, 0.6, 0.03],
      arrow: [0.2, 0.46, 0.6, 0.08],
    };
    const [x, y, w, h] = dims[shape];
    const el: AlbumElement = {
      id: `new-${Date.now()}`,
      type: "shape",
      z: maxZ + 1,
      x,
      y,
      width: w,
      height: h,
      rotation: 0,
      photoId: null,
      crop: null,
      text: null,
      style: { shape, fill: "#d6b06f", stroke: "#9b6a2d", strokeWidth: 2, opacity: 1, radius: 8 },
    };
    void persist(mutateElements([...elements, el]));
  }

  async function addGraphic(graphicId: string) {
    const maxZ = elements.reduce((m, e) => Math.max(m, e.z), -1);
    let w = 0.4;
    let h = 0.4;
    let style: Record<string, unknown> = {};
    if (graphicId.startsWith("asset:")) {
      const asset = assets.find((a) => a.id === graphicId.slice(6));
      if (!asset) return;
      // Imported SVGs get parsed into recolourable vector paths (the same pipeline
      // the stock panel uses), so every colour is independently editable.
      if (asset.kind === "svg") {
        try {
          const comma = asset.dataUri.indexOf(",");
          const svgText = decodeURIComponent(asset.dataUri.slice(comma + 1));
          const vector = await window.albumforge.stock.parseSvg(svgText);
          addParsedVectorElement(vector, asset.name);
        } catch {
          toast("Could not parse this SVG into recolourable paths.");
        }
        return;
      }
      style = { graphicId, assetUri: asset.dataUri, color: null, opacity: 1 };
    } else {
      const g = findGraphic(graphicId);
      if (!g) return;
      h = w * (g.h / g.w);
      style = { graphicId, color: "#b17e36", opacity: 1 };
    }
    const el: AlbumElement = {
      id: `new-${Date.now()}`,
      type: "graphic",
      z: maxZ + 1,
      x: 0.3,
      y: (1 - h) / 2,
      width: w,
      height: h,
      rotation: 0,
      photoId: null,
      crop: null,
      text: null,
      style,
    };
    void persist(mutateElements([...elements, el]));
  }

  async function importAssets() {
    const paths = await window.albumforge.dialogs.chooseAssets();
    if (!paths || paths.length === 0) return;
    await window.albumforge.assets.importAssets(paths);
    setAssets(await window.albumforge.assets.list());
  }

  function saveDesign() {
    setPrompt({
      title: "Save page as design",
      initial: "My design",
      onConfirm: async (name) => {
        if (!name.trim()) return;
        await window.albumforge.designs.save(name.trim(), {
          layoutKey: page.layoutKey,
          background: page.background,
          elements: page.elements.map((e, i) => ({
            id: e.id ?? `design-${Date.now()}-${i}`,
            type: e.type,
            z: e.z,
            x: e.x,
            y: e.y,
            width: e.width,
            height: e.height,
            rotation: e.rotation,
            photoId: e.type === "image" ? null : e.photoId,
            crop: e.type === "image" ? null : e.crop,
            text: e.text,
            style: e.style,
          })),
        });
        setDesigns(await window.albumforge.designs.list());
      },
    });
  }

  async function applyDesign(designId: string) {
    const d = await window.albumforge.designs.get(designId);
    if (!d || !page) return;
    const keepImages = elements.filter((e) => e.type === "image");
    const designImages = (d.elements ?? []).filter((e) => e.type === "image");
    const merged = (d.elements ?? []).map((e) => {
      if (e.type === "image") {
        const photo = keepImages[Math.min(designImages.indexOf(e), keepImages.length - 1)];
        if (photo && designImages.indexOf(e) < keepImages.length) {
          return { ...e, photoId: photo.photoId, crop: photo.crop };
        }
        return { ...e, photoId: null, crop: null };
      }
      return e;
    });
    const updated = await window.albumforge.albums.savePage(albumId, page.id, {
      layoutKey: page.layoutKey,
      background: d.background,
      elements: merged.map((e, i) => ({ ...e, id: e.id ?? `design-${Date.now()}-${i}`, z: e.z ?? 0 })),
    });
    setPagesState((prev) => prev.map((p) => (p.id === page.id ? updated : p)));
    setSelectedIds(new Set());
    onPageUpdated(updated);
  }

  /** Apply a stacking operation to a layer (front/back/forward/backward). */
  function layerOp(id: string, op: LayerOp) {
    const next = reorderLayer(elements, id, op);
    if (next === elements) return;
    commit(pagesState.map((p) => (p.id === page.id ? { ...p, elements: next } : p)));
  }

  async function changeLayout(layoutKey: string) {
    if (!page) return;
    const updated = await window.albumforge.albums.recomposePage(albumId, page.id, layoutKey);
    setPagesState((prev) => prev.map((p) => (p.id === page.id ? updated : p)));
    setSelectedIds(new Set());
    onPageUpdated(updated);
  }

  function setBackground(color: string) {
    const p = { ...page, background: { color, pattern: bgPattern, image: bg.image } };
    setPagesState((prev) => prev.map((x) => (x.id === p.id ? p : x)));
    void persist(pagesState.map((x) => (x.id === p.id ? p : x)));
  }

  function setPattern(patternId: string) {
    const p = { ...page, background: { color: bgColor, pattern: patternId || null, image: bg.image } };
    setPagesState((prev) => prev.map((x) => (x.id === p.id ? p : x)));
    void persist(pagesState.map((x) => (x.id === p.id ? p : x)));
  }

  /** Apply a downloaded stock photo as the page background (cover-cropped, print-safe). */
  async function applyStockBackground(payload: StockDragPayload) {
    setStockBusy(true);
    try {
      const res = await window.albumforge.stock.download(payload.providerId, {
        sourceUrl: payload.sourceUrl,
        title: payload.title,
        kind: payload.kind,
        author: payload.author,
        attributionRequired: payload.attributionRequired,
        width: payload.width,
        height: payload.height,
      });
      if (res.error) {
        toast(res.error);
        return;
      }
      const p = {
        ...page,
        background: {
          color: bgColor,
          pattern: bgPattern,
          image: {
            stockId: res.providerId,
            title: res.title,
            author: res.author,
            attributionRequired: res.attributionRequired,
          },
        },
      };
      setPagesState((prev) => prev.map((x) => (x.id === p.id ? p : x)));
      void persist(pagesState.map((x) => (x.id === p.id ? p : x)));
      toast("Background applied — layer photos & ornaments on top");
    } catch (e) {
      toast(`Could not apply background: ${String(e)}`);
    } finally {
      setStockBusy(false);
    }
  }

  function removeStockBackground() {
    const { image: _drop, ...rest } = (page?.background ?? {}) as Record<string, unknown>;
    const p = { ...page, background: rest };
    setPagesState((prev) => prev.map((x) => (x.id === p.id ? p : x)));
    void persist(pagesState.map((x) => (x.id === p.id ? p : x)));
  }

  /** Apply an AI design suggestion (palette + event rules) to the current page. */
  async function applySuggestion() {
    const photoIds = elements.filter((e) => e.type === "image" && e.photoId).map((e) => e.photoId as string);
    setSuggesting(true);
    try {
      const sugg = await window.albumforge.recommend.suggest(photoIds, eventType);
      let nextElements = elements.map((e, i) => {
        // Retitle the first text element with the suggested display font.
        if (e.type === "text" && elements.findIndex((x) => x.type === "text") === i) {
          return { ...e, style: { ...(e.style ?? {}), fontFamily: sugg.titleFont } };
        }
        return e;
      });
      if (sugg.ornament) {
        const maxZ = elements.reduce((m, e) => Math.max(m, e.z), -1);
        nextElements = [
          ...nextElements,
          {
            id: `new-${Date.now()}`,
            type: "graphic" as const,
            z: maxZ + 1,
            x: sugg.ornament.x,
            y: sugg.ornament.y,
            width: sugg.ornament.width,
            height: sugg.ornament.height,
            rotation: 0,
            photoId: null,
            crop: null,
            text: null,
            style: {
              graphicId: sugg.ornament.graphicId,
              color: sugg.ornament.color,
              opacity: sugg.ornament.opacity,
            },
          },
        ];
      }
      const p = { ...page, background: { color: sugg.background.color, pattern: sugg.background.pattern, image: bg.image } };
      commit(pagesState.map((x) => (x.id === p.id ? { ...p, elements: nextElements } : x)));
      toast(`Suggested: ${sugg.rationale}`);
    } catch {
      toast("Couldn't generate a suggestion");
    } finally {
      setSuggesting(false);
    }
  }

  /** AI element generation: describe a graphic → generate → add to page + library. */
  async function generateElement() {
    const prompt = genPrompt.trim();
    if (!prompt) {
      toast("Describe the element you want first.");
      return;
    }
    setGenerating(true);
    try {
      const res = await window.albumforge.gen.generate(prompt);
      if (!res.ok || !res.asset) {
        toast(res.error ?? "Generation failed");
        return;
      }
      // Refresh the library so the new graphic shows in "your graphics".
      setAssets(await window.albumforge.assets.list());
      addGraphic(`asset:${res.asset.id}`);
      toast(`Generated “${res.asset.name}” — saved to your graphics library`);
      setGenPrompt("");
    } catch (e) {
      toast(`Generation failed: ${String(e)}`);
    } finally {
      setGenerating(false);
    }
  }

  async function addPage() {
    const newPage = await window.albumforge.albums.addPage(albumId);
    const next = [...pagesState, newPage];
    setPagesState(next);
    onPagesChanged(next);
    setPageIndex(next.length - 1);
  }

  async function duplicatePage() {
    if (!page) return;
    const dup = await window.albumforge.albums.duplicatePage(albumId, page.id);
    const next = [...pagesState, dup];
    setPagesState(next);
    onPagesChanged(next);
    setPageIndex(next.length - 1);
  }

  async function deletePage() {
    if (!page) return;
    if (!window.confirm(`Delete page ${pageIndex + 1}?`)) return;
    await window.albumforge.albums.deletePage(albumId, page.id);
    const next = pagesState.filter((p) => p.id !== page.id).map((p, i) => ({ ...p, index: i }));
    setPagesState(next);
    onPagesChanged(next);
    setSelectedIds(new Set());
    setPageIndex((i) => Math.min(i, Math.max(0, next.length - 1)));
  }

  const onTransformEnd = useCallback(
    (el: { id: string }) => (e: Konva.KonvaEventObject<Event>) => {
      const node = e.target as Konva.Group;
      updateElement(el.id, {
        ...stageToPage(node.x(), node.y(), PAGE_X, PAGE_Y, canvasW, PAGE_H),
        width: (node.width() * node.scaleX()) / canvasW,
        height: (node.height() * node.scaleY()) / PAGE_H,
        rotation: node.rotation(),
      });
      node.scaleX(1);
      node.scaleY(1);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page?.id, PAGE_H, canvasW, pagesState],
  );

  const onDragEnd = useCallback(
    (el: { id: string }) => (e: Konva.KonvaEventObject<DragEvent>) => {
      const node = e.target as Konva.Group;
      updateElement(el.id, stageToPage(node.x(), node.y(), PAGE_X, PAGE_Y, canvasW, PAGE_H));
      setGuides({});
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page?.id, PAGE_H, canvasW, pagesState],
  );

  useEffect(() => {
    if (trRef.current) {
      const nodes = cropModeId || editingTextId
        ? []
        : [...selectedIds]
            .map((id) => nodeRefs.current[id])
            .filter((n): n is Konva.Group => !!n);
      trRef.current.nodes(nodes);
    }
  }, [selectedIds, elements, pageIndex, cropModeId, editingTextId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const editing =
        !!t &&
        (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (editing) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (e.key === "Escape" && (cropModeId || editingTextId)) {
        e.preventDefault();
        if (editingTextId) cancelTextEdit();
        else setCropModeId(null);
      } else if (mod && e.key === "]") {
        e.preventDefault();
        if (selected) layerOp(selected.id, e.shiftKey ? "front" : "forward");
      } else if (mod && e.key === "[") {
        e.preventDefault();
        if (selected) layerOp(selected.id, e.shiftKey ? "back" : "backward");
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.size > 0) {
        e.preventDefault();
        deleteSelected();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!page) return null;

  const safeInset = canvasW * 0.05;
  // Physical 3 mm bleed projected into canvas pixels, so the guide lands where
  // print trim actually is relative to the bleed edge.
  const pxPerUnit = PAGE_W / pageSize.width;
  const bleedPx = (pageSize.unit === "in" ? 3 / 25.4 : 3) * pxPerUnit;

  return (
    <div className="flex flex-col gap-3">
      {/* Top bar */}
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200/60 bg-surface/85 p-2 shadow-sm backdrop-blur">
        <div className="flex items-center gap-1">
          <button onClick={() => setPageIndex((i) => Math.max(0, i - 1))} className="btn-ghost !px-2" title="Previous page">
            ←
          </button>
          <span className="chip !border-0 !bg-slate-100">
            Page {pageIndex + 1} / {pagesState.length}
          </span>
          <button onClick={() => setPageIndex((i) => Math.min(pagesState.length - 1, i + 1))} className="btn-ghost !px-2" title="Next page">
            →
          </button>
          <button onClick={addPage} className="btn-secondary !px-3 !py-1.5">
            + Page
          </button>
          <button onClick={duplicatePage} className="btn-ghost">
            Duplicate
          </button>
          <button onClick={deletePage} className="btn-ghost !text-red-500 hover:!bg-red-50">
            Delete
          </button>
        </div>

        <div className="mx-1 h-6 w-px bg-slate-200" />

        <div className="flex flex-wrap items-center gap-1.5">
          <button onClick={() => setPicker("add")} className="btn-primary !px-3 !py-1.5">
            Add photo
          </button>
          <button onClick={addText} className="btn-secondary !px-3 !py-1.5">
            Text
          </button>

        <select
          value=""
          onChange={(e) => {
            if (e.target.value) addShape(e.target.value as ShapeKind);
          }}
          className="input !w-auto !px-2 !py-1 text-sm"
          title="Add shape"
        >
          <option value="">Add shape…</option>
          <option value="rect">Rectangle</option>
          <option value="ellipse">Ellipse</option>
          <option value="line">Line</option>
          <option value="arrow">Arrow</option>
          <option value="star">Star</option>
        </select>

        <select
          value=""
          onChange={(e) => {
            if (e.target.value) addGraphic(e.target.value);
          }}
          className="input !w-auto !px-2 !py-1 text-sm"
          title="Add graphic"
        >
          <option value="">Add graphic…</option>
          {GRAPHICS.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
          {assets.length > 0 && <option disabled>— your graphics —</option>}
          {assets.map((a) => (
            <option key={a.id} value={`asset:${a.id}`}>
              {a.name}
            </option>
          ))}
        </select>

          <button onClick={importAssets} className="btn-secondary !px-2.5 !py-1.5 text-xs" title="Import SVG or PNG graphics">
            Import…
          </button>

          <button
            onClick={() => setStockOpen((o) => !o)}
            className={`btn-secondary !px-2.5 !py-1.5 text-xs ${stockOpen ? "!border-indigo-500 !bg-indigo-50 !text-indigo-600" : ""}`}
            title="Search Freepik stock assets (vectors + PNGs)"
          >
            {stockBusy ? "Downloading…" : "Elements"}
          </button>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Guides</span>
          {(["safe", "trim", "bleed"] as const).map((g) => (
            <button
              key={g}
              onClick={() => setShowGuides((s) => ({ ...s, [g]: !s[g] }))}
              className={`chip !px-2 !py-0.5 text-[10px] ${
                showGuides[g] ? "!border-indigo-500 !bg-indigo-50 !text-indigo-600" : ""
              }`}
              title={`Toggle ${g} guide`}
            >
              {g}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={undo} className="btn-ghost" title="Undo (Ctrl+Z)">
            Undo
          </button>
          <button onClick={redo} className="btn-ghost" title="Redo (Ctrl+Y)">
            Redo
          </button>
          <button onClick={() => persist(pagesState)} disabled={saving} className="btn-primary !px-4 !py-1.5">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {/* Workspace */}
      <div className="flex h-[calc(100vh-150px)] gap-3">
        <aside
          className={`${stockOpen ? "w-72" : "w-44"} shrink-0 overflow-y-auto rounded-2xl border border-slate-200/60 bg-surface/70 p-2 transition-all duration-150`}
        >
          <div className="mb-2 border-b border-slate-100 pb-2">
            <button
              onClick={() => setStockOpen((o) => !o)}
              className="flex w-full items-center justify-between px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-600"
            >
              <span>Elements</span>
              <span>{stockOpen ? "▾" : "▸"}</span>
            </button>
            {stockOpen && (
              <div className="pt-1">
                <StockPanel
                  onAdd={(p, m) => (m === "background" ? void applyStockBackground(p) : void addStockAsset(p))}
                />
              </div>
            )}
          </div>
          <div className="flex items-center justify-between px-1 pb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Pages</span>
            <button onClick={addPage} className="btn-ghost !px-1.5 !py-0.5 text-base" title="Add page">
              +
            </button>
          </div>
          <div className="space-y-2">
            {pagesState.map((p, i) => (
              <button
                key={p.id}
                onClick={() => setPageIndex(i)}
                className={`group w-full overflow-hidden rounded-xl border-2 text-left transition-all duration-150 ${
                  i === pageIndex ? "border-indigo-500 shadow-md" : "border-transparent hover:border-slate-300"
                }`}
              >
                <MiniPage page={p} aspect={aspect} />
                <div className="flex items-center justify-between bg-surface px-1.5 py-1 text-[10px] font-medium text-slate-400">
                  <span>
                    {p.isSpread ? "Spread" : "Page"} {i + 1}
                  </span>
                  {i === 0 && <span className="rounded bg-indigo-50 px-1 text-indigo-500">Cover</span>}
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section
          className="flex flex-1 items-center justify-center overflow-auto rounded-2xl bg-neutral-200/90 p-6"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleCanvasDrop}
        >
          <div className="relative shadow-2xl shadow-slate-900/20">
        <Stage
          ref={stageRef}
          width={canvasW + 80}
          height={PAGE_H + 80}
          scaleX={zoom}
          scaleY={zoom}
          x={pan.x}
          y={pan.y}
          draggable
          onDragEnd={(e) => setPan({ x: e.target.x(), y: e.target.y() })}
          onWheel={(e) => {
            e.evt.preventDefault();
            const next = e.evt.deltaY < 0 ? zoom * 1.15 : zoom / 1.15;
            setZoom(Math.max(0.4, Math.min(3, +(next.toFixed(2)))));
          }}
        >
          <Layer>
            <Rect
              x={40}
              y={40}
              width={canvasW}
              height={PAGE_H}
              fill={bgColor}
              stroke="#ccc"
              onClick={() => {
                setSelectedIds(new Set());
                setCropModeId(null);
              }}
            />
            {patternImg && (
              <Rect
                x={40}
                y={40}
                width={canvasW}
                height={PAGE_H}
                fillPatternImage={patternImg}
                fillPatternRepeat="repeat"
                listening={false}
              />
            )}
            {bgImg && (() => {
              // object-fit: cover — centre-crop the stock background to the page.
              const sw = bgImg.naturalWidth;
              const sh = bgImg.naturalHeight;
              const na = canvasW / PAGE_H;
              const sa = sw / sh;
              const crop = sa > na
                ? { x: (sw - sh * na) / 2, y: 0, width: sh * na, height: sh }
                : { x: 0, y: (sh - sw / na) / 2, width: sw, height: sw / na };
              return <KImage image={bgImg} x={40} y={40} width={canvasW} height={PAGE_H} crop={crop} listening={false} />;
            })()}
            {showGuides.bleed && (
              <Line
                points={[
                  40 - bleedPx, 40 - bleedPx,
                  40 + canvasW + bleedPx, 40 - bleedPx,
                  40 + canvasW + bleedPx, 40 + PAGE_H + bleedPx,
                  40 - bleedPx, 40 + PAGE_H + bleedPx,
                  40 - bleedPx, 40 - bleedPx,
                ]}
                stroke="#f43f5e"
                strokeWidth={1.5}
                dash={[6, 4]}
                listening={false}
              />
            )}
            {showGuides.trim && (
              <Rect
                x={40}
                y={40}
                width={canvasW}
                height={PAGE_H}
                stroke="#0ea5e9"
                strokeWidth={1.5}
                dash={[8, 6]}
                listening={false}
              />
            )}
            {showGuides.safe && (
              <Line
                points={[
                  40 + safeInset, 40 + safeInset,
                  40 + canvasW - safeInset, 40 + safeInset,
                  40 + canvasW - safeInset, 40 + PAGE_H - safeInset,
                  40 + safeInset, 40 + PAGE_H - safeInset,
                  40 + safeInset, 40 + safeInset,
                ]}
                stroke="#5b5bd6"
                dash={[6, 4]}
                listening={false}
              />
            )}
            {spread && (
              <>
                <Line
                  points={[40 + canvasW / 2, 40, 40 + canvasW / 2, 40 + PAGE_H]}
                  stroke="#e11d48"
                  strokeWidth={1.5}
                  dash={[8, 5]}
                  listening={false}
                />
                <Rect
                  x={40 + canvasW / 2 - canvasW * 0.012}
                  y={40}
                  width={canvasW * 0.024}
                  height={PAGE_H}
                  fill="rgba(225, 29, 72, 0.06)"
                  listening={false}
                />
              </>
            )}
            {guides.x !== undefined && (
              <Line
                points={[40 + guides.x * canvasW, 40, 40 + guides.x * canvasW, 40 + PAGE_H]}
                stroke="#f43f5e"
                strokeWidth={1}
                dash={[4, 4]}
                listening={false}
              />
            )}
            {guides.y !== undefined && (
              <Line
                points={[40, 40 + guides.y * PAGE_H, 40 + canvasW, 40 + guides.y * PAGE_H]}
                stroke="#f43f5e"
                strokeWidth={1}
                dash={[4, 4]}
                listening={false}
              />
            )}
            {elements.map((el) => {
              const cropMode = cropModeId === el.id;
              return (
                <ElementNode
                  key={el.id}
                  el={el}
                  pageX={PAGE_X}
                  pageY={PAGE_Y}
                  pageW={canvasW}
                  pageH={PAGE_H}
                  selected={selectedIds.has(el.id)}
                  cropMode={cropMode}
                  nodeRef={(n) => {
                    nodeRefs.current[el.id] = n;
                  }}
                  onSelect={(evt) => selectOne(el.id, evt.evt.shiftKey)}
                  onDragMove={(node, evt) => dragElement(node, el, evt.evt.shiftKey)}
                  onDragEnd={onDragEnd(el)}
                  onTransformEnd={onTransformEnd(el)}
                  onImgLoad={(w, h) => {
                    srcDimsRef.current[el.id] = { w, h };
                  }}
                  onEnterCropMode={() => {
                    setCropModeId(el.id);
                    setSelectedIds(new Set([el.id]));
                  }}
                  onCropDragStart={() => startLiveEdit()}
                  onCropPan={(crop) => updateElementLive(el.id, { crop })}
                  onCropDragEnd={() => endLiveEdit()}
                  onEditTextRequest={(el) => beginTextEdit(el)}
                  editingText={editingTextId === el.id}
                />
              );
            })}
            <Transformer ref={trRef} rotateEnabled anchorSize={8} />
          </Layer>
        </Stage>

          {/* Inline text editor — double-click a text element and type directly on the canvas. */}
          {editingTextId && (() => {
            const tEl = elements.find((e) => e.id === editingTextId);
            if (!tEl || tEl.type !== "text") return null;
            const tstyle = (tEl.style ?? {}) as {
              fontSize?: number;
              fontFamily?: string;
              color?: string;
              align?: string;
              fontWeight?: string;
              fontStyle?: string;
              letterSpacing?: number;
              lineHeight?: number;
            };
            const elX = PAGE_X + tEl.x * canvasW;
            const elY = PAGE_Y + tEl.y * PAGE_H;
            const elW = Math.max(24, tEl.width * canvasW);
            const elH = Math.max(20, tEl.height * PAGE_H);
            const fz = (tstyle.fontSize ?? 28) * zoom;
            return (
              <textarea
                ref={textAreaRef}
                value={draftText}
                autoFocus
                spellCheck={false}
                onChange={(e) => {
                  setDraftText(e.target.value);
                  updateElementLive(tEl.id, { text: { content: e.target.value } });
                }}
                onBlur={() => commitTextEdit()}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    cancelTextEdit();
                  } else if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    (e.target as HTMLTextAreaElement).blur();
                  }
                }}
                style={{
                  position: "absolute",
                  left: pan.x + elX * zoom,
                  top: pan.y + elY * zoom,
                  width: elW * zoom,
                  minHeight: elH * zoom,
                  fontFamily: tstyle.fontFamily || "sans-serif",
                  fontSize: fz,
                  lineHeight: tstyle.lineHeight ?? 1.2,
                  letterSpacing: tstyle.letterSpacing ?? 0,
                  color: tstyle.color ?? "#000",
                  textAlign: (tstyle.align as "left" | "center" | "right") ?? "left",
                  fontWeight: tstyle.fontWeight ?? "normal",
                  fontStyle: tstyle.fontStyle ?? "normal",
                  background: "rgba(255,255,255,0.6)",
                  outline: "2px solid #6366f1",
                  border: "none",
                  resize: "none",
                  overflow: "hidden",
                  padding: 0,
                  margin: 0,
                  borderRadius: 2,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  zIndex: 20,
                }}
              />
            );
          })()}
          </div>
        </section>

        {/* Inspector */}
        <aside className="w-72 shrink-0 space-y-3 overflow-y-auto">
          <section className="card p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Layers</h3>
            {elements.length === 0 ? (
              <p className="text-xs text-slate-400">No elements on this page.</p>
            ) : (
              <div className="space-y-1">
                {[...elements]
                  .sort((a, b) => b.z - a.z)
                  .map((el) => (
                    <div
                      key={el.id}
                      onClick={() => selectOne(el.id, false)}
                      className={`flex cursor-pointer items-center gap-1 rounded-lg border px-2 py-1.5 text-xs ${
                        selectedIds.has(el.id)
                          ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                          : "border-slate-100 hover:border-slate-200"
                      }`}
                    >
                      <span className="flex-1 truncate">{layerLabel(el)}</span>
                      <button
                        className="opacity-50 hover:opacity-100"
                        title="Bring to front"
                        onClick={(e) => {
                          e.stopPropagation();
                          selectOne(el.id, false);
                          layerOp(el.id, "front");
                        }}
                      >
                        ⤒
                      </button>
                      <button
                        className="opacity-50 hover:opacity-100"
                        title="Move forward"
                        onClick={(e) => {
                          e.stopPropagation();
                          selectOne(el.id, false);
                          layerOp(el.id, "forward");
                        }}
                      >
                        ↑
                      </button>
                      <button
                        className="opacity-50 hover:opacity-100"
                        title="Move backward"
                        onClick={(e) => {
                          e.stopPropagation();
                          selectOne(el.id, false);
                          layerOp(el.id, "backward");
                        }}
                      >
                        ↓
                      </button>
                      <button
                        className="opacity-50 hover:opacity-100"
                        title="Send to back"
                        onClick={(e) => {
                          e.stopPropagation();
                          selectOne(el.id, false);
                          layerOp(el.id, "back");
                        }}
                      >
                        ⤓
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </section>

          <section className="card p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Page</h3>
            {layouts.length > 0 && (
              <div className="mb-3">
                <label className="field-label">Layout</label>
                <select value={page.layoutKey ?? ""} onChange={(e) => changeLayout(e.target.value)} className="input">
                  {layouts.map((l) => (
                    <option key={l.key} value={l.key}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="mb-3">
              <label className="field-label">Background</label>
              <input
                type="color"
                value={bgColor}
                onChange={(e) => setBackground(e.target.value)}
                className="h-9 w-full cursor-pointer rounded-lg border border-slate-200"
              />
            </div>
            <div>
              <label className="field-label">Pattern</label>
              <select value={bgPattern ?? ""} onChange={(e) => setPattern(e.target.value)} className="input">
                <option value="">None</option>
                {PAGE_PATTERNS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            {bg.image?.stockId && (
              <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5">
                <span className="truncate text-[11px] text-slate-500" title={bg.image.title}>
                  📷 Stock background
                  {bg.image.title ? ` — ${bg.image.title}` : ""}
                  {bg.image.author ? ` · by ${bg.image.author}` : ""}
                </span>
                <button onClick={removeStockBackground} className="shrink-0 text-[11px] font-medium text-red-500 hover:underline">
                  Remove
                </button>
              </div>
            )}
            <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
              <label className="field-label">AI suggest (event type)</label>
              <select value={eventType} onChange={(e) => setEventType(e.target.value)} className="input">
                <option value="wedding">Wedding</option>
                <option value="mehndi">Mehndi</option>
                <option value="baraat">Baraat</option>
                <option value="sangeet">Sangeet</option>
                <option value="reception">Reception</option>
              </select>
              <button
                onClick={() => void applySuggestion()}
                disabled={suggesting}
                className="btn-primary w-full !px-2 !py-1.5 text-xs"
              >
                {suggesting ? "Suggesting…" : "✨ Suggest design"}
              </button>
              <p className="text-[11px] text-slate-400">
                Reads the page's photos, extracts the palette, and applies a background, ornament
                and title font.
              </p>
            </div>

            <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
              <label className="field-label">✨ Generate element</label>
              <textarea
                value={genPrompt}
                onChange={(e) => setGenPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") void generateElement();
                }}
                placeholder="Describe an element… e.g. gold mehndi mandala ornament on transparent background"
                rows={2}
                className="input w-full resize-none !py-1.5 text-xs"
              />
              <div className="flex items-center gap-1">
                {(["pollinations", "bfl"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => void setGenProvider(p)}
                    className={`flex-1 rounded-lg border px-1.5 py-1 text-[10px] font-medium ${
                      genProvider === p
                        ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                    title={p === "pollinations" ? "Free, no key needed" : "Black Forest Labs FLUX — paid"}
                  >
                    {p === "pollinations" ? "Pollinations · free" : "FLUX · pro"}
                  </button>
                ))}
              </div>
              {genProvider === "bfl" && (
                <div className="flex gap-1">
                  <input
                    value={genKey}
                    onChange={(e) => setGenKey(e.target.value)}
                    placeholder="BFL API key"
                    type="password"
                    className="input flex-1 !px-2 !py-1 text-xs"
                  />
                  <button
                    onClick={async () => {
                      if (!genKey.trim()) return;
                      await window.albumforge.gen.setApiKey("bfl", genKey.trim());
                      setGenKey("");
                      toast("FLUX key saved");
                    }}
                    className="btn-secondary !px-2 !py-1 text-xs"
                  >
                    Save
                  </button>
                </div>
              )}
              <button
                onClick={() => void generateElement()}
                disabled={generating}
                className="btn-primary w-full !px-2 !py-1.5 text-xs"
              >
                {generating ? "Generating…" : "⚡ Generate element"}
              </button>
              <p className="text-[11px] text-slate-400">
                Describes a graphic, generates it with AI, adds it to the page and saves it to your
                graphics library for reuse. Ctrl+Enter to run.
              </p>
            </div>
          </section>

          <section className="card p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Designs</h3>
            <div className="space-y-2">
              <button onClick={saveDesign} className="btn-secondary w-full">
                Save page as design
              </button>
              {designs.length > 0 && (
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) void applyDesign(e.target.value);
                  }}
                  className="input"
                >
                  <option value="">Apply design…</option>
                  {designs.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </section>

          {selected && (
            <section className="card p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Element</h3>
              <div className="mb-3 grid grid-cols-3 gap-1.5">
                <button
                  onClick={() => layerOp(selected.id, "forward")}
                  className="btn-secondary !px-2 !py-1.5 text-xs"
                  title="Move forward (Ctrl+])"
                >
                  Forward
                </button>
                <button
                  onClick={() => layerOp(selected.id, "backward")}
                  className="btn-secondary !px-2 !py-1.5 text-xs"
                  title="Move backward (Ctrl+[)"
                >
                  Backward
                </button>
                <button
                  onClick={() => layerOp(selected.id, "front")}
                  className="btn-secondary !px-2 !py-1.5 text-xs"
                  title="Bring to front (Ctrl+Shift+])"
                >
                  Front
                </button>
                <button
                  onClick={() => layerOp(selected.id, "back")}
                  className="btn-secondary !px-2 !py-1.5 text-xs"
                  title="Send to back (Ctrl+Shift+[)"
                >
                  Back
                </button>
                {selected.type === "image" && (
                  <button onClick={() => setPicker("replace")} className="btn-secondary !px-2 !py-1.5 text-xs">
                    Replace
                  </button>
                )}
                <button onClick={deleteSelected} className="btn-secondary !px-2 !py-1.5 text-xs !text-red-500">
                  Delete
                </button>
              </div>
              <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                <div>
                  <label className="field-label">Blend mode</label>
                  <select
                    value={selectedBlend}
                    onChange={(e) =>
                      updateElement(selected.id, {
                        style: { ...(selected.style ?? {}), blendMode: e.target.value || undefined },
                      })
                    }
                    className="input"
                  >
                    <option value="">Normal</option>
                    <option value="multiply">Multiply</option>
                    <option value="screen">Screen</option>
                    <option value="overlay">Overlay</option>
                    <option value="soft-light">Soft light</option>
                  </select>
                </div>
                {selected.type === "image" && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="field-label !mb-0">Filters</label>
                      <button
                        onClick={() =>
                          updateElement(selected.id, {
                            style: { ...(selected.style ?? {}), filters: undefined },
                          })
                        }
                        className="btn-ghost !px-1.5 !py-0.5 text-[11px]"
                      >
                        Reset
                      </button>
                    </div>
                    <FilterSlider
                      label="Brightness"
                      min={50}
                      max={150}
                      value={Math.round((selectedFilters.brightness ?? 1) * 100)}
                      display={(v) => `${v}%`}
                      onChange={(v) => setFilter(selected.id, "brightness", v / 100)}
                      onEditStart={startLiveEdit}
                      onEditEnd={endLiveEdit}
                    />
                    <FilterSlider
                      label="Saturation"
                      min={0}
                      max={200}
                      value={Math.round((selectedFilters.saturation ?? 1) * 100)}
                      display={(v) => `${v}%`}
                      onChange={(v) => setFilter(selected.id, "saturation", v / 100)}
                      onEditStart={startLiveEdit}
                      onEditEnd={endLiveEdit}
                    />
                    <FilterSlider
                      label="Hue"
                      min={-180}
                      max={180}
                      value={Math.round(selectedFilters.hue ?? 0)}
                      display={(v) => `${v}°`}
                      onChange={(v) => setFilter(selected.id, "hue", v)}
                      onEditStart={startLiveEdit}
                      onEditEnd={endLiveEdit}
                    />
                    <FilterSlider
                      label="Contrast"
                      min={50}
                      max={150}
                      value={Math.round((selectedFilters.contrast ?? 1) * 100)}
                      display={(v) => `${v}%`}
                      onChange={(v) => setFilter(selected.id, "contrast", v / 100)}
                      onEditStart={startLiveEdit}
                      onEditEnd={endLiveEdit}
                    />
                    <FilterSlider
                      label="Blur"
                      min={0}
                      max={10}
                      step={0.5}
                      value={selectedFilters.blur ?? 0}
                      display={(v) => `${v.toFixed(1)}px`}
                      onChange={(v) => setFilter(selected.id, "blur", v)}
                      onEditStart={startLiveEdit}
                      onEditEnd={endLiveEdit}
                    />
                  </div>
                )}
              </div>
              {selected.type === "image" && (
                <div className="space-y-2 border-t border-slate-100 pt-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => void removeBackground()}
                      disabled={segmenting === selected.id || !selected.photoId}
                      className="btn-secondary flex-1 !px-2 !py-1.5 text-xs"
                    >
                      {segmenting === selected.id
                        ? "Segmenting…"
                        : selectedMask
                          ? "Restore background"
                          : "Remove background"}
                    </button>
                    <span className="text-[11px] text-slate-400">on-device</span>
                  </div>
                  {selectedMask && !segmenting && (
                    <p className="text-[11px] text-slate-400">
                      Subject isolated — bring an ornament layer behind it (Layers panel ↓).
                    </p>
                  )}
                </div>
              )}
              {selected.type === "image" && (
                <div className="space-y-2 border-t border-slate-100 pt-3">
                  <div className="flex items-center justify-between">
                    <label className="field-label !mb-0">Crop / pan</label>
                    {cropModeId === selected.id ? (
                      <button onClick={() => setCropModeId(null)} className="btn-primary !px-2 !py-1 text-xs">
                        Done
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-400">double-click photo</span>
                    )}
                  </div>
                  {cropModeId === selected.id && (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">Zoom</span>
                        <input
                          type="range"
                          min={1}
                          max={8}
                          step={0.1}
                          value={cropZoomValue(selected)}
                          onPointerDown={() => startLiveEdit()}
                          onChange={(e) => setCropZoom(selected, Number(e.target.value))}
                          onPointerUp={() => endLiveEdit()}
                          onBlur={() => endLiveEdit()}
                          className="flex-1"
                        />
                        <span className="w-10 text-right text-xs tabular-nums text-slate-500">
                          {cropZoomValue(selected).toFixed(1)}×
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">Drag the photo inside the frame to pan.</p>
                      <button onClick={() => resetCrop(selected)} className="btn-secondary w-full !px-2 !py-1.5 text-xs">
                        Reset crop
                      </button>
                    </>
                  )}
                </div>
              )}
              {selected.type === "text" && (
                <div className="space-y-3">
                  <div>
                    <label className="field-label">Font</label>
                    <select
                      value={(selected.style as { fontFamily?: string } | null)?.fontFamily ?? ""}
                      onChange={(e) =>
                        updateElement(selected.id, {
                          style: { ...(selected.style ?? {}), fontFamily: e.target.value || undefined },
                        })
                      }
                      className="input"
                    >
                      <option value="">Default</option>
                      {fonts.map((f) => (
                        <option key={f} value={f} style={{ fontFamily: `'${f}'` }}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="field-label">Size</label>
                      <input
                        type="number"
                        min={8}
                        max={200}
                        value={(selected.style as { fontSize?: number } | null)?.fontSize ?? 28}
                        onChange={(e) =>
                          updateElement(selected.id, {
                            style: { ...(selected.style ?? {}), fontSize: Number(e.target.value) },
                          })
                        }
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="field-label">Color</label>
                      <input
                        type="color"
                        value={(selected.style as { color?: string } | null)?.color ?? "#000000"}
                        onChange={(e) =>
                          updateElement(selected.id, {
                            style: { ...(selected.style ?? {}), color: e.target.value },
                          })
                        }
                        className="h-8 w-12 cursor-pointer rounded-lg border border-slate-200"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const st = selected.style ?? {};
                        const w = (st as { fontWeight?: string }).fontWeight === "bold" ? "normal" : "bold";
                        updateElement(selected.id, { style: { ...st, fontWeight: w } });
                      }}
                      className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold ${
                        (selected.style as { fontWeight?: string } | null)?.fontWeight === "bold"
                          ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                      title="Bold"
                    >
                      B
                    </button>
                    <button
                      onClick={() => {
                        const st = selected.style ?? {};
                        const fs = (st as { fontStyle?: string }).fontStyle === "italic" ? "normal" : "italic";
                        updateElement(selected.id, { style: { ...st, fontStyle: fs } });
                      }}
                      className={`flex-1 rounded-lg border px-2 py-1.5 text-xs italic ${
                        (selected.style as { fontStyle?: string } | null)?.fontStyle === "italic"
                          ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                      title="Italic"
                    >
                      I
                    </button>
                    <select
                      value={(selected.style as { align?: string } | null)?.align ?? "left"}
                      onChange={(e) =>
                        updateElement(selected.id, {
                          style: { ...(selected.style ?? {}), align: e.target.value },
                        })
                      }
                      className="input flex-1 !px-2"
                      title="Align"
                    >
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                  </div>
                </div>
              )}
              {selected.type === "shape" && (
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="field-label">Fill</label>
                      <input
                        type="color"
                        value={(selected.style as { fill?: string } | null)?.fill ?? "#6366f1"}
                        onChange={(e) =>
                          updateElement(selected.id, {
                            style: { ...(selected.style ?? {}), fill: e.target.value },
                          })
                        }
                        className="h-8 w-full cursor-pointer rounded-lg border border-slate-200"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="field-label">Stroke</label>
                      <input
                        type="color"
                        value={(selected.style as { stroke?: string } | null)?.stroke ?? "#6366f1"}
                        onChange={(e) =>
                          updateElement(selected.id, {
                            style: { ...(selected.style ?? {}), stroke: e.target.value },
                          })
                        }
                        className="h-8 w-full cursor-pointer rounded-lg border border-slate-200"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="field-label">Width</label>
                      <input
                        type="number"
                        min={1}
                        max={40}
                        value={(selected.style as { strokeWidth?: number } | null)?.strokeWidth ?? 2}
                        onChange={(e) =>
                          updateElement(selected.id, {
                            style: { ...(selected.style ?? {}), strokeWidth: Number(e.target.value) },
                          })
                        }
                        className="input"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="field-label">Opacity</label>
                    <input
                      type="number"
                      min={0.1}
                      max={1}
                      step={0.05}
                      value={(selected.style as { opacity?: number } | null)?.opacity ?? 1}
                      onChange={(e) =>
                        updateElement(selected.id, {
                          style: { ...(selected.style ?? {}), opacity: Number(e.target.value) },
                        })
                      }
                      className="input"
                    />
                  </div>
                </div>
              )}
              {selected.type === "graphic" && (
                <div className="space-y-3">
                  <div>
                    <label className="field-label">Color</label>
                    <input
                      type="color"
                      value={(selected.style as { color?: string } | null)?.color ?? "#6366f1"}
                      onChange={(e) =>
                        updateElement(selected.id, {
                          style: { ...(selected.style ?? {}), color: e.target.value },
                        })
                      }
                      className="h-8 w-full cursor-pointer rounded-lg border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="field-label">Opacity</label>
                    <input
                      type="number"
                      min={0.1}
                      max={1}
                      step={0.05}
                      value={(selected.style as { opacity?: number } | null)?.opacity ?? 1}
                      onChange={(e) =>
                        updateElement(selected.id, {
                          style: { ...(selected.style ?? {}), opacity: Number(e.target.value) },
                        })
                      }
                      className="input"
                    />
                  </div>
                </div>
              )}
              {selected.type === "stock-vector" &&
                (() => {
                  const s = (selected.style ?? {}) as {
                    vector?: StockVectorData;
                    opacity?: number;
                    title?: string;
                    author?: string | null;
                    attributionRequired?: boolean;
                  };
                  const v = s.vector;
                  return (
                    <div className="space-y-3">
                      {v && v.groups.length > 0 && (
                        <div>
                          <label className="field-label">Recolor — one slot per original colour</label>
                          <div className="space-y-1.5">
                            {v.groups.map((g, i) => (
                              <div key={i} className="flex items-center gap-2">
                                <input
                                  type="color"
                                  value={g.color}
                                  onChange={(e) =>
                                    updateElement(selected.id, {
                                      style: {
                                        ...selected.style,
                                        vector: {
                                          ...v,
                                          groups: v.groups.map((x, xi) =>
                                            xi === i ? { ...x, color: e.target.value } : x,
                                          ),
                                        },
                                      },
                                    })
                                  }
                                  className="h-7 w-10 cursor-pointer rounded border border-slate-200"
                                />
                                <span className="text-[11px] text-slate-400">
                                  {g.paths.length} path{g.paths.length > 1 ? "s" : ""}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div>
                        <label className="field-label">Opacity</label>
                        <input
                          type="number"
                          min={0.1}
                          max={1}
                          step={0.05}
                          value={s.opacity ?? 1}
                          onChange={(e) =>
                            updateElement(selected.id, {
                              style: { ...(selected.style ?? {}), opacity: Number(e.target.value) },
                            })
                          }
                          className="input"
                        />
                      </div>
                      {(s.title || s.author) && (
                        <p className="text-[10px] leading-snug text-slate-400">
                          {s.title}
                          {s.author ? ` · by ${s.author}` : ""}
                          {s.attributionRequired ? " · attribution required" : ""}
                        </p>
                      )}
                    </div>
                  );
                })()}
              {selected.type === "stock-photo" && (
                <div className="space-y-3">
                  <div>
                    <label className="field-label">Opacity</label>
                    <input
                      type="number"
                      min={0.1}
                      max={1}
                      step={0.05}
                      value={(selected.style as { opacity?: number } | null)?.opacity ?? 1}
                      onChange={(e) =>
                        updateElement(selected.id, {
                          style: { ...(selected.style ?? {}), opacity: Number(e.target.value) },
                        })
                      }
                      className="input"
                    />
                  </div>
                  <p className="text-[10px] leading-snug text-slate-400">
                    {(selected.style as { title?: string } | null)?.title ?? "Stock image"}
                    {(selected.style as { author?: string | null } | null)?.author
                      ? ` · by ${(selected.style as { author?: string | null } | null)?.author}`
                      : ""}
                  </p>
                </div>
              )}
            </section>
          )}
        </aside>
      </div>

      {picker && (
        <PhotoPicker
          projectId={projectId}
          mode={picker}
          onSelect={(id) => (picker === "add" ? addPhoto(id) : replacePhoto(id))}
          onClose={() => setPicker(null)}
        />
      )}

      {prompt && (
        <PromptModal
          title={prompt.title}
          defaultValue={prompt.initial}
          onConfirm={(v) => {
            prompt.onConfirm(v);
            setPrompt(null);
          }}
          onCancel={() => setPrompt(null)}
        />
      )}
    </div>
  );
}

function MiniPage({ page, aspect }: { page: AlbumPage; aspect: number }) {
  const ratio = page.isSpread ? aspect * 2 : aspect;
  const bg = (page.background as { color?: string; pattern?: string } | null) ?? {};
  const color = bg.color ?? "#ffffff";
  const patternUri = patternDataUri(bg.pattern ?? null);
  return (
    <div
      className="relative w-full overflow-hidden bg-white"
      style={{
        aspectRatio: `${ratio}`,
        backgroundImage: patternUri ? `url("${patternUri}")` : undefined,
        backgroundColor: color,
        backgroundRepeat: "repeat",
      }}
    >
      {page.elements.map((el) => {
        const box: React.CSSProperties = {
          position: "absolute",
          left: `${el.x * 100}%`,
          top: `${el.y * 100}%`,
          width: `${el.width * 100}%`,
          height: `${el.height * 100}%`,
        };
        if (el.type === "image" && el.photoId) {
          return (
            <div
              key={el.id}
              style={{ ...box, backgroundImage: `url("media://preview1024/${el.photoId}")`, backgroundSize: "cover", backgroundPosition: "center" }}
            />
          );
        }
        if (el.type === "shape") {
          const s = (el.style ?? {}) as { fill?: string; shape?: string };
          const fill = s.fill ?? "#6366f1";
          return (
            <div
              key={el.id}
              style={{
                ...box,
                backgroundColor: fill,
                borderRadius: s.shape === "ellipse" ? "999px" : "1px",
              }}
            />
          );
        }
        if (el.type === "graphic") {
          const s = (el.style ?? {}) as { color?: string; assetUri?: string };
          return (
            <div
              key={el.id}
              style={{
                ...box,
                backgroundImage: s.assetUri ? `url("${s.assetUri}")` : undefined,
                backgroundSize: "contain",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "center",
                color: s.color ?? "#6366f1",
                display: s.assetUri ? undefined : "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "9px",
              }}
            >
              {!s.assetUri ? "✦" : ""}
            </div>
          );
        }
        if (el.type === "text") {
          return (
            <div key={el.id} style={{ ...box }} className="flex items-end">
              <div className="w-full truncate border-b-2 border-slate-400 text-[6px] leading-none text-slate-400">T</div>
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

function ElementNode({
  el,
  pageX,
  pageY,
  pageW,
  pageH,
  selected,
  cropMode = false,
  editingText = false,
  nodeRef,
  onSelect,
  onDragMove,
  onDragEnd,
  onTransformEnd,
  onEditTextRequest,
  onImgLoad,
  onEnterCropMode,
  onCropDragStart,
  onCropPan,
  onCropDragEnd,
}: {
  el: AlbumElement;
  pageX: number;
  pageY: number;
  pageW: number;
  pageH: number;
  selected: boolean;
  cropMode?: boolean;
  editingText?: boolean;
  nodeRef: (n: Konva.Group | null) => void;
  onSelect: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onDragMove?: (node: Konva.Group, evt: Konva.KonvaEventObject<DragEvent>) => void;
  onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onTransformEnd: (e: Konva.KonvaEventObject<Event>) => void;
  onEditTextRequest: (el: AlbumElement) => void;
  onImgLoad?: (w: number, h: number) => void;
  onEnterCropMode?: () => void;
  onCropDragStart?: () => void;
  onCropPan?: (crop: CropRect) => void;
  onCropDragEnd?: () => void;
}) {
  const x = pageX + el.x * pageW;
  const y = pageY + el.y * pageH;
  const w = el.width * pageW;
  const h = el.height * pageH;
  const dragOriginRef = useRef<{ x: number; y: number } | null>(null);
  const styleMeta = (el.style ?? {}) as {
    blendMode?: string;
    filters?: Record<string, number>;
    mask?: { kind?: string } | null;
  };
  const blendMode = styleMeta.blendMode;
  const maskActive = styleMeta.mask?.kind === "alpha" && !!el.photoId;

  const img = useLoadedImage(el.photoId ? `media://preview1024/${el.photoId}` : undefined);
  const matteImg = useLoadedImage(maskActive && el.photoId ? `media://matte/${el.photoId}` : undefined);

  useEffect(() => {
    if (el.type === "image" && img) {
      onImgLoad?.(img.naturalWidth, img.naturalHeight);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img]);

  if (el.type === "shape") {
    const s = (el.style ?? {}) as {
      shape?: string;
      fill?: string;
      stroke?: string;
      strokeWidth?: number;
      opacity?: number;
      radius?: number;
    };
    const fill = s.fill && s.fill !== "none" ? s.fill : undefined;
    const stroke = s.stroke ?? "#0f172a";
    const sw = Math.max(1, s.strokeWidth ?? 2);
    let shapeNode: React.ReactNode;
    if (s.shape === "ellipse") {
      shapeNode = <Ellipse x={w / 2} y={h / 2} radiusX={Math.max(1, w / 2 - sw / 2)} radiusY={Math.max(1, h / 2 - sw / 2)} fill={fill} stroke={stroke} strokeWidth={sw} />;
    } else if (s.shape === "line") {
      shapeNode = <Line points={[sw / 2, h / 2, w - sw / 2, h / 2]} stroke={stroke} strokeWidth={sw} lineCap="round" />;
    } else if (s.shape === "arrow") {
      shapeNode = <Arrow points={[sw / 2, h / 2, w - 10, h / 2]} stroke={stroke} strokeWidth={sw} pointerLength={Math.min(14, h)} pointerWidth={Math.min(14, h)} fill={stroke} />;
    } else if (s.shape === "star") {
      const r = Math.min(w, h) / 2 - sw / 2;
      shapeNode = <Star x={w / 2} y={h / 2} numPoints={5} innerRadius={r * 0.42} outerRadius={r} fill={fill ?? stroke} stroke={stroke} strokeWidth={sw} />;
    } else {
      shapeNode = <Rect width={w} height={h} cornerRadius={Math.min(s.radius ?? 0, w / 2, h / 2)} fill={fill ?? stroke} stroke={stroke} strokeWidth={sw} />;
    }
    return (
      <Group
        ref={nodeRef}
        id={el.id}
        x={x}
        y={y}
        width={w}
        height={h}
        rotation={el.rotation}
        opacity={s.opacity ?? 1}
        globalCompositeOperation={blendMode as GlobalCompositeOperation | undefined}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDragMove={(e) => onDragMove?.(e.target as Konva.Group, e)} onDragEnd={onDragEnd}
        onTransformEnd={onTransformEnd}
      >
        {shapeNode}
        {selected && <Rect width={w} height={h} stroke="#5b5bd6" strokeWidth={1} listening={false} />}
      </Group>
    );
  }

  if (el.type === "graphic") {
    const style = (el.style ?? {}) as { graphicId?: string; color?: string; opacity?: number; assetUri?: string };
    const color = style.color ?? "#b17e36";
    const opacity = style.opacity ?? 1;
    const assetImg = useLoadedImage(style.assetUri ?? undefined);
    const g = style.assetUri ? undefined : findGraphic(style.graphicId ?? "");
    return (
      <Group
        ref={nodeRef}
        id={el.id}
        x={x}
        y={y}
        width={w}
        height={h}
        rotation={el.rotation}
        opacity={opacity}
        globalCompositeOperation={blendMode as GlobalCompositeOperation | undefined}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDragMove={(e) => onDragMove?.(e.target as Konva.Group, e)} onDragEnd={onDragEnd}
        onTransformEnd={onTransformEnd}
      >
        {g && (
          <Group scaleX={w / g.w} scaleY={h / g.h}>
            {g.paths.map((p, i) => (
              <Path key={i} data={p.d} fill={p.mode === "stroke" ? undefined : color} stroke={color} strokeWidth={Math.max(1, (2 * g.w) / 100)} lineJoin="round" />
            ))}
          </Group>
        )}
        {assetImg && <KImage image={assetImg} width={w} height={h} />}
        {selected && <Rect width={w} height={h} stroke="#5b5bd6" strokeWidth={1} listening={false} />}
      </Group>
    );
  }

  if (el.type === "stock-vector") {
    const style = (el.style ?? {}) as { vector?: StockVectorData; opacity?: number };
    const v = style.vector;
    return (
      <Group
        ref={nodeRef}
        id={el.id}
        x={x}
        y={y}
        width={w}
        height={h}
        rotation={el.rotation}
        opacity={style.opacity ?? 1}
        globalCompositeOperation={blendMode as GlobalCompositeOperation | undefined}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDragMove={(e) => onDragMove?.(e.target as Konva.Group, e)}
        onDragEnd={onDragEnd}
        onTransformEnd={onTransformEnd}
      >
        {v && v.groups.length > 0 && (
          <Group scaleX={w / v.width} scaleY={h / v.height}>
            {v.groups.map((grp, gi) =>
              grp.paths.map((d, i) => <Path key={`${gi}-${i}`} data={d} fill={grp.color} lineJoin="round" />),
            )}
          </Group>
        )}
        {selected && <Rect width={w} height={h} stroke="#5b5bd6" strokeWidth={1} listening={false} />}
      </Group>
    );
  }

  if (el.type === "stock-photo") {
    const style = (el.style ?? {}) as { stockId?: string; opacity?: number };
    const stockImg = useLoadedImage(style.stockId ? `stock://asset/${style.stockId}` : undefined);
    return (
      <Group
        ref={nodeRef}
        id={el.id}
        x={x}
        y={y}
        width={w}
        height={h}
        rotation={el.rotation}
        opacity={style.opacity ?? 1}
        globalCompositeOperation={blendMode as GlobalCompositeOperation | undefined}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDragMove={(e) => onDragMove?.(e.target as Konva.Group, e)}
        onDragEnd={onDragEnd}
        onTransformEnd={onTransformEnd}
      >
        {stockImg ? <KImage image={stockImg} width={w} height={h} /> : <Rect width={w} height={h} fill="#fffaf0" stroke="#d6b06f" strokeWidth={1} dash={[4, 4]} />}
        {!stockImg && <KText text="Loading element…" width={w} y={h / 2 - 7} align="center" fontSize={12} fill="#9b6a2d" listening={false} />}
        {selected && <Rect width={w} height={h} stroke="#5b5bd6" strokeWidth={1} listening={false} />}
      </Group>
    );
  }

  if (el.type === "text" || el.type === "background") {
    const content = (el.text as { content?: string } | null)?.content ?? "";
    const tstyle = (el.style ?? {}) as {
      fontSize?: number;
      fontFamily?: string;
      color?: string;
      align?: string;
      fontWeight?: string;
      fontStyle?: string;
      letterSpacing?: number;
      lineHeight?: number;
    };
    return (
      <Group
        ref={nodeRef}
        id={el.id}
        x={x}
        y={y}
        globalCompositeOperation={blendMode as GlobalCompositeOperation | undefined}
        draggable={!editingText}
        onClick={onSelect}
        onTap={onSelect}
        onDblClick={() => onEditTextRequest(el)}
        onDragMove={(e) => onDragMove?.(e.target as Konva.Group, e)} onDragEnd={onDragEnd}
        onTransformEnd={onTransformEnd}
      >
        {el.type === "background" ? (
          <Rect width={w} height={h} fill={(el.style as { color?: string } | null)?.color || "#fff"} />
        ) : (
          <KText
            text={content}
            fontSize={tstyle.fontSize ?? 28}
            fontFamily={tstyle.fontFamily || "sans-serif"}
            fill={tstyle.color ?? "#000"}
            align={(tstyle.align as "left" | "center" | "right") ?? "left"}
            fontStyle={tstyle.fontStyle ?? "normal"}
            fontWeight={tstyle.fontWeight ?? "normal"}
            letterSpacing={tstyle.letterSpacing ?? 0}
            lineHeight={tstyle.lineHeight ?? 1.2}
            width={w}
            wrap="word"
            opacity={editingText ? 0 : 1}
            listening={!editingText}
          />
        )}
      </Group>
    );
  }

  const srcW = img?.naturalWidth ?? 0;
  const srcH = img?.naturalHeight ?? 0;

  let cropPx: { x: number; y: number; width: number; height: number } | null = null;
  if (el.crop && srcW > 0) {
    cropPx = {
      x: el.crop.x * srcW,
      y: el.crop.y * srcH,
      width: el.crop.width * srcW,
      height: el.crop.height * srcH,
    };
  } else if (!el.crop && img && srcW > 0 && srcH > 0) {
    const nodeAspect = w / h;
    const srcAspect = srcW / srcH;
    if (srcAspect > nodeAspect) {
      const cw = srcH * nodeAspect;
      cropPx = { x: (srcW - cw) / 2, y: 0, width: cw, height: srcH };
    } else {
      const ch = srcW / nodeAspect;
      cropPx = { x: 0, y: (srcH - ch) / 2, width: srcW, height: ch };
    }
  }

  const fp = imageFilterProps(styleMeta.filters);
  const maskedCanvas =
    maskActive && img && matteImg && cropPx ? compositeMaskedCanvas(img, matteImg, cropPx, w, h) : null;

  /** Crop/Pan mode: keep the frame fixed, move the crop window with the cursor instead. */
  const panCropMove = (node: Konva.Group) => {
    if (!dragOriginRef.current || !srcW || !srcH) return;
    const dx = node.x() - dragOriginRef.current.x;
    const dy = node.y() - dragOriginRef.current.y;
    node.position({ x: dragOriginRef.current.x, y: dragOriginRef.current.y });
    if (dx === 0 && dy === 0) return;
    const cur = el.crop ?? coverCrop(srcW, srcH, w, h);
    const next = panCropRect(cur, dx, dy, w, h);
    if (next.x !== cur.x || next.y !== cur.y) onCropPan?.(next);
  };

  return (
    <Group
      ref={nodeRef}
      id={el.id}
      x={x}
      y={y}
      width={w}
      height={h}
      rotation={el.rotation}
      globalCompositeOperation={blendMode as GlobalCompositeOperation | undefined}
      draggable
      onClick={onSelect}
      onTap={onSelect}
      onDblClick={() => onEnterCropMode?.()}
      onDragStart={
        cropMode
          ? (e) => {
              const n = e.target as Konva.Group;
              dragOriginRef.current = { x: n.x(), y: n.y() };
              onCropDragStart?.();
            }
          : undefined
      }        onDragMove={
        cropMode ? (e) => panCropMove(e.target as Konva.Group) : (e) => onDragMove?.(e.target as Konva.Group, e)
      }
      onDragEnd={cropMode ? () => onCropDragEnd?.() : onDragEnd}
      onTransformEnd={cropMode ? undefined : onTransformEnd}
    >
      {img && (maskedCanvas || cropPx) ? (
        <KImage
          image={maskedCanvas ?? img}
          crop={maskedCanvas || !cropPx ? undefined : cropPx}
          width={w}
          height={h}
          filters={fp.filters}
          {...fp.props}
        />
      ) : (
        <Rect width={w} height={h} fill="#eee" />
      )}
      {selected && <Rect width={w} height={h} stroke="#5b5bd6" strokeWidth={1} listening={false} />}
      {cropMode && <Rect width={w} height={h} stroke="#f43f5e" strokeWidth={1.5} dash={[6, 4]} listening={false} />}
    </Group>
  );
}

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
import type Konva from "konva";
import type { AlbumElement, AlbumPage, PageSize } from "@shared/api";
import { PAGE_PATTERNS, patternDataUri } from "@shared/patterns";
import { findGraphic, GRAPHICS, type ShapeKind } from "@shared/designs";
import PhotoPicker from "./PhotoPicker";
import PromptModal from "./PromptModal";
import { useFonts } from "./useFonts";

const PAGE_W = 600;

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

  const [pageIndex, setPageIndex] = useState(0);  const [pagesState, setPagesState] = useState<AlbumPage[]>(pages);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<AlbumPage[][]>([]);
  const [future, setFuture] = useState<AlbumPage[][]>([]);
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState<"add" | "replace" | null>(null);
  const [prompt, setPrompt] = useState<{ title: string; initial: string; onConfirm: (v: string) => void } | null>(null);

  const trRef = useRef<Konva.Transformer>(null);
  const nodeRefs = useRef<Record<string, Konva.Group | null>>({});
  const fonts = useFonts();

  // Keep local page state in sync with the prop (pages load asynchronously after mount,
  // and structural changes update the parent list).
  useEffect(() => {
    setPagesState(pages);
  }, [pages]);

  const page = pagesState[pageIndex];
  const elements = page?.elements ?? [];
  const selected = elements.find((e) => e.id === selectedId);
  const bg = (page?.background as { color?: string; pattern?: string } | null) ?? {};
  const bgColor = bg.color ?? "#ffffff";
  const bgPattern = bg.pattern ?? null;
  const patternImg = useLoadedImage(patternDataUri(bgPattern) ?? undefined);
  const spread = page?.isSpread ?? false;
  const canvasW = spread ? PAGE_W * 2 : PAGE_W;

  function commit(next: AlbumPage[]) {
    setHistory((h) => [...h, pagesState]);
    setFuture([]);
    setPagesState(next);
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
    try {
      const updated = await window.albumforge.albums.savePage(albumId, p.id, {
        layoutKey: p.layoutKey,
        background: p.background,
        elements: p.elements.map((e) => ({
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
      setPagesState((prev) => prev.map((x) => (x.id === p.id ? updated : x)));
      setSelectedId(null);
      onPageUpdated(updated);
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
    if (!selected) return;
    void persist(
      pagesState.map((p) => (p.id === page.id ? { ...p, elements: p.elements.filter((e) => e.id !== selected.id) } : p)),
    );
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
      style: { shape, fill: "#6366f1", stroke: "#6366f1", strokeWidth: 2, opacity: 1, radius: 8 },
    };
    void persist(mutateElements([...elements, el]));
  }

  function addGraphic(graphicId: string) {
    const g = findGraphic(graphicId);
    if (!g) return;
    const maxZ = elements.reduce((m, e) => Math.max(m, e.z), -1);
    const w = 0.4;
    const h = w * (g.h / g.w);
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
      style: { graphicId, color: "#6366f1", opacity: 1 },
    };
    void persist(mutateElements([...elements, el]));
  }

  function moveSelectedZ(delta: number) {
    if (!selected) return;
    const sorted = [...elements].sort((a, b) => a.z - b.z);
    const idx = sorted.findIndex((e) => e.id === selected.id);
    const target = idx + delta;
    if (idx < 0 || target < 0 || target >= sorted.length) return;
    const zA = sorted[idx].z;
    const zB = sorted[target].z;
    const next = elements.map((e) =>
      e.id === sorted[idx].id ? { ...e, z: zB } : e.id === sorted[target].id ? { ...e, z: zA } : e,
    );
    void persist(
      pagesState.map((p) => (p.id === page.id ? { ...p, elements: next.sort((a, b) => a.z - b.z) } : p)),
    );
  }

  async function changeLayout(layoutKey: string) {
    if (!page) return;
    const updated = await window.albumforge.albums.recomposePage(albumId, page.id, layoutKey);
    setPagesState((prev) => prev.map((p) => (p.id === page.id ? updated : p)));
    setSelectedId(null);
    onPageUpdated(updated);
  }

  function setBackground(color: string) {
    const p = { ...page, background: { color, pattern: bgPattern } };
    setPagesState((prev) => prev.map((x) => (x.id === p.id ? p : x)));
    void persist(pagesState.map((x) => (x.id === p.id ? p : x)));
  }

  function setPattern(patternId: string) {
    const p = { ...page, background: { color: bgColor, pattern: patternId || null } };
    setPagesState((prev) => prev.map((x) => (x.id === p.id ? p : x)));
    void persist(pagesState.map((x) => (x.id === p.id ? p : x)));
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
    setSelectedId(null);
    setPageIndex((i) => Math.min(i, Math.max(0, next.length - 1)));
  }

  const onTransformEnd = useCallback(
    (el: { id: string }) => (e: Konva.KonvaEventObject<Event>) => {
      const node = e.target as Konva.Group;
      updateElement(el.id, {
        x: node.x() / canvasW,
        y: node.y() / PAGE_H,
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
      updateElement(el.id, { x: node.x() / canvasW, y: node.y() / PAGE_H });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page?.id, PAGE_H, canvasW, pagesState],
  );

  useEffect(() => {
    if (trRef.current && selectedId) {
      const node = nodeRefs.current[selectedId];
      if (node) trRef.current.nodes([node]);
    }
  }, [selectedId, elements, pageIndex]);

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
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        deleteSelected();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!page) return null;

  const safeInset = canvasW * 0.05;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setPageIndex((i) => Math.max(0, i - 1))} className="btn-secondary !px-3 !py-1">
          ←
        </button>
        <span className="text-sm">
          Page {pageIndex + 1} / {pagesState.length}
        </span>
        <button onClick={() => setPageIndex((i) => Math.min(pagesState.length - 1, i + 1))} className="btn-secondary !px-3 !py-1">
          →
        </button>
        <button onClick={addPage} className="btn-secondary !px-3 !py-1">
          + Page
        </button>
        <button onClick={duplicatePage} className="btn-secondary !px-3 !py-1">
          Duplicate
        </button>
        <button onClick={deletePage} className="btn-secondary !px-3 !py-1 !text-red-600 hover:!bg-red-50">
          Delete page
        </button>

        {layouts.length > 0 && (
          <select
            value={page.layoutKey ?? ""}
            onChange={(e) => changeLayout(e.target.value)}
            className="input !w-auto !px-2 !py-1 text-sm"
          >
            {layouts.map((l) => (
              <option key={l.key} value={l.key}>
                Layout: {l.name}
              </option>
            ))}
          </select>
        )}

        <label className="flex items-center gap-1 text-sm text-slate-600">
          Background
          <input
            type="color"
            value={bgColor}
            onChange={(e) => setBackground(e.target.value)}
            className="h-6 w-8 cursor-pointer rounded border border-slate-300"
          />
        </label>

        <select
          value={bgPattern ?? ""}
          onChange={(e) => setPattern(e.target.value)}
          className="input !w-auto !px-2 !py-1 text-sm"
          title="Page pattern"
        >
          <option value="">No pattern</option>
          {PAGE_PATTERNS.map((p) => (
            <option key={p.id} value={p.id}>
              Pattern: {p.name}
            </option>
          ))}
        </select>

        <button onClick={() => setPicker("add")} className="btn-secondary !px-3 !py-1">
          Add photo
        </button>
        <button
          onClick={() => setPicker("replace")}
          disabled={!selected || selected.type !== "image"}
          className="btn-secondary !px-3 !py-1"
        >
          Replace
        </button>
        <button onClick={deleteSelected} disabled={!selected} className="btn-secondary !px-3 !py-1">
          Delete
        </button>
        <button onClick={addText} className="btn-secondary !px-3 !py-1">
          Add text
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
        </select>

        {selected && (
          <>
            <button onClick={() => moveSelectedZ(1)} className="btn-secondary !px-2 !py-1 text-xs" title="Bring forward">
              Forward
            </button>
            <button onClick={() => moveSelectedZ(-1)} className="btn-secondary !px-2 !py-1 text-xs" title="Send backward">
              Backward
            </button>
          </>
        )}

        {selected?.type === "text" && (
          <>
            <select
              value={(selected.style as { fontFamily?: string } | null)?.fontFamily ?? ""}
              onChange={(e) =>
                updateElement(selected.id, {
                  style: { ...(selected.style ?? {}), fontFamily: e.target.value || undefined },
                })
              }
              className="input !w-auto !px-2 !py-1 text-sm"
              title="Font"
            >
              <option value="">Default font</option>
              {fonts.map((f) => (
                <option key={f} value={f} style={{ fontFamily: `'${f}'` }}>
                  {f}
                </option>
              ))}
            </select>
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
              className="input !w-20 !px-2 !py-1 text-sm"
              title="Font size"
            />
            <input
              type="color"
              value={(selected.style as { color?: string } | null)?.color ?? "#000000"}
              onChange={(e) =>
                updateElement(selected.id, {
                  style: { ...(selected.style ?? {}), color: e.target.value },
                })
              }
              className="h-6 w-8 cursor-pointer rounded border border-slate-300"
              title="Text color"
            />
          </>
        )}

        {selected?.type === "shape" && (
          <>
            <input
              type="color"
              value={(selected.style as { fill?: string } | null)?.fill ?? "#6366f1"}
              onChange={(e) =>
                updateElement(selected.id, {
                  style: { ...(selected.style ?? {}), fill: e.target.value },
                })
              }
              className="h-6 w-8 cursor-pointer rounded border border-slate-300"
              title="Fill color"
            />
            <input
              type="color"
              value={(selected.style as { stroke?: string } | null)?.stroke ?? "#6366f1"}
              onChange={(e) =>
                updateElement(selected.id, {
                  style: { ...(selected.style ?? {}), stroke: e.target.value },
                })
              }
              className="h-6 w-8 cursor-pointer rounded border border-slate-300"
              title="Stroke color"
            />
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
              className="input !w-16 !px-2 !py-1 text-sm"
              title="Stroke width"
            />
          </>
        )}

        {selected?.type === "graphic" && (
          <input
            type="color"
            value={(selected.style as { color?: string } | null)?.color ?? "#6366f1"}
            onChange={(e) =>
              updateElement(selected.id, {
                style: { ...(selected.style ?? {}), color: e.target.value },
              })
            }
            className="h-6 w-8 cursor-pointer rounded border border-slate-300"
            title="Graphic color"
          />
        )}

        {(selected?.type === "shape" || selected?.type === "graphic") && (
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
            className="input !w-16 !px-2 !py-1 text-sm"
            title="Opacity"
          />
        )}

        <div className="ml-auto flex gap-2">
          <button onClick={undo} className="btn-secondary !px-3 !py-1">
            Undo
          </button>
          <button onClick={redo} className="btn-secondary !px-3 !py-1">
            Redo
          </button>
          <button onClick={() => persist(pagesState)} disabled={saving} className="btn-primary !px-4 !py-1">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <div className="flex justify-center overflow-x-auto rounded-lg bg-neutral-200 p-6">
        <Stage width={canvasW + 80} height={PAGE_H + 80}>
          <Layer>
            <Rect
              x={40}
              y={40}
              width={canvasW}
              height={PAGE_H}
              fill={bgColor}
              stroke="#ccc"
              onClick={() => setSelectedId(null)}
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
            {elements.map((el) => (
              <ElementNode
                key={el.id}
                el={el}
                pageX={40}
                pageY={40}
                pageW={canvasW}
                pageH={PAGE_H}
                selected={selectedId === el.id}
                nodeRef={(n) => {
                  nodeRefs.current[el.id] = n;
                }}
                onSelect={() => setSelectedId(el.id)}
                onDragEnd={onDragEnd(el)}
                onTransformEnd={onTransformEnd(el)}
                onEditTextRequest={(el) => {
                  const content = (el.text as { content?: string } | null)?.content ?? "";
                  setPrompt({
                    title: "Edit text",
                    initial: content,
                    onConfirm: (v) => updateElement(el.id, { text: { content: v } }),
                  });
                }}
              />
            ))}
            <Transformer ref={trRef} rotateEnabled anchorSize={8} />
          </Layer>
        </Stage>
      </div>

      {picker && (
        <PhotoPicker
          projectId={projectId}
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

function ElementNode({
  el,
  pageX,
  pageY,
  pageW,
  pageH,
  selected,
  nodeRef,
  onSelect,
  onDragEnd,
  onTransformEnd,
  onEditTextRequest,
}: {
  el: AlbumElement;
  pageX: number;
  pageY: number;
  pageW: number;
  pageH: number;
  selected: boolean;
  nodeRef: (n: Konva.Group | null) => void;
  onSelect: () => void;
  onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onTransformEnd: (e: Konva.KonvaEventObject<Event>) => void;
  onEditTextRequest: (el: AlbumElement) => void;
}) {
  const x = pageX + el.x * pageW;
  const y = pageY + el.y * pageH;
  const w = el.width * pageW;
  const h = el.height * pageH;

  const img = useLoadedImage(el.photoId ? `media://preview1024/${el.photoId}` : undefined);

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
        x={x}
        y={y}
        width={w}
        height={h}
        rotation={el.rotation}
        opacity={s.opacity ?? 1}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={onDragEnd}
        onTransformEnd={onTransformEnd}
      >
        {shapeNode}
        {selected && <Rect width={w} height={h} stroke="#5b5bd6" strokeWidth={1} listening={false} />}
      </Group>
    );
  }

  if (el.type === "graphic") {
    const g = findGraphic((el.style as { graphicId?: string } | null)?.graphicId ?? "");
    const color = (el.style as { color?: string } | null)?.color ?? "#0f172a";
    const opacity = (el.style as { opacity?: number } | null)?.opacity ?? 1;
    return (
      <Group
        ref={nodeRef}
        x={x}
        y={y}
        width={w}
        height={h}
        rotation={el.rotation}
        opacity={opacity}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={onDragEnd}
        onTransformEnd={onTransformEnd}
      >
        {g && (
          <Group scaleX={w / g.w} scaleY={h / g.h}>
            {g.paths.map((p, i) => (
              <Path key={i} data={p.d} fill={p.mode === "stroke" ? undefined : color} stroke={color} strokeWidth={Math.max(1, (2 * g.w) / 100)} lineJoin="round" />
            ))}
          </Group>
        )}
        {selected && <Rect width={w} height={h} stroke="#5b5bd6" strokeWidth={1} listening={false} />}
      </Group>
    );
  }

  if (el.type === "text" || el.type === "background") {
    const content = (el.text as { content?: string } | null)?.content ?? "";
    return (
      <Group
        ref={nodeRef}
        x={x}
        y={y}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDblClick={() => onEditTextRequest(el)}
        onDragEnd={onDragEnd}
        onTransformEnd={onTransformEnd}
      >
        {el.type === "background" ? (
          <Rect width={w} height={h} fill={(el.style as { color?: string } | null)?.color || "#fff"} />
        ) : (
          <KText
            text={content}
            fontSize={(el.style as { fontSize?: number } | null)?.fontSize ?? 28}
            fontFamily={(el.style as { fontFamily?: string } | null)?.fontFamily || "sans-serif"}
            fill={(el.style as { color?: string } | null)?.color ?? "#000"}
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

  return (
    <Group
      ref={nodeRef}
      x={x}
      y={y}
      width={w}
      height={h}
      rotation={el.rotation}
      draggable
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={onDragEnd}
      onTransformEnd={onTransformEnd}
    >
      {img && cropPx ? (
        <KImage image={img} crop={cropPx} width={w} height={h} />
      ) : (
        <Rect width={w} height={h} fill="#eee" />
      )}
      {selected && <Rect width={w} height={h} stroke="#5b5bd6" strokeWidth={1} listening={false} />}
    </Group>
  );
}

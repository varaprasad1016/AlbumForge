import { useCallback, useEffect, useRef, useState } from "react";
import {
  Group,
  Image as KImage,
  Layer,
  Line,
  Rect,
  Stage,
  Text as KText,
  Transformer,
} from "react-konva";
import type Konva from "konva";
import type { AlbumElement, AlbumPage, PageSize } from "@shared/api";
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

  const [pageIndex, setPageIndex] = useState(0);
  const [pagesState, setPagesState] = useState<AlbumPage[]>(pages);
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
  const background = (page?.background as { color?: string } | null)?.color ?? "#ffffff";

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

  async function changeLayout(layoutKey: string) {
    if (!page) return;
    const updated = await window.albumforge.albums.recomposePage(albumId, page.id, layoutKey);
    setPagesState((prev) => prev.map((p) => (p.id === page.id ? updated : p)));
    setSelectedId(null);
    onPageUpdated(updated);
  }

  function setBackground(color: string) {
    const p = { ...page, background: { color } };
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
        x: node.x() / PAGE_W,
        y: node.y() / PAGE_H,
        width: (node.width() * node.scaleX()) / PAGE_W,
        height: (node.height() * node.scaleY()) / PAGE_H,
        rotation: node.rotation(),
      });
      node.scaleX(1);
      node.scaleY(1);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page?.id, PAGE_H, pagesState],
  );

  const onDragEnd = useCallback(
    (el: { id: string }) => (e: Konva.KonvaEventObject<DragEvent>) => {
      const node = e.target as Konva.Group;
      updateElement(el.id, { x: node.x() / PAGE_W, y: node.y() / PAGE_H });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page?.id, PAGE_H, pagesState],
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

  const safeInset = PAGE_W * 0.05;

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
            value={background}
            onChange={(e) => setBackground(e.target.value)}
            className="h-6 w-8 cursor-pointer rounded border border-slate-300"
          />
        </label>

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
          </>
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

      <div className="flex justify-center rounded-lg bg-neutral-200 p-6">
        <Stage width={PAGE_W + 80} height={PAGE_H + 80}>
          <Layer>
            <Rect
              x={40}
              y={40}
              width={PAGE_W}
              height={PAGE_H}
              fill={background}
              stroke="#ccc"
              onClick={() => setSelectedId(null)}
            />
            <Line
              points={[
                40 + safeInset, 40 + safeInset,
                40 + PAGE_W - safeInset, 40 + safeInset,
                40 + PAGE_W - safeInset, 40 + PAGE_H - safeInset,
                40 + safeInset, 40 + PAGE_H - safeInset,
                40 + safeInset, 40 + safeInset,
              ]}
              stroke="#5b5bd6"
              dash={[6, 4]}
              listening={false}
            />
            {elements.map((el) => (
              <ElementNode
                key={el.id}
                el={el}
                pageX={40}
                pageY={40}
                pageW={PAGE_W}
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

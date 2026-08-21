import { useCallback, useEffect, useRef, useState } from "react";
import { FixedSizeGrid } from "react-window";
import type { Photo } from "@shared/api";
import Thumb from "./Thumb";

const CELL = 156;
const GAP = 8;

interface CellData {
  photos: Photo[];
  columnCount: number;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onDelete?: (id: string) => void;
  onSetThumbnail?: (id: string) => void;
}

function PhotoCell({
  columnIndex,
  rowIndex,
  style,
  data,
}: {
  columnIndex: number;
  rowIndex: number;
  style: React.CSSProperties;
  data: CellData;
}) {
  const index = rowIndex * data.columnCount + columnIndex;
  const photo = data.photos[index];
  if (!photo) return <div style={style} />;

  const selected = data.selected.has(photo.id);

  return (
    <div style={style} className="p-1">
      <div
        onClick={() => data.onToggle(photo.id)}
        className={`group relative h-full w-full cursor-pointer overflow-hidden rounded border-2 ${
          selected ? "border-brand" : "border-transparent"
        }`}
      >
        <Thumb id={photo.id} className="h-full w-full object-cover" alt={photo.filename} />
        {selected && (
          <div className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-brand text-xs text-white">
            ✓
          </div>
        )}
        {data.onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              data.onDelete!(photo.id);
            }}
            title="Delete photo"
            className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-md bg-white/90 text-xs text-slate-500 opacity-0 shadow-sm transition-opacity hover:bg-red-600 hover:text-white group-hover:opacity-100"
          >
            ✕
          </button>
        )}
        {data.onSetThumbnail && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              data.onSetThumbnail!(photo.id);
            }}
            title="Set as project thumbnail"
            className="absolute bottom-1 right-1 flex h-6 w-6 items-center justify-center rounded-md bg-white/90 text-sm text-amber-500 opacity-0 shadow-sm transition-opacity hover:bg-amber-500 hover:text-white group-hover:opacity-100"
          >
            ★
          </button>
        )}
      </div>
    </div>
  );
}

export default function PhotoGallery({
  photos,
  selected,
  onToggle,
  onDelete,
  onSetThumbnail,
  onLoadMore,
  hasMore,
}: {
  photos: Photo[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onDelete?: (id: string) => void;
  onSetThumbnail?: (id: string) => void;
  onLoadMore: () => void;
  hasMore: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const columnCount = Math.max(1, Math.floor((width + GAP) / (CELL + GAP)));
  const rowCount = Math.ceil(photos.length / columnCount);

  const onScroll = useCallback(
    ({ scrollTop, scrollHeight, clientHeight }: { scrollTop: number; scrollHeight: number; clientHeight: number }) => {
      if (scrollTop + clientHeight >= scrollHeight - 400 && hasMore) onLoadMore();
    },
    [hasMore, onLoadMore],
  );

  const itemData: CellData = { photos, columnCount, selected, onToggle, onDelete, onSetThumbnail };

  return (
    <div ref={containerRef} className="h-[70vh]">
      {width > 0 && (
        <FixedSizeGrid
          columnCount={columnCount}
          columnWidth={CELL + GAP}
          rowCount={rowCount}
          rowHeight={CELL + GAP}
          width={width}
          height={700}
          itemData={itemData}
          onScroll={onScroll as never}
        >
          {PhotoCell}
        </FixedSizeGrid>
      )}
    </div>
  );
}

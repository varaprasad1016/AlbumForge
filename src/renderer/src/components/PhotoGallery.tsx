import { useCallback, useEffect, useRef, useState } from "react";
import { FixedSizeGrid } from "react-window";
import type { Photo } from "@shared/api";

const CELL = 156;
const GAP = 8;

interface CellData {
  photos: Photo[];
  columnCount: number;
  selected: Set<string>;
  onToggle: (id: string) => void;
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
        className={`relative h-full w-full cursor-pointer overflow-hidden rounded border-2 ${
          selected ? "border-brand" : "border-transparent"
        }`}
      >
        <img
          src={`media://thumb256/${photo.id}`}
          alt={photo.filename}
          loading="lazy"
          draggable={false}
          className="h-full w-full object-cover"
        />
        {selected && (
          <div className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-brand text-xs text-white">
            ✓
          </div>
        )}
      </div>
    </div>
  );
}

export default function PhotoGallery({
  photos,
  selected,
  onToggle,
  onLoadMore,
  hasMore,
}: {
  photos: Photo[];
  selected: Set<string>;
  onToggle: (id: string) => void;
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

  const itemData: CellData = { photos, columnCount, selected, onToggle };

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

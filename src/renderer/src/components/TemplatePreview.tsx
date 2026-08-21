import type { SlotDef } from "@shared/api";

function shade(area: number): string {
  if (area > 0.4) return "#c7d2fe";
  if (area > 0.2) return "#e0e7ff";
  return "#eef2ff";
}

export default function TemplatePreview({
  layouts,
}: {
  layouts: Array<{ key: string; name: string; slots: SlotDef[] }>;
}) {
  const shown = layouts.slice(0, 3);
  return (
    <div className="flex gap-2">
      {shown.map((l) => (
        <div key={l.key} className="flex-1">
          <div className="aspect-square w-full overflow-hidden rounded border border-neutral-200 bg-white p-1">
            <svg viewBox="0 0 100 100" className="h-full w-full" preserveAspectRatio="none">
              {l.slots.map((s, i) => (
                <rect
                  key={i}
                  x={s.x * 100}
                  y={s.y * 100}
                  width={s.w * 100}
                  height={s.h * 100}
                  fill={shade(s.w * s.h)}
                  stroke="#6366f1"
                  strokeWidth="0.4"
                  rx="0.8"
                />
              ))}
            </svg>
          </div>
          <p className="mt-1 truncate text-center text-[10px] text-neutral-400">{l.name}</p>
        </div>
      ))}
    </div>
  );
}

import { useEffect, useState } from "react";

type ToastItem = { id: number; message: string; kind: "success" | "error" };

let counter = 0;
const listeners = new Set<(t: ToastItem) => void>();

export function toast(message: string, kind: "success" | "error" = "success"): void {
  for (const cb of listeners) cb({ id: ++counter, message, kind });
}

export default function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const cb = (t: ToastItem) => {
      setItems((prev) => [...prev, t]);
      setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== t.id)), 3200);
    };
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }, []);

  return (
    <div className="fixed bottom-5 right-5 z-[9999] space-y-2">
      {items.map((t) => (
        <div
          key={t.id}
          className={`flex max-w-sm items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg ${
            t.kind === "success" ? "bg-slate-800/95" : "bg-red-600/95"
          }`}
          style={{ animation: "toast-in 0.2s ease" }}
        >
          {t.kind === "success" ? (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-400/90 text-[10px] text-slate-900">✓</span>
          ) : (
            <span className="text-base leading-none">!</span>
          )}
          {t.message}
        </div>
      ))}
    </div>
  );
}

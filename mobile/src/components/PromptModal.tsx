import { useState } from "react";

export default function PromptModal({
  title,
  defaultValue = "",
  placeholder,
  onConfirm,
  onCancel,
}: {
  title: string;
  defaultValue?: string;
  placeholder?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(defaultValue);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div
        className="w-96 rounded-2xl border border-slate-200 bg-white p-4 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3 font-semibold text-ink">{title}</h3>
        <input
          autoFocus
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onConfirm(value);
            if (e.key === "Escape") onCancel();
          }}
          className="input"
        />
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={onCancel} className="btn-secondary !px-3 !py-1.5">
            Cancel
          </button>
          <button onClick={() => onConfirm(value)} className="btn-primary !px-3 !py-1.5">
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

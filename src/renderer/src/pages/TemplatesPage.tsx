import { useEffect, useState } from "react";
import TemplatePreview from "../components/TemplatePreview";
import type { TemplateDetail } from "@shared/api";

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<TemplateDetail[]>([]);

  useEffect(() => {
    (async () => {
      const list = await window.albumforge.templates.list();
      const details = await Promise.all(list.map((t) => window.albumforge.templates.get(t.id)));
      setTemplates(details.filter((d): d is TemplateDetail => d !== null));
    })();
  }, []);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Templates</h1>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((t) => (
          <li key={t.id} className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="font-semibold">{t.name}</span>
              <span className="text-xs text-neutral-400">{t.key}</span>
            </div>
            {t.description && <p className="mb-3 text-sm text-neutral-500">{t.description}</p>}
            <TemplatePreview
              layouts={t.layouts.map((l) => ({ key: l.key, name: l.name, slots: l.slots }))}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

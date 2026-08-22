import { useEffect, useState } from "react";
import { t, useLang } from "../lib/i18n";

const TABS = [
  { key: "projects", href: "#/projects", labelKey: "nav.projects" },
  { key: "templates", href: "#/templates", labelKey: "nav.templates" },
  { key: "albums", href: "#/albums", labelKey: "nav.albums" },
  { key: "settings", href: "#/settings", labelKey: "nav.settings" },
];

function Icon({ name, active }: { name: string; active: boolean }) {
  const cls = active ? "text-brand" : "text-slate-400";
  switch (name) {
    case "projects":
      return (
        <svg viewBox="0 0 24 24" className={`h-6 w-6 ${cls}`} fill="none" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
        </svg>
      );
    case "templates":
      return (
        <svg viewBox="0 0 24 24" className={`h-6 w-6 ${cls}`} fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      );
    case "albums":
      return (
        <svg viewBox="0 0 24 24" className={`h-6 w-6 ${cls}`} fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="8.5" cy="10" r="1.5" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 16l4-4 3 3 2.5-2.5L20 16" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" className={`h-6 w-6 ${cls}`} fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="3" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v3m0 14v3M2 12h3m14 0h3M4.9 4.9l2.1 2.1m10 10l2.1 2.1m0-14.2l-2.1 2.1m-10 10l-2.1 2.1" />
        </svg>
      );
  }
}

export default function Nav() {
  const [root, setRoot] = useState(() => (window.location.hash.replace(/^#/, "").split("/")[1] || "projects"));
  useLang();

  useEffect(() => {
    const onChange = () => setRoot(window.location.hash.replace(/^#/, "").split("/")[1] || "projects");
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-surface/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex">
        {TABS.map((t) => {
          const active = root === t.key;
          return (
            <a key={t.key} href={t.href} className="flex flex-1 flex-col items-center gap-0.5 py-2">
              <Icon name={t.key} active={active} />
              <span className={`text-[11px] font-medium ${active ? "text-brand" : "text-slate-400"}`}>{t(t.labelKey)}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}

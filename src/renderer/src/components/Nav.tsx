import { backendBadge } from "../lib/backend";
import { t, useLang } from "../i18n";
import { useTheme } from "../theme";

const LINKS = [
  {
    href: "#/projects",
    key: "nav.projects",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
      </svg>
    ),
  },
  {
    href: "#/templates",
    key: "nav.templates",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    href: "#/albums",
    key: "nav.albums",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.5C10.5 5 8.6 4 6.5 4 4.4 4 3 5.4 3 7.5v9.2C3 18.6 4.4 20 6.5 20c2.1 0 4-.9 5.5-2.5 1.5 1.6 3.4 2.5 5.5 2.5 2.1 0 3.5-1.4 3.5-3.3V7.5C21 5.4 19.6 4 17.5 4c-2.1 0-4 1-5.5 2.5z" />
      </svg>
    ),
  },
  {
    href: "#/settings",
    key: "nav.settings",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="3" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v3m0 14v3M2 12h3m14 0h3M4.9 4.9l2.1 2.1m10 10l2.1 2.1m0-14.2l-2.1 2.1m-10 10l-2.1 2.1" />
      </svg>
    ),
  },
];

export default function Nav() {
  const { dark, toggle } = useTheme();
  useLang();
  const current = window.location.hash.replace(/^#/, "").split("/")[0] || "projects";

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-slate-200/60 bg-surface/85 backdrop-blur-xl">
      <a href="#/projects" className="flex items-center gap-3 px-5 pb-4 pt-6">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 via-amber-600 to-yellow-700 font-display text-lg font-bold text-white shadow-lg shadow-amber-500/30">
          A
        </span>
        <div>
          <div className="font-display text-lg font-bold leading-tight tracking-tight text-ink">AlbumForge</div>
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">Album studio</div>
        </div>
      </a>

      <nav className="mt-2 flex-1 space-y-1 px-3">
        {LINKS.map((l) => {
          const active = current === l.href.replace("#/", "");
          return (
            <a
              key={l.href}
              href={l.href}
              className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-150 ${
                active
                  ? "bg-gradient-to-r from-amber-500/10 to-yellow-600/10 text-brand"
                  : "text-slate-500 hover:bg-slate-100/80 hover:text-slate-700"
              }`}
            >
              {active && <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full bg-gradient-to-b from-amber-500 to-yellow-700" />}
              {l.icon}
              {t(l.key)}
            </a>
          );
        })}
      </nav>

      <div className="space-y-3 border-t border-slate-200/60 p-4">
        <div
          title={backendBadge.hint}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-slate-50/80 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400"
        >
          <span className={`h-1.5 w-1.5 rounded-full ${backendBadge.dot}`} />
          {backendBadge.text}
        </div>
        <button
          onClick={toggle}
          className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-slate-300"
        >
          <span>{dark ? t("nav.light") : t("nav.dark")}</span>
          <span className={`relative h-5 w-9 rounded-full transition-colors ${dark ? "bg-indigo-500" : "bg-slate-300"}`}>
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${dark ? "left-[18px]" : "left-0.5"}`} />
          </span>
        </button>
        <div className="chip w-full justify-center border-emerald-200 bg-emerald-50 text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {t("nav.local")}
        </div>
      </div>
    </aside>
  );
}

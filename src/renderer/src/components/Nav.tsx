import { t, useLang } from "../i18n";
import { useTheme } from "../theme";

const LINKS = [
  { href: "#/projects", key: "nav.projects" },
  { href: "#/templates", key: "nav.templates" },
  { href: "#/albums", key: "nav.albums" },
  { href: "#/settings", key: "nav.settings" },
];

export default function Nav() {
  const { dark, toggle } = useTheme();
  useLang();
  return (
    <nav className="sticky top-0 z-40 border-b border-slate-200/70 bg-surface/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-3">
        <a href="#/projects" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white shadow-sm">
            A
          </span>
          <span className="text-lg font-bold tracking-tight text-ink">AlbumForge</span>
        </a>
        <div className="flex items-center gap-1 text-sm">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-lg px-3 py-1.5 font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-ink"
            >
              {t(l.key)}
            </a>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={toggle}
            title={dark ? t("nav.light") : t("nav.dark")}
            className="btn-secondary !px-3 !py-1.5 text-xs"
          >
            {dark ? t("nav.light") : t("nav.dark")}
          </button>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {t("nav.local")}
          </span>
        </div>
      </div>
    </nav>
  );
}

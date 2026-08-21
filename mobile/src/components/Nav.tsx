const LINKS = [
  { href: "#/projects", label: "Projects" },
  { href: "#/templates", label: "Templates" },
  { href: "#/albums", label: "Albums" },
  { href: "#/settings", label: "Settings" },
];

export default function Nav() {
  return (
    <nav className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur-md">
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
              {l.label}
            </a>
          ))}
        </div>
        <div className="ml-auto">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Local · no cloud
          </span>
        </div>
      </div>
    </nav>
  );
}

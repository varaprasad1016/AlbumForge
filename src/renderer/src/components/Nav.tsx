const LINKS = [
  { href: "#/projects", label: "Projects" },
  { href: "#/templates", label: "Templates" },
  { href: "#/albums", label: "Albums" },
  { href: "#/settings", label: "Settings" },
];

export default function Nav() {
  return (
    <nav className="flex items-center gap-6 border-b border-neutral-200 bg-white px-6 py-3">
      <a href="#/projects" className="text-lg font-bold tracking-tight text-brand">
        AlbumForge
      </a>
      <div className="flex items-center gap-4 text-sm">
        {LINKS.map((l) => (
          <a key={l.href} href={l.href} className="text-neutral-500 hover:text-neutral-800">
            {l.label}
          </a>
        ))}
      </div>
      <div className="ml-auto text-xs text-neutral-400">Local · no cloud</div>
    </nav>
  );
}

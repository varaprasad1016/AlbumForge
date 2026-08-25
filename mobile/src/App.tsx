import { lazy, Suspense, useEffect, useState } from "react";
import Nav from "./components/Nav";
import AlbumsPage from "./pages/AlbumsPage";
import AlbumPage from "./pages/AlbumPage";
import ProjectPage from "./pages/ProjectPage";
import ProjectsPage from "./pages/ProjectsPage";
import SettingsPage from "./pages/SettingsPage";
import TemplatesPage from "./pages/TemplatesPage";

const MapPage = lazy(() => import("./pages/MapPage"));

function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

export default function App() {
  const raw = useHash().replace(/^#/, "");
  const parts = raw.split("/").filter(Boolean);
  const [root, id] = parts;

  let page: React.ReactNode;
  if (root === "projects" && id) page = <ProjectPage projectId={id} />;
  else if (root === "projects") page = <ProjectsPage />;
  else if (root === "albums" && id) page = <AlbumPage albumId={id} />;
  else if (root === "albums") page = <AlbumsPage />;
  else if (root === "map" && id) page = (
    <Suspense fallback={<div className="p-6 text-slate-400">Loading map…</div>}>
      <MapPage projectId={id} />
    </Suspense>
  );
  else if (root === "templates") page = <TemplatesPage />;
  else if (root === "settings") page = <SettingsPage />;
  else page = <ProjectsPage />;

  return (
    <div className="min-h-screen bg-[#fcfaf5]">
      <header className="sticky top-0 z-30 border-b border-[#eadfce] bg-[#fffdf8]/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <a href="#/projects" className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-yellow-700 text-lg font-bold text-white shadow-sm">A</span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate font-display text-lg font-semibold text-ink">AlbumForge</span>
              <span className="block text-[11px] uppercase tracking-[0.18em] text-slate-400">Studio</span>
            </span>
          </a>
          <div className="hidden items-center gap-2 sm:flex">
            <a href="#/templates" className="btn-ghost">Templates</a>
            <a href="#/settings" className="btn-ghost">Settings</a>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-6 sm:px-6">{page}</main>
      <Nav />
    </div>
  );
}

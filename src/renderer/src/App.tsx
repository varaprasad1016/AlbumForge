import { lazy, Suspense, useEffect, useState } from "react";
import Nav from "./components/Nav";
import ToastHost from "./components/Toast";
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

  const wide = root === "albums" && !!id;

  return (
    <div className="min-h-screen">
      <Nav />
      <main className={`ml-60 ${wide ? "p-6" : "mx-auto max-w-7xl p-8"}`}>{page}</main>
      <ToastHost />
    </div>
  );
}

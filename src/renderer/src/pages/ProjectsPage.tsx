import { useEffect, useState } from "react";
import type { Project } from "@shared/api";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");

  async function load() {
    setProjects(await window.albumforge.projects.list());
  }

  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await window.albumforge.projects.create({ name, clientName: clientName || undefined });
    setName("");
    setClientName("");
    await load();
  }

  async function deleteProject(p: Project) {
    if (!window.confirm(`Delete project "${p.name}" and all its photos and albums? This cannot be undone.`)) return;
    await window.albumforge.projects.remove(p.id);
    await load();
  }

  return (
    <div>
      {projects.length === 0 && (
        <div className="card mb-8 overflow-hidden">
          <div className="bg-gradient-to-br from-[#9b6a2d] via-[#c99a55] to-[#ead19f] p-8 text-center text-white">
            <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 text-xl font-bold backdrop-blur">
              A
            </span>
            <h2 className="text-2xl font-bold">Welcome to AlbumForge</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-amber-50">
              Turn thousands of finished photographs into professionally laid-out albums
              automatically — create a project, import your photos, pick a template, and
              generate complete album proposals. All on this computer, nothing uploaded.
            </p>
          </div>
          <div className="p-6">
            <h1 className="mb-3 text-lg font-semibold text-ink">Create your first project</h1>
            <form onSubmit={create} className="flex flex-wrap gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Project name (e.g. Wedding — John & Sarah)"
                className="input flex-1 min-w-[220px]"
              />
              <input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Client (optional)"
                className="input w-48"
              />
              <button type="submit" className="btn-primary">
                Create project
              </button>
            </form>
          </div>
        </div>
      )}

      {projects.length > 0 && (
        <>
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-2xl font-bold">Projects</h1>
          </div>

          <form onSubmit={create} className="mb-6 flex flex-wrap gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Project name (e.g. Wedding — John & Sarah)"
              className="input flex-1 min-w-[220px]"
            />
            <input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Client (optional)"
              className="input w-48"
            />
            <button type="submit" className="btn-primary">
              Create project
            </button>
          </form>

          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <li key={p.id} className="group relative">
                <a
                  href={`#/projects/${p.id}`}
                  className="card block overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:shadow-lift"
                >
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100">
                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-amber-100 to-yellow-100 text-4xl font-display font-bold text-amber-700">
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    {p.thumbnailPhotoId && (
                      <img
                        src={`media://preview1024/${p.thumbnailPhotoId}`}
                        alt={p.name}
                        draggable={false}
                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    )}
                    <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-slate-900/50 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                    <span className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-sm text-slate-600 opacity-0 shadow transition-opacity duration-200 group-hover:opacity-100">
                      →
                    </span>
                  </div>
                  <div className="p-4">
                    <div className="truncate font-semibold text-ink group-hover:text-brand">{p.name}</div>
                    {p.clientName && <div className="truncate text-sm text-slate-400">{p.clientName}</div>}
                  </div>
                </a>
                <button
                  onClick={() => deleteProject(p)}
                  title="Delete project"
                  className="absolute right-3 top-3 rounded-lg bg-white/90 p-1.5 text-slate-400 opacity-0 shadow transition-opacity hover:bg-red-600 hover:text-white group-hover:opacity-100"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

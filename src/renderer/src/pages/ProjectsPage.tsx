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

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Projects</h1>

      {projects.length === 0 && (
        <div className="mb-8 rounded-lg border border-brand/20 bg-white p-8 text-center">
          <h2 className="text-xl font-semibold text-ink">Welcome to AlbumForge</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-neutral-500">
            Turn thousands of finished photographs into professionally laid-out albums
            automatically. Create a project, import your photos, choose a template, and
            generate complete album proposals — all on this computer, nothing uploaded.
          </p>
          <p className="mt-4 text-sm text-neutral-600">Create your first project below to get started.</p>
        </div>
      )}

      <form onSubmit={create} className="mb-6 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Project name (e.g. Wedding — John & Sarah)"
          className="flex-1 rounded border border-neutral-300 px-3 py-2 text-sm"
        />
        <input
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          placeholder="Client (optional)"
          className="w-56 rounded border border-neutral-300 px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white">
          Create project
        </button>
      </form>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => (
          <li key={p.id}>
            <a
              href={`#/projects/${p.id}`}
              className="block rounded-lg border border-neutral-200 bg-white p-4 hover:border-brand"
            >
              <div className="font-semibold">{p.name}</div>
              {p.clientName && <div className="text-sm text-neutral-400">{p.clientName}</div>}
            </a>
          </li>
        ))}
        {projects.length === 0 && <p className="col-span-full text-neutral-400">No projects yet.</p>}
      </ul>
    </div>
  );
}

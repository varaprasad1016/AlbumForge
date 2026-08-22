/** Projects, photos, groups, templates and fonts API (mobile). */
import { all, bytesToBase64, get, newId, now, persistDb, run, writeDataFile } from "./db";
import { loadImage, phashOf, qualityOf, thumbnails } from "./imaging";
import { segmentByTime } from "./engine/grouping";
import { BUNDLED_FONTS } from "./fonts";
import { emitProgress, groupsList, onProgress } from "./backend-helpers";
import { photoDto, photoRecordsFor, projectDto } from "./generate";

async function fileGps(file: File): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const { default: exifr } = await import("exifr");
    const data = await exifr.parse(file, { gps: true });
    const lat = data?.latitude;
    const lng = data?.longitude;
    if (typeof lat === "number" && typeof lng === "number" && (lat !== 0 || lng !== 0)) {
      return { latitude: lat, longitude: lng };
    }
    return null;
  } catch {
    return null;
  }
}

export function buildCrudApi(): any {
  return {
    projects: {
      list: async () => {
        const rows = all("SELECT * FROM projects ORDER BY created_at DESC");
        return rows.map((r: any) => {
          let thumb: string | null = r.thumbnail_photo_id ?? null;
          if (!thumb) {
            const p = get("SELECT id FROM photos WHERE project_id = ? ORDER BY RANDOM() LIMIT 1", [r.id]);
            thumb = p?.id ?? null;
          }
          return { ...projectDto(r), thumbnailPhotoId: thumb };
        });
      },
      create: async (input: { name: string; clientName?: string; eventDate?: string }) => {
        const id = newId();
        run("INSERT INTO projects (id, name, client_name, event_date, status, created_at) VALUES (?, ?, ?, ?, 'active', ?)", [
          id, input.name, input.clientName ?? null, input.eventDate ?? null, now(),
        ]);
        await persistDb();
        return projectDto(get("SELECT * FROM projects WHERE id = ?", [id]));
      },
      get: async (id: string) => projectDto(get("SELECT * FROM projects WHERE id = ?", [id])),
      remove: async (id: string) => {
        run("DELETE FROM photos WHERE project_id = ?", [id]);
        run("DELETE FROM albums WHERE project_id = ?", [id]);
        run("DELETE FROM projects WHERE id = ?", [id]);
        await persistDb();
      },
      setThumbnail: async (projectId: string, photoId: string) => {
        run("UPDATE projects SET thumbnail_photo_id = ? WHERE id = ?", [photoId, projectId]);
        await persistDb();
      },
    },
    photos: {
      importPhotos: async (projectId: string, files: File[]) => {
        let imported = 0;
        let failed = 0;
        for (const file of files) {
          try {
            const id = newId();
            const buf = new Uint8Array(await file.arrayBuffer());
            await writeDataFile(`originals/${id}.jpg`, bytesToBase64(buf));
            const url = URL.createObjectURL(file);
            const img = await loadImage(url);
            const orientation =
              img.naturalWidth > img.naturalHeight ? "landscape" : img.naturalHeight > img.naturalWidth ? "portrait" : "square";
            const { thumb256, preview1024 } = await thumbnails(img);
            const phash = await phashOf(img);
            const { blurScore, qualityScore } = await qualityOf(img);
            const gps = await fileGps(file);
            URL.revokeObjectURL(url);
            run(
              "INSERT INTO photos (id, project_id, file_path, filename, width, height, orientation, file_size, mime_type, quality_score, blur_score, face_count, phash, processing_status, selected, thumbnail_path, preview_path, latitude, longitude, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'ready', 0, ?, ?, ?, ?, ?)",
              [id, projectId, `originals/${id}.jpg`, file.name, img.naturalWidth, img.naturalHeight, orientation, file.size, file.type || "image/jpeg", qualityScore, blurScore, phash.toString(), thumb256, preview1024, gps?.latitude ?? null, gps?.longitude ?? null, now()],
            );
            imported++;
            emitProgress({ current: imported + failed, total: files.length, filename: file.name, status: "done" });
          } catch {
            failed++;
            emitProgress({ current: imported + failed, total: files.length, filename: file.name, status: "error" });
          }
        }
        await persistDb();
        return { imported, failed };
      },
      list: async (projectId: string, opts: {
        offset: number;
        limit: number;
        selected?: boolean;
        status?: string;
        groupId?: string;
        query?: string;
        sort?: "created" | "captured";
      }) => {
        let where = "WHERE project_id = ?";
        const args: any[] = [projectId];
        if (opts.selected != null) {
          where += " AND selected = ?";
          args.push(opts.selected ? 1 : 0);
        }
        if (opts.groupId === "__none__") where += " AND group_id IS NULL";
        else if (opts.groupId) {
          where += " AND group_id = ?";
          args.push(opts.groupId);
        }
        if (opts.query && opts.query.trim()) {
          where += " AND filename LIKE ?";
          args.push(`%${opts.query.trim()}%`);
        }
        const orderBy =
          opts.sort === "captured" ? "ORDER BY exif_timestamp IS NULL, exif_timestamp" : "ORDER BY created_at";
        const total = (get(`SELECT COUNT(*) AS c FROM photos ${where}`, args)?.c as number) ?? 0;
        const rows = all(`SELECT * FROM photos ${where} ${orderBy} LIMIT ? OFFSET ?`, [...args, opts.limit, opts.offset]);
        return { items: rows.map(photoDto), total };
      },
      setSelected: async (photoId: string, selected: boolean) => {
        run("UPDATE photos SET selected = ? WHERE id = ?", [selected ? 1 : 0, photoId]);
        await persistDb();
      },
      geo: async (projectId: string) =>
        all(
          `SELECT id, filename, latitude, longitude, exif_timestamp
           FROM photos WHERE project_id = ? AND latitude IS NOT NULL AND longitude IS NOT NULL
           ORDER BY exif_timestamp`,
          [projectId],
        ).map((r: any) => ({
          id: r.id,
          filename: r.filename,
          latitude: r.latitude,
          longitude: r.longitude,
          takenAt: r.exif_timestamp ?? null,
        })),
      remove: async (photoId: string) => {
        run("DELETE FROM photos WHERE id = ?", [photoId]);
        await persistDb();
      },
      onImportProgress: (cb: (p: any) => void) => onProgress(cb),
    },
    groups: {
      auto: async (projectId: string) => {
        run("DELETE FROM photo_groups WHERE project_id = ?", [projectId]);
        run("UPDATE photos SET group_id = NULL WHERE project_id = ?", [projectId]);
        const records = photoRecordsFor(projectId, "all");
        const segments = segmentByTime(records);
        segments.forEach((seg, i) => {
          const gid = newId();
          run("INSERT INTO photo_groups (id, project_id, name, sort_order, created_at) VALUES (?, ?, ?, ?, ?)", [gid, projectId, `Group ${i + 1}`, i, now()]);
          for (const p of seg) run("UPDATE photos SET group_id = ? WHERE id = ?", [gid, p.id]);
        });
        await persistDb();
        return groupsList(projectId);
      },
      list: async (projectId: string) => groupsList(projectId),
      create: async (projectId: string, name: string) => {
        const gid = newId();
        const sort = (get("SELECT COUNT(*) AS c FROM photo_groups WHERE project_id = ?", [projectId])?.c as number) ?? 0;
        run("INSERT INTO photo_groups (id, project_id, name, sort_order, created_at) VALUES (?, ?, ?, ?, ?)", [gid, projectId, name, sort, now()]);
        await persistDb();
        return groupsList(projectId).find((g: any) => g.id === gid);
      },
      rename: async (groupId: string, name: string) => {
        run("UPDATE photo_groups SET name = ? WHERE id = ?", [name, groupId]);
        await persistDb();
      },
      remove: async (groupId: string) => {
        run("UPDATE photos SET group_id = NULL WHERE group_id = ?", [groupId]);
        run("DELETE FROM photo_groups WHERE id = ?", [groupId]);
        await persistDb();
      },
      assign: async (groupId: string, photoIds: string[]) => {
        for (const pid of photoIds) run("UPDATE photos SET group_id = ? WHERE id = ?", [groupId, pid]);
        await persistDb();
      },
      merge: async (projectId: string, groupIds: string[], name: string) => {
        const gid = newId();
        run("INSERT INTO photo_groups (id, project_id, name, sort_order, created_at) VALUES (?, ?, ?, 0, ?)", [gid, projectId, name, now()]);
        for (const g of groupIds) run("UPDATE photos SET group_id = ? WHERE group_id = ?", [gid, g]);
        for (const g of groupIds) run("DELETE FROM photo_groups WHERE id = ?", [g]);
        await persistDb();
        return groupsList(projectId).find((x: any) => x.id === gid);
      },
      split: async (projectId: string, groupId: string, photoIds: string[], name: string) => {
        const gid = newId();
        const sort = ((get("SELECT COALESCE(MAX(sort_order),0)+1 AS m FROM photo_groups WHERE project_id = ?", [projectId])?.m as number)) ?? 0;
        run("INSERT INTO photo_groups (id, project_id, name, sort_order, created_at) VALUES (?, ?, ?, ?, ?)", [gid, projectId, name, sort, now()]);
        for (const pid of photoIds) run("UPDATE photos SET group_id = ? WHERE id = ?", [gid, pid]);
        await persistDb();
        return groupsList(projectId).find((x: any) => x.id === gid);
      },
      clear: async (projectId: string) => {
        run("UPDATE photos SET group_id = NULL WHERE project_id = ?", [projectId]);
        run("DELETE FROM photo_groups WHERE project_id = ?", [projectId]);
        await persistDb();
      },
    },
    templates: {
      list: async () =>
        all("SELECT * FROM templates ORDER BY is_system DESC, name").map((r: any) => ({
          id: r.id, key: r.key, name: r.name, description: r.description, isSystem: !!r.is_system,
        })),
      get: async (id: string) => {
        const row = get("SELECT * FROM templates WHERE id = ?", [id]);
        if (!row) return null;
        const layouts = all("SELECT * FROM template_layouts WHERE template_id = ? ORDER BY sort_order", [id]);
        return {
          id: row.id, key: row.key, name: row.name, description: row.description, isSystem: !!row.is_system,
          style: JSON.parse(row.style ?? "{}"),
          layouts: layouts.map((l: any) => ({
            id: l.id, key: l.key, name: l.name, slots: JSON.parse(l.slots), weight: l.weight, maxPhotos: l.max_photos, sortOrder: l.sort_order,
          })),
        };
      },
    },
    fonts: {
      list: async () => BUNDLED_FONTS,
    },
  };
}

/** Local client proofing: self-contained gallery export + feedback import.
 * No server involved — the photographer exports a folder, the client opens
 * index.html in any browser, marks favourites and comments, and sends back a
 * single feedback.json that is imported in-app. */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { DB, newId, now } from "./db";

function albumPhotoIds(db: DB, albumId: string): Array<{ id: string; filename: string }> {
  const rows = db
    .prepare(
      `SELECT DISTINCT p.id, p.filename, p.thumbnail_path
       FROM album_elements e
       JOIN photos p ON p.id = e.photo_id
       WHERE e.album_id = ? AND e.type = 'image' AND e.photo_id IS NOT NULL
       ORDER BY e.z`,
    )
    .all(albumId) as Array<{ id: string; filename: string; thumbnail_path: string | null }>;
  return rows.map((r) => ({ id: r.id, filename: r.filename }));
}

const PROOF_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Album proof — AlbumForge</title>
<style>
  body { font-family: system-ui, sans-serif; background: #f1f5f9; margin: 0; padding: 16px; color: #0f172a; }
  .bar { position: sticky; top: 0; background: #ffffff; border-radius: 12px; padding: 12px 16px;
         display: flex; align-items: center; gap: 12px; margin-bottom: 16px; box-shadow: 0 1px 4px rgba(15,23,42,.08); }
  .bar h1 { font-size: 16px; margin: 0; flex: 1; }
  button { font-family: inherit; font-size: 13px; font-weight: 600; border: 1px solid #cbd5e1; background: #fff;
           padding: 8px 14px; border-radius: 8px; cursor: pointer; }
  button.primary { background: #6366f1; border-color: #6366f1; color: #fff; }
  button:hover { opacity: .9; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 12px; }
  .cell { background: #fff; border-radius: 12px; overflow: hidden; border: 2px solid transparent; transition: border-color .15s; }
  .cell.fav { border-color: #6366f1; }
  .cell img { width: 100%; height: 210px; object-fit: cover; display: block; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 8px; }
  .name { font-size: 11px; color: #64748b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .star { background: none; border: none; font-size: 20px; cursor: pointer; color: #cbd5e1; padding: 0 4px; }
  .cell.fav .star { color: #f59e0b; }
  .note { font-size: 11px; color: #6366f1; white-space: nowrap; }
  .count { font-size: 12px; color: #64748b; }
</style>
</head>
<body>
  <div class="bar">
    <h1>Album proof</h1>
    <span class="count" id="count"></span>
    <button id="save" class="primary">Download feedback</button>
  </div>
  <div class="grid" id="grid"></div>
<script>
  var PHOTOS = __PHOTOS__;
  var favs = new Set();
  var comments = {};
  var grid = document.getElementById('grid');
  var count = document.getElementById('count');

  function update() {
    count.textContent = favs.size + ' selected';
    document.querySelectorAll('.cell').forEach(function (c) {
      c.classList.toggle('fav', favs.has(c.dataset.id));
      var n = c.querySelector('.note');
      n.textContent = comments[c.dataset.id] ? 'Noted' : '';
    });
  }

  PHOTOS.forEach(function (p, i) {
    var cell = document.createElement('div');
    cell.className = 'cell';
    cell.dataset.id = p.id;
    cell.innerHTML =
      '<img src="photos/' + p.file + '" loading="lazy">' +
      '<div class="row">' +
        '<span class="name">' + (i + 1) + '. ' + p.name + '</span>' +
        '<span class="note"></span>' +
        '<button class="star" title="Select this photo">&#9734;</button>' +
        '<button class="cmt" title="Leave a comment">&#9998;</button>' +
      '</div>';
    cell.querySelector('.star').onclick = function () {
      if (favs.has(p.id)) favs.delete(p.id); else favs.add(p.id);
      update();
    };
    cell.querySelector('.cmt').onclick = function () {
      var v = prompt('Comment for photo ' + (i + 1) + ':', comments[p.id] || '');
      if (v === null) return;
      if (v.trim()) comments[p.id] = v.trim(); else delete comments[p.id];
      update();
    };
    grid.appendChild(cell);
  });
  update();

  document.getElementById('save').onclick = function () {
    var data = { generatedBy: 'AlbumForge', favorites: Array.from(favs), comments: comments };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'feedback.json';
    a.click();
  };
</script>
</body>
</html>`;

export function buildProofGallery(db: DB, albumId: string, targetDir: string): { dir: string; photos: number } {
  const photos = db
    .prepare(
      `SELECT DISTINCT e.photo_id, p.filename, p.thumbnail_path
       FROM album_elements e JOIN photos p ON p.id = e.photo_id
       WHERE e.album_id = ? AND e.type = 'image' AND e.photo_id IS NOT NULL`,
    )
    .all(albumId) as Array<{ photo_id: string; filename: string; thumbnail_path: string | null }>;

  mkdirSync(join(targetDir, "photos"), { recursive: true });
  const items: Array<{ id: string; name: string; file: string }> = [];
  photos.forEach((p, i) => {
    const safe = `${String(i + 1).padStart(4, "0")}-${p.photo_id.slice(0, 8)}.jpg`;
    if (p.thumbnail_path) {
      try {
        copyFileSync(p.thumbnail_path, join(targetDir, "photos", safe));
      } catch {
        /* skip missing thumb */
      }
    }
    items.push({ id: p.photo_id, name: p.filename, file: safe });
  });

  const html = PROOF_HTML.replace("__PHOTOS__", JSON.stringify(items));
  writeFileSync(join(targetDir, "index.html"), html);
  return { dir: targetDir, photos: items.length };
}

export function importFeedback(
  db: DB,
  projectId: string,
  filePath: string,
): { favorited: number; commented: number } {
  const raw = readFileSync(filePath, "utf8");
  const data = JSON.parse(raw) as { favorites?: string[]; comments?: Record<string, string> };

  let favorited = 0;
  const setSel = db.prepare("UPDATE photos SET selected = 1 WHERE id = ? AND project_id = ?");
  for (const id of data.favorites ?? []) {
    const res = setSel.run(id, projectId);
    favorited += res.changes;
  }

  let commented = 0;
  const upsert = db.prepare(
    "INSERT INTO photo_notes (id, photo_id, comment, created_at) VALUES (?, ?, ?, ?) " +
      "ON CONFLICT(photo_id) DO UPDATE SET comment = excluded.comment",
  );
  for (const [photoId, comment] of Object.entries(data.comments ?? {})) {
    if (!comment.trim()) continue;
    upsert.run(newId(), photoId, comment.trim(), now());
    commented++;
  }

  return { favorited, commented };
}

export function photoNotes(
  db: DB,
  projectId: string,
): Array<{ photoId: string; filename: string; comment: string }> {
  return (
    db
      .prepare(
        `SELECT n.photo_id, p.filename, n.comment
         FROM photo_notes n JOIN photos p ON p.id = n.photo_id
         WHERE p.project_id = ? ORDER BY n.created_at DESC`,
      )
      .all(projectId) as Array<{ photo_id: string; filename: string; comment: string }>
  ).map((r) => ({ photoId: r.photo_id, filename: r.filename, comment: r.comment }));
}

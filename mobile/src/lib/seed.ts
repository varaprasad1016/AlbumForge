/** Template seed data + seeding (mobile). */
import { all, get, newId, now, run } from "./db";
import { LAYOUT_CATALOG } from "./engine/layouts";

export const TEMPLATE_FAMILIES: Array<{
  name: string;
  key: string;
  description: string;
  style: Record<string, unknown>;
  layouts: Array<[string, number]>;
}> = [
  { name: "Classic", key: "classic", description: "Conservative grids, consistent margins.", style: { margin: 0.03, gutter: 0.03, safeArea: 0.05, chronological: true }, layouts: [["full_bleed", 0.5], ["hero_left", 1.0], ["hero_right", 1.0], ["two_vertical", 1.0], ["two_horizontal", 1.0], ["three_grid", 1.0], ["four_grid", 0.8], ["five_asymmetric", 0.5], ["spread_hero", 0.4], ["spread_grid_four", 0.5]] },
  { name: "Luxury", key: "luxury", description: "Generous whitespace and full-bleed heroes.", style: { margin: 0.04, gutter: 0.04, safeArea: 0.06, chronological: true }, layouts: [["full_bleed", 1.2], ["hero_left", 1.0], ["hero_right", 1.0], ["two_vertical", 0.8], ["two_horizontal", 0.8], ["three_grid", 0.5], ["five_asymmetric", 0.4], ["spread_hero", 0.8], ["spread_two", 0.6], ["spread_triptych", 0.5]] },
  { name: "Modern", key: "modern", description: "Asymmetric and strong hierarchy.", style: { margin: 0.03, gutter: 0.03, safeArea: 0.05, chronological: false }, layouts: [["hero_left", 1.0], ["hero_right", 1.0], ["two_horizontal", 0.7], ["three_grid", 0.8], ["four_grid", 0.8], ["five_asymmetric", 1.0], ["six_collage", 0.6], ["spread_hero", 0.7], ["spread_triptych", 0.6], ["spread_triptych_mirror", 0.6]] },
  { name: "Editorial", key: "editorial", description: "Magazine-style, varied scales.", style: { margin: 0.04, gutter: 0.04, safeArea: 0.06, chronological: false }, layouts: [["full_bleed", 1.0], ["hero_left", 1.0], ["hero_right", 1.0], ["two_vertical", 0.7], ["three_grid", 0.7], ["four_grid", 0.6], ["five_asymmetric", 0.8], ["spread_hero", 0.6], ["spread_two", 0.5]] },
  { name: "Collage", key: "collage", description: "Dense multi-image spreads.", style: { margin: 0.02, gutter: 0.02, safeArea: 0.04, chronological: false }, layouts: [["three_grid", 0.8], ["four_grid", 1.0], ["six_collage", 1.2], ["eight_collage", 1.2], ["nine_collage", 1.0], ["two_horizontal", 0.5], ["spread_grid_four", 1.0], ["spread_triptych", 0.6]] },
  { name: "Royal", key: "royal", description: "Elegant ivory spreads — timeless wedding look.", style: { margin: 0.035, gutter: 0.035, safeArea: 0.055, chronological: true, background: "#faf6ec", pattern: "damask" }, layouts: [["full_bleed", 0.6], ["hero_top", 1.0], ["hero_bottom", 0.8], ["hero_left", 1.0], ["hero_right", 1.0], ["centerpiece", 1.0], ["two_vertical", 0.7], ["three_grid", 0.6], ["spread_hero", 0.6], ["spread_triptych", 0.5]] },
  { name: "Heritage", key: "heritage", description: "Traditional warm-toned wedding storytelling.", style: { margin: 0.03, gutter: 0.03, safeArea: 0.05, chronological: true, background: "#fbf1dd", pattern: "damask" }, layouts: [["full_bleed", 0.7], ["hero_top", 1.0], ["hero_left", 1.0], ["centerpiece", 0.9], ["big_three", 1.0], ["four_grid", 0.8], ["six_collage", 0.6], ["two_horizontal", 0.7], ["spread_hero", 0.5], ["spread_triptych_mirror", 0.5]] },
  { name: "Cinematic", key: "cinematic", description: "Dark, dramatic full-bleed film feel.", style: { margin: 0.02, gutter: 0.02, safeArea: 0.04, chronological: false, background: "#141414" }, layouts: [["full_bleed", 1.2], ["hero_top", 0.9], ["hero_bottom", 0.9], ["centerpiece", 0.8], ["six_collage", 1.0], ["eight_collage", 0.8], ["big_three", 0.9], ["three_grid", 0.7], ["spread_hero", 1.0], ["spread_two", 0.6]] },
  { name: "Boho Chic", key: "boho", description: "Free-spirited, artisanal palettes.", style: { margin: 0.03, gutter: 0.03, safeArea: 0.05, chronological: false, background: "#fdf3e7", pattern: "dots" }, layouts: [["full_bleed", 0.8], ["hero_left", 0.9], ["hero_right", 0.9], ["five_asymmetric", 1.0], ["six_collage", 1.1], ["eight_collage", 0.9], ["centerpiece", 0.8], ["four_grid", 0.7], ["spread_hero", 0.8], ["spread_grid_four", 0.7]] },
  { name: "Vintage Film", key: "vintage_film", description: "Silver-era film aesthetic with warm tones.", style: { margin: 0.035, gutter: 0.035, safeArea: 0.055, chronological: true, background: "#f6f1e7", pattern: "diag" }, layouts: [["full_bleed", 0.9], ["hero_left", 1.0], ["hero_right", 1.0], ["two_vertical", 0.8], ["two_horizontal", 0.8], ["three_grid", 0.7], ["centerpiece", 0.8], ["spread_hero", 0.7], ["spread_two", 0.6]] },
  { name: "Corporate Clean", key: "corporate", description: "Sleek, structured layouts for portfolios.", style: { margin: 0.03, gutter: 0.03, safeArea: 0.05, chronological: true, background: "#ffffff" }, layouts: [["hero_left", 1.0], ["hero_right", 1.0], ["three_grid", 1.0], ["four_grid", 0.9], ["two_horizontal", 0.8], ["hero_top", 0.8], ["big_three", 0.8], ["spread_two", 0.5]] },
  { name: "Zen Nature", key: "zen_nature", description: "Calm organic layouts with breathing room.", style: { margin: 0.045, gutter: 0.04, safeArea: 0.06, chronological: true, background: "#f2f7f0", pattern: "grid" }, layouts: [["full_bleed", 0.8], ["hero_left", 0.9], ["hero_right", 0.9], ["two_vertical", 0.9], ["centerpiece", 1.0], ["three_grid", 0.7], ["four_grid", 0.6], ["spread_hero", 0.6]] },
  { name: "Party Mode", key: "party", description: "Festive, colorful collages for celebrations.", style: { margin: 0.02, gutter: 0.02, safeArea: 0.04, chronological: false, background: "#fff1f5", pattern: "dots" }, layouts: [["four_grid", 1.0], ["six_collage", 1.2], ["eight_collage", 1.1], ["nine_collage", 0.9], ["five_asymmetric", 0.9], ["full_bleed", 0.6], ["spread_grid_four", 0.8], ["spread_triptych", 0.6]] },
  { name: "Love Letters", key: "love_letters", description: "Soft, romantic layouts for weddings.", style: { margin: 0.035, gutter: 0.035, safeArea: 0.055, chronological: true, background: "#fdf0f0", pattern: "dots" }, layouts: [["full_bleed", 0.8], ["hero_left", 1.0], ["hero_right", 1.0], ["two_vertical", 0.8], ["centerpiece", 0.9], ["three_grid", 0.7], ["four_grid", 0.6], ["spread_hero", 0.8], ["spread_triptych", 0.6]] },
];

/** Starter page designs (real album layouts available via "Apply design…"). */
const STARTER_DESIGNS: Array<{ name: string; data: any }> = [
  {
    name: "Ornate wedding frame",
    data: {
      layoutKey: null,
      background: { color: "#ffffff", pattern: null },
      elements: [
        { type: "image", z: 0, x: 0.11, y: 0.11, width: 0.78, height: 0.78, rotation: 0, photoId: null, crop: null, text: null, style: null },
        { type: "shape", z: 1, x: 0.055, y: 0.055, width: 0.89, height: 0.89, rotation: 0, photoId: null, crop: null, text: null, style: { shape: "rect", fill: "none", stroke: "#8a7a5c", strokeWidth: 3, opacity: 1 } },
        { type: "shape", z: 2, x: 0.068, y: 0.068, width: 0.864, height: 0.864, rotation: 0, photoId: null, crop: null, text: null, style: { shape: "rect", fill: "none", stroke: "#8a7a5c", strokeWidth: 1, opacity: 1 } },
        { type: "graphic", z: 3, x: 0.02, y: 0.02, width: 0.15, height: 0.15, rotation: 0, photoId: null, crop: null, text: null, style: { graphicId: "corner_filigree", color: "#8a7a5c", opacity: 1 } },
        { type: "graphic", z: 3, x: 0.83, y: 0.02, width: 0.15, height: 0.15, rotation: 90, photoId: null, crop: null, text: null, style: { graphicId: "corner_filigree", color: "#8a7a5c", opacity: 1 } },
        { type: "graphic", z: 3, x: 0.83, y: 0.83, width: 0.15, height: 0.15, rotation: 180, photoId: null, crop: null, text: null, style: { graphicId: "corner_filigree", color: "#8a7a5c", opacity: 1 } },
        { type: "graphic", z: 3, x: 0.02, y: 0.83, width: 0.15, height: 0.15, rotation: 270, photoId: null, crop: null, text: null, style: { graphicId: "corner_filigree", color: "#8a7a5c", opacity: 1 } },
      ],
    },
  },
  {
    name: "Botanical border",
    data: {
      layoutKey: null,
      background: { color: "#fbf7ef", pattern: null },
      elements: [
        { type: "image", z: 0, x: 0.08, y: 0.3, width: 0.4, height: 0.62, rotation: 0, photoId: null, crop: null, text: null, style: null },
        { type: "image", z: 0, x: 0.52, y: 0.3, width: 0.4, height: 0.62, rotation: 0, photoId: null, crop: null, text: null, style: null },
        { type: "graphic", z: 2, x: 0.36, y: 0.015, width: 0.28, height: 0.28, rotation: 0, photoId: null, crop: null, text: null, style: { graphicId: "wreath_floral", color: "#7d8a5f", opacity: 1 } },
        { type: "graphic", z: 2, x: 0.012, y: 0.012, width: 0.15, height: 0.15, rotation: 0, photoId: null, crop: null, text: null, style: { graphicId: "corner_floral", color: "#7d8a5f", opacity: 1 } },
        { type: "graphic", z: 2, x: 0.838, y: 0.012, width: 0.15, height: 0.15, rotation: 90, photoId: null, crop: null, text: null, style: { graphicId: "corner_floral", color: "#7d8a5f", opacity: 1 } },
        { type: "graphic", z: 2, x: 0.838, y: 0.838, width: 0.15, height: 0.15, rotation: 180, photoId: null, crop: null, text: null, style: { graphicId: "corner_floral", color: "#7d8a5f", opacity: 1 } },
        { type: "graphic", z: 2, x: 0.012, y: 0.838, width: 0.15, height: 0.15, rotation: 270, photoId: null, crop: null, text: null, style: { graphicId: "corner_floral", color: "#7d8a5f", opacity: 1 } },
      ],
    },
  },
  {
    name: "Indian mandala collage",
    data: {
      layoutKey: null,
      background: { color: "#fdf6ec", pattern: null },
      elements: [
        { type: "image", z: 1, x: 0.05, y: 0.05, width: 0.4, height: 0.4, rotation: 0, photoId: null, crop: null, text: null, style: null },
        { type: "image", z: 1, x: 0.55, y: 0.05, width: 0.4, height: 0.4, rotation: 0, photoId: null, crop: null, text: null, style: null },
        { type: "image", z: 1, x: 0.05, y: 0.55, width: 0.4, height: 0.4, rotation: 0, photoId: null, crop: null, text: null, style: null },
        { type: "image", z: 1, x: 0.55, y: 0.55, width: 0.4, height: 0.4, rotation: 0, photoId: null, crop: null, text: null, style: null },
        { type: "graphic", z: 0, x: 0.27, y: 0.27, width: 0.46, height: 0.46, rotation: 0, photoId: null, crop: null, text: null, style: { graphicId: "mandala", color: "#b08d57", opacity: 0.85 } },
        { type: "graphic", z: 2, x: 0.44, y: 0.44, width: 0.12, height: 0.12, rotation: 0, photoId: null, crop: null, text: null, style: { graphicId: "medallion", color: "#8a7a5c", opacity: 1 } },
      ],
    },
  },
];

export function seedDesigns(): void {
  const row = get("SELECT COUNT(*) AS c FROM designs") as { c: number };
  if ((row?.c ?? 0) > 0) return;
  for (const d of STARTER_DESIGNS) {
    run("INSERT INTO designs (id, name, layout_json, created_at) VALUES (?, ?, ?, ?)", [
      newId(), d.name, JSON.stringify(d.data), now(),
    ]);
  }
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

function templateSignature(templateId: string, style: string | null): string {
  const layouts = all("SELECT key, slots, weight, min_photos, max_photos FROM template_layouts WHERE template_id = ?", [templateId]) as Array<Record<string, unknown>>;
  const normalizedLayouts = layouts
    .map((layout) => ({
      key: layout.key,
      slots: JSON.parse(layout.slots as string),
      weight: layout.weight,
      minPhotos: layout.min_photos,
      maxPhotos: layout.max_photos,
    }))
    .sort((a, b) => String(a.key).localeCompare(String(b.key)));
  return JSON.stringify(stableValue({ style: JSON.parse(style ?? "{}"), layouts: normalizedLayouts }));
}

function removeDuplicateTemplates(): void {
  const rows = all("SELECT id, key, style FROM templates ORDER BY is_system DESC, id") as Array<Record<string, unknown>>;
  const catalogOrder = new Map(TEMPLATE_FAMILIES.map((family, index) => [family.key, index]));
  const canonicalBySignature = new Map<string, string>();
  const duplicateIds: string[] = [];

  for (const row of rows) {
    const id = row.id as string;
    const signature = templateSignature(id, row.style as string | null);
    const existing = canonicalBySignature.get(signature);
    if (!existing) {
      canonicalBySignature.set(signature, id);
      continue;
    }
    const existingRow = rows.find((candidate) => candidate.id === existing)!;
    const existingRank = catalogOrder.get(existingRow.key as string) ?? Number.MAX_SAFE_INTEGER;
    const currentRank = catalogOrder.get(row.key as string) ?? Number.MAX_SAFE_INTEGER;
    if (currentRank < existingRank) {
      canonicalBySignature.set(signature, id);
      duplicateIds.push(existing);
    } else {
      duplicateIds.push(id);
    }
  }

  for (const duplicateId of duplicateIds) {
    const duplicate = rows.find((row) => row.id === duplicateId);
    if (!duplicate) continue;
    const canonicalId = canonicalBySignature.get(templateSignature(duplicateId, duplicate.style as string | null));
    if (!canonicalId || canonicalId === duplicateId) continue;
    run("UPDATE albums SET template_id = ? WHERE template_id = ?", [canonicalId, duplicateId]);
    run("DELETE FROM template_layouts WHERE template_id = ?", [duplicateId]);
    run("DELETE FROM templates WHERE id = ?", [duplicateId]);
  }
}

export function seedTemplates(): void {
  for (const fam of TEMPLATE_FAMILIES) {
    const existing = get("SELECT id FROM templates WHERE key = ?", [fam.key]) as { id: string } | undefined;
    let templateId = existing?.id ?? null;
    if (!templateId) {
      templateId = newId();
      run("INSERT INTO templates (id, key, name, description, style, is_system) VALUES (?, ?, ?, ?, ?, 1)", [templateId, fam.key, fam.name, fam.description, JSON.stringify(fam.style)]);
    } else {
      run("UPDATE templates SET name = ?, description = ?, style = ? WHERE id = ?", [fam.name, fam.description, JSON.stringify(fam.style), templateId]);
    }

    // Incremental: add any catalogue layouts the family is missing (e.g. newly
    // introduced spread layouts) without disturbing existing seeded rows.
    const have = new Set(
      (all("SELECT key FROM template_layouts WHERE template_id = ?", [templateId]) as Array<{ key: string }>).map((r) => r.key),
    );
    const row = get("SELECT COALESCE(MAX(sort_order), 0) AS m FROM template_layouts WHERE template_id = ?", [templateId]) as { m: number };
    let sort = row.m;
    for (const [key, weight] of fam.layouts) {
      if (have.has(key)) continue;
      const layout = LAYOUT_CATALOG[key];
      if (!layout) continue;
      sort++;
      run("INSERT INTO template_layouts (id, template_id, key, name, slots, weight, min_photos, max_photos, sort_order) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)", [newId(), templateId, layout.key, layout.name, JSON.stringify(layout.slots), weight, layout.slots.length, sort]);
    }
  }

  removeDuplicateTemplates();
}

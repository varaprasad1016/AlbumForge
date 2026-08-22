/** Template seed data — five families referencing the layout catalogue. */
import { LAYOUT_CATALOG } from "./engine/layouts";
import { DB, newId } from "./db";

export interface TemplateFamilySeed {
  name: string;
  key: string;
  description: string;
  style: Record<string, unknown>;
  layouts: Array<[string, number]>;
}

export const TEMPLATE_FAMILIES: TemplateFamilySeed[] = [
  {
    name: "Classic",
    key: "classic",
    description: "Conservative grids, consistent margins, chronological storytelling.",
    style: { margin: 0.03, gutter: 0.03, safeArea: 0.05, chronological: true },
    layouts: [
      ["full_bleed", 0.5],
      ["hero_left", 1.0],
      ["hero_right", 1.0],
      ["two_vertical", 1.0],
      ["two_horizontal", 1.0],
      ["three_grid", 1.0],
      ["four_grid", 0.8],
      ["five_asymmetric", 0.5],
      ["spread_hero", 0.4],
      ["spread_grid_four", 0.5],
    ],
  },
  {
    name: "Luxury",
    key: "luxury",
    description: "Generous whitespace, full-bleed heroes, one to three images per page.",
    style: { margin: 0.04, gutter: 0.04, safeArea: 0.06, chronological: true },
    layouts: [
      ["full_bleed", 1.2],
      ["hero_left", 1.0],
      ["hero_right", 1.0],
      ["two_vertical", 0.8],
      ["two_horizontal", 0.8],
      ["three_grid", 0.5],
      ["five_asymmetric", 0.4],
      ["spread_hero", 0.8],
      ["spread_two", 0.6],
      ["spread_triptych", 0.5],
    ],
  },
  {
    name: "Modern",
    key: "modern",
    description: "Asymmetric, strong hierarchy, generous white space.",
    style: { margin: 0.03, gutter: 0.03, safeArea: 0.05, chronological: false },
    layouts: [
      ["hero_left", 1.0],
      ["hero_right", 1.0],
      ["two_horizontal", 0.7],
      ["three_grid", 0.8],
      ["four_grid", 0.8],
      ["five_asymmetric", 1.0],
      ["six_collage", 0.6],
      ["spread_hero", 0.7],
      ["spread_triptych", 0.6],
      ["spread_triptych_mirror", 0.6],
    ],
  },
  {
    name: "Editorial",
    key: "editorial",
    description: "Magazine-style, varied scales, minimal text.",
    style: { margin: 0.04, gutter: 0.04, safeArea: 0.06, chronological: false },
    layouts: [
      ["full_bleed", 1.0],
      ["hero_left", 1.0],
      ["hero_right", 1.0],
      ["two_vertical", 0.7],
      ["three_grid", 0.7],
      ["four_grid", 0.6],
      ["five_asymmetric", 0.8],
      ["spread_hero", 0.6],
      ["spread_two", 0.5],
    ],
  },
  {
    name: "Collage",
    key: "collage",
    description: "Dense multi-image spreads (four to nine images per page).",
    style: { margin: 0.02, gutter: 0.02, safeArea: 0.04, chronological: false },
    layouts: [
      ["three_grid", 0.8],
      ["four_grid", 1.0],
      ["six_collage", 1.2],
      ["eight_collage", 1.2],
      ["nine_collage", 1.0],
      ["two_horizontal", 0.5],
      ["spread_grid_four", 1.0],
      ["spread_triptych", 0.6],
    ],
  },
  {
    name: "Royal",
    key: "royal",
    description: "Elegant ivory spreads with generous whitespace — a timeless wedding look.",
    style: { margin: 0.035, gutter: 0.035, safeArea: 0.055, chronological: true, background: "#faf6ec" },
    layouts: [
      ["full_bleed", 0.6],
      ["hero_top", 1.0],
      ["hero_bottom", 0.8],
      ["hero_left", 1.0],
      ["hero_right", 1.0],
      ["centerpiece", 1.0],
      ["two_vertical", 0.7],
      ["three_grid", 0.6],
      ["spread_hero", 0.6],
      ["spread_triptych", 0.5],
    ],
  },
  {
    name: "Heritage",
    key: "heritage",
    description: "Traditional warm-toned layouts — classic Indian wedding storytelling.",
    style: { margin: 0.03, gutter: 0.03, safeArea: 0.05, chronological: true, background: "#fbf1dd" },
    layouts: [
      ["full_bleed", 0.7],
      ["hero_top", 1.0],
      ["hero_left", 1.0],
      ["centerpiece", 0.9],
      ["big_three", 1.0],
      ["four_grid", 0.8],
      ["six_collage", 0.6],
      ["two_horizontal", 0.7],
      ["spread_hero", 0.5],
      ["spread_triptych_mirror", 0.5],
    ],
  },
  {
    name: "Cinematic",
    key: "cinematic",
    description: "Dark, dramatic full-bleed spreads with a modern film feel.",
    style: { margin: 0.02, gutter: 0.02, safeArea: 0.04, chronological: false, background: "#141414" },
    layouts: [
      ["full_bleed", 1.2],
      ["hero_top", 0.9],
      ["hero_bottom", 0.9],
      ["centerpiece", 0.8],
      ["six_collage", 1.0],
      ["eight_collage", 0.8],
      ["big_three", 0.9],
      ["three_grid", 0.7],
      ["spread_hero", 1.0],
      ["spread_two", 0.6],
    ],
  },
  {
    name: "Boho Chic",
    key: "boho",
    description: "Free-spirited, artisanal palettes with organic energy.",
    style: { margin: 0.03, gutter: 0.03, safeArea: 0.05, chronological: false, background: "#fdf3e7" },
    layouts: [
      ["full_bleed", 0.8],
      ["hero_left", 0.9],
      ["hero_right", 0.9],
      ["five_asymmetric", 1.0],
      ["six_collage", 1.1],
      ["eight_collage", 0.9],
      ["centerpiece", 0.8],
      ["four_grid", 0.7],
      ["spread_hero", 0.8],
      ["spread_grid_four", 0.7],
    ],
  },
  {
    name: "Vintage Film",
    key: "vintage_film",
    description: "Silver-era film aesthetic with warm grain tones.",
    style: { margin: 0.035, gutter: 0.035, safeArea: 0.055, chronological: true, background: "#f6f1e7" },
    layouts: [
      ["full_bleed", 0.9],
      ["hero_left", 1.0],
      ["hero_right", 1.0],
      ["two_vertical", 0.8],
      ["two_horizontal", 0.8],
      ["three_grid", 0.7],
      ["centerpiece", 0.8],
      ["spread_hero", 0.7],
      ["spread_two", 0.6],
    ],
  },
  {
    name: "Corporate Clean",
    key: "corporate",
    description: "Sleek, structured layouts for portfolios and events.",
    style: { margin: 0.03, gutter: 0.03, safeArea: 0.05, chronological: true, background: "#ffffff" },
    layouts: [
      ["hero_left", 1.0],
      ["hero_right", 1.0],
      ["three_grid", 1.0],
      ["four_grid", 0.9],
      ["two_horizontal", 0.8],
      ["hero_top", 0.8],
      ["big_three", 0.8],
      ["spread_two", 0.5],
    ],
  },
  {
    name: "Zen Nature",
    key: "zen_nature",
    description: "Calm organic layouts with breathing room.",
    style: { margin: 0.045, gutter: 0.04, safeArea: 0.06, chronological: true, background: "#f2f7f0" },
    layouts: [
      ["full_bleed", 0.8],
      ["hero_left", 0.9],
      ["hero_right", 0.9],
      ["two_vertical", 0.9],
      ["centerpiece", 1.0],
      ["three_grid", 0.7],
      ["four_grid", 0.6],
      ["spread_hero", 0.6],
    ],
  },
  {
    name: "Party Mode",
    key: "party",
    description: "Festive, colorful collages for celebrations.",
    style: { margin: 0.02, gutter: 0.02, safeArea: 0.04, chronological: false, background: "#fff1f5" },
    layouts: [
      ["four_grid", 1.0],
      ["six_collage", 1.2],
      ["eight_collage", 1.1],
      ["nine_collage", 0.9],
      ["five_asymmetric", 0.9],
      ["full_bleed", 0.6],
      ["spread_grid_four", 0.8],
      ["spread_triptych", 0.6],
    ],
  },
  {
    name: "Love Letters",
    key: "love_letters",
    description: "Soft, romantic layouts for weddings and anniversaries.",
    style: { margin: 0.035, gutter: 0.035, safeArea: 0.055, chronological: true, background: "#fdf0f0" },
    layouts: [
      ["full_bleed", 0.8],
      ["hero_left", 1.0],
      ["hero_right", 1.0],
      ["two_vertical", 0.8],
      ["centerpiece", 0.9],
      ["three_grid", 0.7],
      ["four_grid", 0.6],
      ["spread_hero", 0.8],
      ["spread_triptych", 0.6],
    ],
  },
];

export function seedTemplates(db: DB): void {
  const insertTemplate = db.prepare(
    "INSERT INTO templates (id, key, name, description, style, is_system) VALUES (?, ?, ?, ?, ?, 1)",
  );
  const insertLayout = db.prepare(
    `INSERT INTO template_layouts
     (id, template_id, key, name, slots, weight, min_photos, max_photos, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  );
  const find = db.prepare("SELECT id FROM templates WHERE key = ?");
  const layoutKeysFor = db.prepare("SELECT key FROM template_layouts WHERE template_id = ?");
  const maxSortFor = db.prepare("SELECT COALESCE(MAX(sort_order), 0) AS m FROM template_layouts WHERE template_id = ?");

  for (const fam of TEMPLATE_FAMILIES) {
    const existing = find.get(fam.key) as { id: string } | undefined;
    let templateId = existing?.id ?? null;
    if (!templateId) {
      templateId = newId();
      insertTemplate.run(
        templateId,
        fam.key,
        fam.name,
        fam.description,
        JSON.stringify(fam.style),
      );
    }

    // Incremental: add any catalogue layouts the family is missing (e.g. newly
    // introduced spread layouts) without disturbing existing seeded rows.
    const have = new Set(
      (layoutKeysFor.all(templateId) as Array<{ key: string }>).map((r) => r.key),
    );
    let sortOrder = (maxSortFor.get(templateId) as { m: number }).m;
    for (const [layoutKey, weight] of fam.layouts) {
      if (have.has(layoutKey)) continue;
      const layout = LAYOUT_CATALOG[layoutKey];
      if (!layout) continue;
      sortOrder++;
      insertLayout.run(
        newId(),
        templateId,
        layout.key,
        layout.name,
        JSON.stringify(layout.slots),
        weight,
        layout.slots.length,
        sortOrder,
      );
    }
  }
}

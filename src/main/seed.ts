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
    ],
  },
];

export function seedTemplates(db: DB): void {
  const existing = db.prepare("SELECT COUNT(*) AS c FROM templates WHERE is_system = 1").get() as {
    c: number;
  };
  if (existing.c > 0) return;

  const insertTemplate = db.prepare(
    "INSERT INTO templates (id, key, name, description, style, is_system) VALUES (?, ?, ?, ?, ?, 1)",
  );
  const insertLayout = db.prepare(
    `INSERT INTO template_layouts
     (id, template_id, key, name, slots, weight, min_photos, max_photos, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  );

  for (const fam of TEMPLATE_FAMILIES) {
    const templateId = newId();
    insertTemplate.run(
      templateId,
      fam.key,
      fam.name,
      fam.description,
      JSON.stringify(fam.style),
    );
    let sortOrder = 0;
    for (const [layoutKey, weight] of fam.layouts) {
      const layout = LAYOUT_CATALOG[layoutKey];
      insertLayout.run(
        newId(),
        templateId,
        layout.key,
        layout.name,
        JSON.stringify(layout.slots),
        weight,
        layout.slots.length,
        sortOrder++,
      );
    }
  }
}

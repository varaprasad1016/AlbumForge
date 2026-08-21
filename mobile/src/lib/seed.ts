/** Template seed data + seeding (mobile). */
import { get, newId, run } from "./db";
import { LAYOUT_CATALOG } from "./engine/layouts";

export const TEMPLATE_FAMILIES: Array<{
  name: string;
  key: string;
  description: string;
  style: Record<string, unknown>;
  layouts: Array<[string, number]>;
}> = [
  { name: "Classic", key: "classic", description: "Conservative grids, consistent margins.", style: { margin: 0.03, gutter: 0.03, safeArea: 0.05, chronological: true }, layouts: [["full_bleed", 0.5], ["hero_left", 1.0], ["hero_right", 1.0], ["two_vertical", 1.0], ["two_horizontal", 1.0], ["three_grid", 1.0], ["four_grid", 0.8], ["five_asymmetric", 0.5]] },
  { name: "Luxury", key: "luxury", description: "Generous whitespace and full-bleed heroes.", style: { margin: 0.04, gutter: 0.04, safeArea: 0.06, chronological: true }, layouts: [["full_bleed", 1.2], ["hero_left", 1.0], ["hero_right", 1.0], ["two_vertical", 0.8], ["two_horizontal", 0.8], ["three_grid", 0.5], ["five_asymmetric", 0.4]] },
  { name: "Modern", key: "modern", description: "Asymmetric and strong hierarchy.", style: { margin: 0.03, gutter: 0.03, safeArea: 0.05, chronological: false }, layouts: [["hero_left", 1.0], ["hero_right", 1.0], ["two_horizontal", 0.7], ["three_grid", 0.8], ["four_grid", 0.8], ["five_asymmetric", 1.0], ["six_collage", 0.6]] },
  { name: "Editorial", key: "editorial", description: "Magazine-style, varied scales.", style: { margin: 0.04, gutter: 0.04, safeArea: 0.06, chronological: false }, layouts: [["full_bleed", 1.0], ["hero_left", 1.0], ["hero_right", 1.0], ["two_vertical", 0.7], ["three_grid", 0.7], ["four_grid", 0.6], ["five_asymmetric", 0.8]] },
  { name: "Collage", key: "collage", description: "Dense multi-image spreads.", style: { margin: 0.02, gutter: 0.02, safeArea: 0.04, chronological: false }, layouts: [["three_grid", 0.8], ["four_grid", 1.0], ["six_collage", 1.2], ["eight_collage", 1.2], ["nine_collage", 1.0], ["two_horizontal", 0.5]] },
  { name: "Royal", key: "royal", description: "Elegant ivory spreads — timeless wedding look.", style: { margin: 0.035, gutter: 0.035, safeArea: 0.055, chronological: true, background: "#faf6ec" }, layouts: [["full_bleed", 0.6], ["hero_top", 1.0], ["hero_bottom", 0.8], ["hero_left", 1.0], ["hero_right", 1.0], ["centerpiece", 1.0], ["two_vertical", 0.7], ["three_grid", 0.6]] },
  { name: "Heritage", key: "heritage", description: "Traditional warm-toned wedding storytelling.", style: { margin: 0.03, gutter: 0.03, safeArea: 0.05, chronological: true, background: "#fbf1dd" }, layouts: [["full_bleed", 0.7], ["hero_top", 1.0], ["hero_left", 1.0], ["centerpiece", 0.9], ["big_three", 1.0], ["four_grid", 0.8], ["six_collage", 0.6], ["two_horizontal", 0.7]] },
  { name: "Cinematic", key: "cinematic", description: "Dark, dramatic full-bleed film feel.", style: { margin: 0.02, gutter: 0.02, safeArea: 0.04, chronological: false, background: "#141414" }, layouts: [["full_bleed", 1.2], ["hero_top", 0.9], ["hero_bottom", 0.9], ["centerpiece", 0.8], ["six_collage", 1.0], ["eight_collage", 0.8], ["big_three", 0.9], ["three_grid", 0.7]] },
];

export function seedTemplates(): void {
  for (const fam of TEMPLATE_FAMILIES) {
    if (get("SELECT id FROM templates WHERE key = ?", [fam.key])) continue;
    const templateId = newId();
    run("INSERT INTO templates (id, key, name, description, style, is_system) VALUES (?, ?, ?, ?, ?, 1)", [templateId, fam.key, fam.name, fam.description, JSON.stringify(fam.style)]);
    let sort = 0;
    for (const [key, weight] of fam.layouts) {
      const layout = LAYOUT_CATALOG[key];
      if (!layout) continue;
      run("INSERT INTO template_layouts (id, template_id, key, name, slots, weight, min_photos, max_photos, sort_order) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)", [newId(), templateId, layout.key, layout.name, JSON.stringify(layout.slots), weight, layout.slots.length, sort++]);
    }
  }
}

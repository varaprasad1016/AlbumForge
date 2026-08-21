# AlbumForge — Template System

A template is **not** a background/theme — it is a *behaviour*: a family of page layouts plus
rules for how photographs fill them. Templates are stored in SQLite (seeded on first run),
never hard-coded in the UI.

## Model

```
templates (family)
 ├─ key: "classic" | "luxury" | "modern" | "editorial" | "collage"
 ├─ style: { margin, gutter, safeArea, chronological }
 └─ template_layouts[]
      ├─ key: "full_bleed" | "hero_left" | ... 
      ├─ slots: [ { x, y, w, h, orientationHint, bleed } ]   # normalized 0..1
      ├─ weight: 1.0      # relative selection probability
      ├─ min_photos / max_photos
      └─ sort_order
```

`slots` are normalized rectangles on the trim page. `orientationHint` is `landscape`,
`portrait`, `square`, or `any`.

## Layout catalogue (seeded)

| key | slots | notes |
|---|---|---|
| `full_bleed` | 1 | edge-to-edge hero (bleeds) |
| `hero_left` | 2 | large left + smaller right |
| `hero_right` | 2 | mirrored hero |
| `two_vertical` | 2 | side-by-side portraits |
| `two_horizontal` | 2 | stacked landscapes |
| `three_grid` | 3 | equal columns |
| `four_grid` | 4 | 2×2 |
| `five_asymmetric` | 5 | one hero + four small |
| `six_collage` | 6 | mixed grid |
| `eight_collage` | 8 | dense collage |
| `nine_collage` | 9 | 3×3 |

## Template families (seeded)

1. **Classic** — conservative grids, consistent margins, chronological storytelling.
2. **Luxury** — generous whitespace, full-bleed heroes, 1–3 images per page.
3. **Modern** — asymmetric, strong hierarchy, white space.
4. **Editorial** — magazine-style, varied scales.
5. **Collage** — dense multi-image spreads (4–9 per page).

Each family weights layouts differently (Luxury rarely uses `nine_collage`; Collage rarely
uses `full_bleed`), which is what makes the same photo set produce genuinely different
albums per family.

## Template engine

`src/main/engine/templateEngine.ts`: given remaining photos + recent layout history, choose
the next layout via weighted selection (seeded), preferring layouts that fit the remaining
photo count and avoiding immediate repetition.

## Custom templates

Templates are rows in SQLite. Custom families can be added directly to the DB (or via a
future in-app editor) by inserting a `templates` row plus `template_layouts` rows. Layout
slot validation is enforced by the engine (rects within 0..1, non-overlapping by
construction of the catalogue).

# AlbumForge — Album Engine (Proprietary Core)

The deterministic engine that turns a pile of finished photographs into a coherent,
professionally laid-out album. All modules are **proprietary** and live under
`src/main/engine/` (pure TypeScript — no I/O, no SQLite, no Electron).

## Modules

| Module | Responsibility |
|---|---|
| `types.ts` | `PhotoRecord`, `TemplateFamily`, `AlbumSpec`, element/page/album DTOs |
| `layouts.ts` | The 11-layout catalogue (normalized slots) |
| `rng.ts` | Seedable, reproducible PRNG (xmur3 + mulberry32) |
| `templateEngine.ts` | Choose page layouts from a template family |
| `layoutEngine.ts` | Assign photos to slots + compose element rects + crops |
| `cropping.ts` | Smart crop: keep the salient region inside a slot |
| `scoring.ts` | Hamming distance, quality, near-duplicate detection, album score |
| `selection.ts` | all / selected / AI-ranked diversity selection |
| `grouping.ts` | Time segmentation + duplicate pairs |
| `generator.ts` | Orchestrate order → layout → composition → variations |

## Pipeline (one album)

1. **Select** — `selection.ts` resolves the photo set (all / selected / AI-ranked).
2. **Order** — chronological (EXIF/mtime) or group-aware for non-chronological families;
   a different high-quality "lead" image per variation.
3. **Compose** — `templateEngine.ts` picks a layout; `layoutEngine.ts` assigns photos to
   slots (aspect/orientation/quality) and computes smart crops.
4. **Persist** — `generate.ts` writes `albums → album_pages → album_elements`.

## Layout engine (deterministic)

Inputs: photos (width/height/orientation/quality/phash), a layout, page aspect, template
style, a seed. Rules enforced:

- **Aspect fit** — photos matched to slots to minimize crop loss; portrait→portrait,
  landscape→landscape.
- **Margins / safe area** — layouts bake in margins/gutters; safe area is surfaced in the
  editor and honoured by full-bleed handling at export.
- **No near-duplicates together** — Hamming distance on 64-bit dHash spreads duplicates apart.
- **Variety** — recent layout history prevents immediate repetition.
- **Hierarchy** — largest slots (heroes) get the best matches first.
- **Distribution** — photos spread evenly; the last page uses the smallest layout.

The engine is a pure function of `(photos, family, spec, variation)` — fully unit-testable
(`src/main/engine/engine.test.ts`).

## Smart cropping

1. Determine the slot's target aspect ratio.
2. Compute the maximum-area crop with that aspect.
3. Centre on faces (if available) else image centre; shift to keep the face union inside.
4. Store crop normalized to the source. Originals are never modified.

## Variations

`generator.ts` derives a seed from `(family, variation)`. Variation changes the layout
selection stream, the lead/hero image, and bounded reordering within groups — genuinely
different but professionally coherent, and reproducible (same inputs → same album).

## Album scoring

`scoring.ts` estimates quality from crop loss + duplicate proximity + coverage. Used to
evaluate albums and (later) select the best variation.

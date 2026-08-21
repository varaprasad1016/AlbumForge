# AlbumForge — AI Pipeline (Analysis & Selection)

Analysis runs **locally** during import and is an optional enhancement — never a hard
dependency of the layout engine. No model downloads, no network, no GPU required.

## What runs at import (`src/main/imaging.ts`)

For each imported photo, `sharp` extracts:

- **dimensions & orientation** (EXIF-aware, auto-rotated)
- **blur/sharpness** — Laplacian variance via a 3×3 convolution (`convolve`), mapped to
  `0 (sharp) … 1 (blurry)`
- **exposure/quality** — mean luminance heuristic (`0 … 1`)
- **perceptual hash** — 64-bit dHash (9×8 grayscale) for duplicate detection

Results are stored on the `photos` row (`quality_score`, `blur_score`, `phash`).

## Photo selection (`engine/selection.ts`)

- `all` — every photo in the project.
- `selected` — photos the photographer marked.
- `ai` — greedy **farthest-point + quality** selection: start from the highest-quality
  photo, then repeatedly add the photo that best combines quality with Hamming-distance
  diversity. This avoids selecting a burst of near-identical frames. **No LLM required.**

## Grouping (`engine/grouping.ts`)

- **Time segmentation** — split photos where the timestamp gap exceeds a threshold
  (EXIF `DateTimeOriginal` when present, falling back to file mtime).
- **Duplicate detection** — sorted-window Hamming scan (near-linear for 5,000+ photos).

Grouping is assistive; the photographer can rename/merge/split/move photos.

## Extension points (future)

The analysis code is small and isolated (`imaging.ts`). Future capabilities — face detection,
embedding-based similarity/clustering, scene detection — can be added as drop-in providers
(e.g. OpenCV via a native module, or a local ONNX model) without touching the layout engine,
because the engine consumes only `PhotoRecord` (dimensions, orientation, quality, blur,
phash, face boxes). `PhotoRecord.faceBoxes` is already plumbed through to smart cropping.

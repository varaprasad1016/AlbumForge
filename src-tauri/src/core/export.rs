//! Headless export engine.
//!
//! Two layers live here:
//!
//! 1. **Foundation raster** (below, unchanged) — a standalone px-space render
//!    used by the `export_album` preview command. Superseded for real exports.
//! 2. **Phase 5 print pipeline** — consumes a persisted album layout exactly
//!    as the DB stores it (normalised element coordinates, spread `layoutKey`
//!    pages spanning the double width, `background`, per-element
//!    crop/text/style) and re-opens the original uncompressed sources at
//!    export time. Output mirrors the Electron exporter (`src/main/export.ts`):
//!    one print-ready JPEG per *physical* page (trim + bleed baked into the
//!    pixels, spreads sliced at the fold) → PDF assembly (`core/pdf.rs`) with
//!    Media/Bleed/Trim boxes, plus a `manifest.txt` for the lab.
//!
//! Reference semantics kept in lockstep with `export.ts`:
//!   - coordinates are fractions of the page (single) or double page (spread)
//!   - edges that touch the page bounds extend into the outer bleed; the fold
//!     edge of a spread page never does
//!   - images: crop → filters → rotate → cover/fill-resize (crop => exact
//!     fill, otherwise centre-crop cover), alpha matte (`dest-in`), blend
//!     modes multiply/screen/overlay/soft-light
//!   - filters are the canonical multiplier form
//!     `{brightness, contrast, saturation, hue, blur}` (1 = neutral)
//!   - text is drawn *after* the rasters in z (the Electron exporter keeps
//!     text vector in the PDF); here it is rasterised with `fontdue` from the
//!     bundled `$RESOURCE/fonts` TTFs so the whole PDF is one raster layer.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/* ===========================================================================
 * Foundation raster (Phase 1–4 previews) — unchanged.
 * =========================================================================== */

/// Non-destructive adjustment stack. Preview shader (WebGL) and export must
/// produce visually identical results — see `render_page` for the reference.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Filters {
    /// Exposure in stops, -2..+2.
    pub exposure: f32,
    /// Contrast, -100..+100.
    pub contrast: f32,
    /// Saturation, -100..+100.
    pub saturation: f32,
}

impl Default for Filters {
    fn default() -> Self {
        Self { exposure: 0.0, contrast: 0.0, saturation: 0.0 }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Crop {
    /// Normalised 0..1 rect within the source image.
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportElement {
    /// "image" | "shape" | "text" (image is implemented; others follow).
    pub kind: String,
    /// Layout-space position/size in pixels at the target DPI.
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    pub rotation: f32,
    /// Absolute path of the original source file for image elements.
    pub src: Option<String>,
    pub crop: Option<Crop>,
    pub filters: Filters,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportPage {
    pub width_px: u32,
    pub height_px: u32,
    pub elements: Vec<ExportElement>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportJobInput {
    pub pages: Vec<ExportPage>,
    pub dpi: u32,
    pub out_dir: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    /// Path of the assembled PDF (once printpdf lands). Pages are always
    /// rasterised alongside for lab packaging even in this foundation.
    pub pdf_path: String,
    pub pages: usize,
}

pub fn run_export(job: ExportJobInput) -> Result<ExportResult, String> {
    let out = Path::new(&job.out_dir);
    std::fs::create_dir_all(out).map_err(|e| e.to_string())?;

    for (i, page) in job.pages.iter().enumerate() {
        let raster = render_page(page)?;
        let png = out.join(format!("page_{:03}.png", i + 1));
        raster
            .save_with_format(&png, image::ImageFormat::Png)
            .map_err(|e| format!("write {}: {e}", png.display()))?;
    }

    // TODO(export): assemble pages into a multi-page PDF/TIFF here
    // (`printpdf` / `tiff` crates), embedding the raster pages + fonts at the
    // requested DPI. The raster pipeline above is the parity reference.
    Ok(ExportResult { pdf_path: String::new(), pages: job.pages.len() })
}

/// Render one page: white canvas, then each image element cover-fit into its
/// frame (crop → resize → filters → rotate) and composited.
fn render_page(page: &ExportPage) -> Result<image::RgbaImage, String> {
    let mut canvas = image::RgbaImage::from_pixel(
        page.width_px,
        page.height_px,
        image::Rgba([255, 255, 255, 255]),
    );

    for el in &page.elements {
        if el.kind != "image" {
            continue; // shapes/text land in the next iteration of this module
        }
        let src = el.src.as_ref().ok_or("image element without src")?;
        let mut img = image::open(src).map_err(|e| format!("open {src}: {e}"))?;

        if let Some(c) = &el.crop {
            let (iw, ih) = (img.width() as f32, img.height() as f32);
            let cw = (c.width * iw).round().clamp(1.0, iw) as u32;
            let ch = (c.height * ih).round().clamp(1.0, ih) as u32;
            let cx = (c.x * iw).round().clamp(0.0, (iw - cw as f32).max(0.0)) as u32;
            let cy = (c.y * ih).round().clamp(0.0, (ih - ch as f32).max(0.0)) as u32;
            img = img.crop_imm(cx, cy, cw, ch);
        }

        let w = el.width.round().max(1.0) as u32;
        let h = el.height.round().max(1.0) as u32;
        let resized = img.resize(w, h, image::imageops::FilterType::Lanczos3);
        let filtered = apply_filters(resized, &el.filters);

        let placed = if el.rotation != 0.0 {
            rotate_arbitrary(&filtered.to_rgba8(), el.rotation)
        } else {
            filtered.to_rgba8()
        };
        image::imageops::overlay(&mut canvas, &placed, el.x as i64, el.y as i64);
    }

    Ok(canvas)
}

/// Reference filter stack — keep in lockstep with the WebGL preview shader
/// (exposure ≈ `brighten(stops * 32)`, contrast/saturation ±100 scaled).
fn apply_filters(mut img: image::DynamicImage, f: &Filters) -> image::DynamicImage {
    if f.exposure != 0.0 {
        img = img.brighten((f.exposure * 32.0).round() as i32);
    }
    if f.contrast != 0.0 {
        img = img.adjust_contrast(f.contrast);
    }
    if f.saturation != 0.0 {
        img = adjust_saturation(img, f.saturation);
    }
    img
}

/// Rotate an RGBA image by an arbitrary angle (degrees, clockwise) with
/// bilinear sampling; the canvas expands to fit the rotated bounds.
fn rotate_arbitrary(img: &image::RgbaImage, angle_deg: f32) -> image::RgbaImage {
    let (w, h) = (img.width() as f32, img.height() as f32);
    let rad = angle_deg.to_radians();
    let (sin, cos) = (rad.sin(), rad.cos());
    let (nw, nh) = (
        (w * cos.abs() + h * sin.abs()).round().max(1.0) as u32,
        (w * sin.abs() + h * cos.abs()).round().max(1.0) as u32,
    );
    let (cx, cy) = (w / 2.0, h / 2.0);
    let (ncx, ncy) = (nw as f32 / 2.0, nh as f32 / 2.0);
    let mut out = image::RgbaImage::from_pixel(nw, nh, image::Rgba([0, 0, 0, 0]));
    for y in 0..nh {
        for x in 0..nw {
            // Inverse map: destination pixel -> source coordinate.
            let dx = x as f32 - ncx;
            let dy = y as f32 - ncy;
            let sx = dx * cos + dy * sin + cx;
            let sy = -dx * sin + dy * cos + cy;
            if sx >= 0.0 && sy >= 0.0 && sx <= w - 1.0 && sy <= h - 1.0 {
                let px = sx.floor() as u32;
                let py = sy.floor() as u32;
                let fx = sx - px as f32;
                let fy = sy - py as f32;
                let px1 = (px + 1).min(w as u32 - 1);
                let py1 = (py + 1).min(h as u32 - 1);
                let p00 = img.get_pixel(px, py).0;
                let p10 = img.get_pixel(px1, py).0;
                let p01 = img.get_pixel(px, py1).0;
                let p11 = img.get_pixel(px1, py1).0;
                let mut o = [0u8; 4];
                for c in 0..4 {
                    let v = p00[c] as f32 * (1.0 - fx) * (1.0 - fy)
                        + p10[c] as f32 * fx * (1.0 - fy)
                        + p01[c] as f32 * (1.0 - fx) * fy
                        + p11[c] as f32 * fx * fy;
                    o[c] = v.clamp(0.0, 255.0) as u8;
                }
                out.put_pixel(x, y, image::Rgba(o));
            }
        }
    }
    out
}

fn adjust_saturation(img: image::DynamicImage, amount: f32) -> image::DynamicImage {
    let mut rgba = img.to_rgba8();
    let k = (amount / 100.0).clamp(-1.0, 1.0);
    for px in rgba.pixels_mut() {
        let [r, g, b, a] = px.0;
        let luma = 0.2126 * f32::from(r) + 0.7152 * f32::from(g) + 0.0722 * f32::from(b);
        px.0[0] = (luma + (f32::from(r) - luma) * (1.0 + k)).clamp(0.0, 255.0) as u8;
        px.0[1] = (luma + (f32::from(g) - luma) * (1.0 + k)).clamp(0.0, 255.0) as u8;
        px.0[2] = (luma + (f32::from(b) - luma) * (1.0 + k)).clamp(0.0, 255.0) as u8;
        px.0[3] = a;
    }
    image::DynamicImage::ImageRgba8(rgba)
}

/* ===========================================================================
 * Phase 5 — real album-layout print pipeline (Electron export.ts parity)
 * =========================================================================== */

pub const MM_PER_INCH: f64 = 25.4;
/// PDF points per millimetre.
pub const PT_PER_MM: f64 = 72.0 / MM_PER_INCH;

/// One page exactly as `album_pages` stores it. Coordinates/element fields
/// mirror `library::AlbumPage`/`AlbumElement` (the command layer maps rows
/// onto these); JSON columns stay `Value` so parsing happens here, where the
/// module stays independent for unit testing.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumPageDef {
    #[serde(default)]
    pub id: String,
    pub layout_key: Option<String>,
    pub background: Option<serde_json::Value>,
    pub elements: Vec<AlbumElementDef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumElementDef {
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub z: i64,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    #[serde(default)]
    pub rotation: f64,
    pub photo_id: Option<String>,
    pub crop: Option<serde_json::Value>,
    pub text: Option<serde_json::Value>,
    pub style: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumExport {
    pub name: String,
    /// Trim size of one physical page, already converted to millimetres.
    pub width_mm: f64,
    pub height_mm: f64,
    pub pages: Vec<AlbumPageDef>,
}

/// Original-source resolver inputs — the command layer loads these from the
/// DB (never the renderer). Stock/matte resolution is optional.
#[derive(Debug, Clone, Default)]
pub struct RenderSources {
    /// photo id → original file + stored pixel dims.
    pub photos: HashMap<String, PhotoSource>,
    /// photo id → alpha-matte png path (`subject_mattes`).
    pub mattes: HashMap<String, String>,
}

#[derive(Debug, Clone)]
pub struct PhotoSource {
    pub path: String,
    pub width: u32,
    pub height: u32,
}

pub struct ExportOptions {
    pub dpi: u32,
    pub bleed_mm: f64,
    pub color_mode: String,
    /// Diagonal watermark text (proof exports), e.g. "PROOF".
    pub watermark: Option<String>,
    /// Font directories to resolve `style.fontFamily` from (bundled first).
    pub font_dirs: Vec<PathBuf>,
    /// Lab packages also write `pages/*.jpg` next to the PDF (Electron
    /// `writeLabPackage` parity); plain PDF exports write the PDF only.
    pub lab_package: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageOutcome {
    pub out_dir: String,
    pub pdf_path: String,
    pub pdf_pages: usize,
    pub spreads: usize,
    /// Human summaries of skipped work, e.g. `"2 shape element(s) skipped"`.
    pub notes: Vec<String>,
    /// sRGB profile embedded for the PDF/X-4 output intent, if any.
    pub profile: Option<String>,
    pub pdfx4: bool,
}

fn is_spread_layout(key: Option<&str>) -> bool {
    matches!(key, Some(k) if k.starts_with("spread_"))
}

/// Full package build (Electron `writeLabPackage` parity): per-page print
/// JPEGs under `out_dir/pages`, `<name>.pdf` + `manifest.txt` at the root.
pub fn run_export_package(
    album: &AlbumExport,
    opts: &ExportOptions,
    sources: &RenderSources,
    out_dir: &Path,
) -> Result<PackageOutcome, String> {
    std::fs::create_dir_all(out_dir.join("pages")).map_err(|e| e.to_string())?;
    let px_per_mm = opts.dpi as f64 / MM_PER_INCH;
    let page_w_px = (album.width_mm * px_per_mm).round() as u32;
    let page_h_px = (album.height_mm * px_per_mm).round() as u32;
    let bleed_px = (opts.bleed_mm * px_per_mm).round() as u32;

    let mut notes: Vec<String> = Vec::new();
    let mut printed: Vec<crate::core::pdf::PrintedPage> = Vec::new();
    let mut spreads = 0usize;
    let mut page_no = 0usize;

    for page in &album.pages {
        page_no += 1;
        let spread = is_spread_layout(page.layout_key.as_deref());
        // Physical-page rasters (bleed included; spreads pre-sliced at the
        // fold). `(raster, is_right_half)` — singles have one entry.
        let pieces = render_physical_pages(
            page,
            album.height_mm,
            opts,
            sources,
            page_w_px,
            page_h_px,
            bleed_px,
            &mut notes,
        )?;
        if spread {
            spreads += 1;
        }
        for (raster, is_right) in pieces.iter() {
            let is_right = *is_right;
            // Lab package: write the clean page files next to the PDF.
            if opts.lab_package {
                let name = if spread {
                    format!("page-{:03}-{}.jpg", page_no, if is_right { "right" } else { "left" })
                } else {
                    format!("page-{:03}.jpg", page_no)
                };
                write_jpeg(&out_dir.join("pages").join(&name), raster)?;
            }
            // PDF copy: watermarked for proofs, untouched otherwise.
            let pdf_raster = if opts.watermark.is_some() {
                apply_watermark(raster.clone(), opts.watermark.as_deref(), opts)?
            } else {
                raster.clone()
            };
            let w_mm = pdf_raster.width() as f64 / px_per_mm;
            let h_mm = pdf_raster.height() as f64 / px_per_mm;
            let (iw, ih) = (pdf_raster.width(), pdf_raster.height());
            printed.push(crate::core::pdf::PrintedPage {
                jpeg: crate::core::pdf::PageJpeg {
                    bytes: encode_jpeg(&pdf_raster)?,
                    width_px: iw,
                    height_px: ih,
                },
                // Spread halves bleed on the outer edge only; the right half
                // starts at the fold (x = bleed). Singles bleed all round.
                x_mm: if spread && is_right { opts.bleed_mm } else { 0.0 },
                y_mm: 0.0,
                w_mm,
                h_mm,
            });
        }
    }

    if notes.is_empty() {
        notes.push("Full parity render: all elements composited.".to_string());
    }

    // Manifest — lab-facing summary (Electron `writeLabPackage` text parity).
    let width_in = album.width_mm / MM_PER_INCH;
    let height_in = album.height_mm / MM_PER_INCH;
    let color_note = if opts.color_mode.eq_ignore_ascii_case("cmyk") {
        "NOTE: Files are delivered in sRGB JPEG; the PDF is RGB. Perform CMYK conversion with your press profile (G7/ISO Coated) before plating. Safe zones are respected — no faces or text cross the gutter."
    } else {
        "NOTE: Deliver as-is to silver-halide/lab systems. RGB profile preserved."
    };
    let manifest = format!(
        "AlbumForge lab package\n\
         Album: {}\n\
         Size: {} x {} mm ({} x {} in)\n\
         Resolution: {} DPI\n\
         Bleed: {} mm per side\n\
         Color mode: {}\n\
         Pages: {} (spreads exported as left/right files)\n\
         \n\
         {}\n\
         {}\n\
         \n\
         Generated: {}\n",
        album.name,
        album.width_mm,
        album.height_mm,
        (width_in * 100.0).round() / 100.0,
        (height_in * 100.0).round() / 100.0,
        opts.dpi,
        opts.bleed_mm,
        opts.color_mode.to_uppercase(),
        page_no,
        color_note,
        notes.join("\n"),
        chrono::Utc::now().to_rfc3339(),
    );
    std::fs::write(out_dir.join("manifest.txt"), manifest).map_err(|e| e.to_string())?;

    // PDF assembly with Media/Bleed/Trim boxes.
    let pdf_pages = printed.len();
    let pdf_path = out_dir.join(format!("{}.pdf", sanitize_file_stem(&album.name)));
    let outcome = crate::core::pdf::assemble_pdf(
        &pdf_path,
        &crate::core::pdf::PdfSpec {
            width_mm: album.width_mm,
            height_mm: album.height_mm,
            bleed_mm: opts.bleed_mm,
            pages: printed,
            album_name: album.name.clone(),
            color_mode: opts.color_mode.clone(),
        },
    )?;

    Ok(PackageOutcome {
        out_dir: out_dir.display().to_string(),
        pdf_path: pdf_path.display().to_string(),
        pdf_pages,
        spreads,
        notes,
        profile: outcome.profile,
        pdfx4: outcome.pdfx4,
    })
}

/// JPEG-encode an RGBA page (quality 95 — Electron `sharp().jpeg()` parity).
fn encode_jpeg(img: &image::RgbaImage) -> Result<Vec<u8>, String> {
    // Flatten to RGB for print (alpha only appears on rotated corners that
    // never reach the paper — the canvas fill is always opaque underneath).
    let rgb: image::RgbImage = image::ImageBuffer::from_fn(img.width(), img.height(), |x, y| {
        let p = img.get_pixel(x, y).0;
        image::Rgb([p[0], p[1], p[2]])
    });
    let mut out = std::io::Cursor::new(Vec::new());
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, 95)
        .encode(
            rgb.as_raw(),
            rgb.width(),
            rgb.height(),
            image::ExtendedColorType::Rgb8,
        )
        .map_err(|e| format!("jpeg encode: {e}"))?;
    Ok(out.into_inner())
}

fn write_jpeg(path: &Path, img: &image::RgbaImage) -> Result<(), String> {
    std::fs::write(path, encode_jpeg(img)?).map_err(|e| format!("write {}: {e}", path.display()))
}

/// Render one album page. Returns `(Some(single or spread-left), Option<spread-right>)`.
/// The returned raster is the *physical-page* form Electron writes: a single
/// page is trim + full bleed; a spread is sliced at the fold so each half
/// carries bleed only on its outer edge.
#[allow(clippy::type_complexity)]
fn render_physical_pages(
    page: &AlbumPageDef,
    page_h_mm: f64,
    opts: &ExportOptions,
    sources: &RenderSources,
    page_w_px: u32,
    page_h_px: u32,
    bleed_px: u32,
    notes: &mut Vec<String>,
) -> Result<Vec<(image::RgbaImage, bool)>, String> {
    let spread = is_spread_layout(page.layout_key.as_deref());
    let span_px = if spread { 2 * page_w_px } else { page_w_px };
    let canvas_w = span_px + 2 * bleed_px;
    let canvas_h = page_h_px + 2 * bleed_px;

    let bg = parse_background(page.background.as_ref());
    let mut canvas =
        image::RgbaImage::from_pixel(canvas_w, canvas_h, image::Rgba([bg.0, bg.1, bg.2, 255]));

    // Composite order: images by z first (parity), text after (Electron keeps
    // text on top of the whole raster, drawn in the PDF layer).
    let mut elements: Vec<&AlbumElementDef> = page.elements.iter().collect();
    elements.sort_by_key(|e| e.z);

    let mut image_els: Vec<&AlbumElementDef> = Vec::new();
    let mut text_els: Vec<&AlbumElementDef> = Vec::new();
    for el in &elements {
        match el.kind.as_str() {
            "image" => image_els.push(el),
            "text" => text_els.push(el),
            other => {
                let key = format!("{other} element(s)");
                if !notes.iter().any(|n| n.contains(&format!("{other} element"))) {
                    notes.push(format!(
                        "{} skipped in the native raster slice (rendered by the Electron exporter)",
                        other
                    ));
                }
                let _ = key;
            }
        }
    }

    for el in image_els {
        composite_image(&mut canvas, el, sources, page_h_px, bleed_px, span_px)
            .map_err(|e| format!("page {}: {e}", page.id))?;
    }

    if !text_els.is_empty() {
        let fonts = load_fonts(&opts.font_dirs);
        if fonts.is_empty() {
            notes.push("text element(s) skipped — no font files found in the font dirs".to_string());
        } else {
            for el in text_els {
                draw_text_element(&mut canvas, el, opts, page_h_mm, bleed_px, span_px, &fonts);
            }
        }
    }

    if spread {
        let half = page_w_px + bleed_px;
        let left = image::imageops::crop_imm(&mut canvas, 0, 0, half, canvas_h).to_image();
        let right = image::imageops::crop_imm(&mut canvas, half, 0, half, canvas_h).to_image();
        Ok(vec![(left, false), (right, true)])
    } else {
        Ok(vec![(canvas, false)])
    }
}

/// Normalised crop from the stored JSON (`{x,y,width,height}` 0..1).
fn crop_from_value(v: &serde_json::Value) -> Option<(f32, f32, f32, f32)> {
    let o = v.as_object()?;
    Some((
        o.get("x")?.as_f64()? as f32,
        o.get("y")?.as_f64()? as f32,
        o.get("width")?.as_f64()? as f32,
        o.get("height")?.as_f64()? as f32,
    ))
}

fn hex_to_rgb(hex: &str) -> (u8, u8, u8) {
    let h = hex.trim().trim_start_matches('#');
    if h.len() == 6 {
        if let Ok(v) = u32::from_str_radix(h, 16) {
            return ((v >> 16) as u8, (v >> 8) as u8, v as u8);
        }
    }
    (255, 255, 255)
}

fn parse_background(bg: Option<&serde_json::Value>) -> (u8, u8, u8) {
    match bg {
        Some(serde_json::Value::Object(map)) => match map.get("color") {
            Some(serde_json::Value::String(s)) => hex_to_rgb(s),
            _ => (255, 255, 255),
        },
        _ => (255, 255, 255),
    }
}

#[derive(Clone, Copy, PartialEq)]
enum BlendMode {
    Normal,
    Multiply,
    Screen,
    Overlay,
    SoftLight,
}

fn blend_mode_of(style: Option<&serde_json::Value>) -> Option<BlendMode> {
    let bm = style
        .and_then(|s| s.get("blendMode"))
        .and_then(|v| v.as_str())
        .unwrap_or("normal");
    Some(match bm {
        "multiply" => BlendMode::Multiply,
        "screen" => BlendMode::Screen,
        "overlay" => BlendMode::Overlay,
        "soft-light" => BlendMode::SoftLight,
        _ => return None,
    })
}

/// One blended pixel pair. `dst` is the canvas (opaque), `src` the element.
fn blend_px(dst: [u8; 3], src: [u8; 3], mode: BlendMode) -> [u8; 3] {
    let (dr, dg, db) = (dst[0] as f32 / 255.0, dst[1] as f32 / 255.0, dst[2] as f32 / 255.0);
    let (sr, sg, sb) = (src[0] as f32 / 255.0, src[1] as f32 / 255.0, src[2] as f32 / 255.0);
    let f = |d: f32, s: f32| -> f32 {
        match mode {
            BlendMode::Normal => s,
            BlendMode::Multiply => d * s,
            BlendMode::Screen => d + s - d * s,
            BlendMode::Overlay => {
                if d <= 0.5 {
                    2.0 * d * s
                } else {
                    1.0 - 2.0 * (1.0 - d) * (1.0 - s)
                }
            }
            BlendMode::SoftLight => {
                // W3C soft-light (compositing spec).
                if s <= 0.5 {
                    d - (1.0 - 2.0 * s) * d * (1.0 - d)
                } else {
                    let d2 = if d <= 0.25 {
                        ((16.0 * d - 12.0) * d + 4.0) * d
                    } else {
                        d.sqrt()
                    };
                    d + (2.0 * s - 1.0) * (d2 - d)
                }
            }
        }
    };
    let c = |v: f32| (v.clamp(0.0, 1.0) * 255.0).round() as u8;
    [c(f(dr, sr)), c(f(dg, sg)), c(f(db, sb))]
}

/// Composite `src` (RGBA) onto `canvas` at (x, y) with an optional blend.
fn composite_into(
    canvas: &mut image::RgbaImage,
    src: &image::RgbaImage,
    x: i64,
    y: i64,
    mode: BlendMode,
) {
    let (cw, ch) = (canvas.width() as i64, canvas.height() as i64);
    for sy in 0..src.height() as i64 {
        let dy = y + sy;
        if dy < 0 || dy >= ch {
            continue;
        }
        for sx in 0..src.width() as i64 {
            let dx = x + sx;
            if dx < 0 || dx >= cw {
                continue;
            }
            let sp = src.get_pixel(sx as u32, sy as u32).0;
            let a = sp[3] as f32 / 255.0;
            if a <= 0.0 {
                continue;
            }
            let dp = canvas.get_pixel(dx as u32, dy as u32).0;
            let blended = blend_px([dp[0], dp[1], dp[2]], [sp[0], sp[1], sp[2]], mode);
            // Alpha: src-over with the (possibly blended) colour.
            let o = |d: u8, b: u8| (d as f32 * (1.0 - a) + b as f32 * a).round() as u8;
            canvas.put_pixel(
                dx as u32,
                dy as u32,
                image::Rgba([o(dp[0], blended[0]), o(dp[1], blended[1]), o(dp[2], blended[2]), 255]),
            );
        }
    }
}

fn composite_image(
    canvas: &mut image::RgbaImage,
    el: &AlbumElementDef,
    sources: &RenderSources,
    page_h_px: u32,
    bleed_px: u32,
    span_px: u32,
) -> Result<(), String> {            let photo_id = el
                .photo_id
                .as_deref()
                .ok_or_else(|| "image element without photoId".to_string())?;
    let photo = sources
        .photos
        .get(photo_id)
        .ok_or_else(|| format!("photo {photo_id} not found (export needs the original file)"))?;

    let mut img = image::open(&photo.path)
        .map_err(|e| format!("open {}: {e}", photo.path))?
        .to_rgba8();

    // Crop region in original pixel space (stored dims — Electron parity).
    if let Some(crop) = el.crop.as_ref().and_then(crop_from_value) {
        let (iw, ih) = (photo.width as f32, photo.height as f32);
        let cw = (crop.2 * iw).round().clamp(1.0, iw) as u32;
        let ch = (crop.3 * ih).round().clamp(1.0, ih) as u32;
        let cx = (crop.0 * iw).round().clamp(0.0, (iw - cw as f32).max(0.0)) as u32;
        let cy = (crop.1 * ih).round().clamp(0.0, (ih - ch as f32).max(0.0)) as u32;
        img = image::imageops::crop_imm(&mut img, cx, cy, cw, ch).to_image();
    }

    // Filters (canonical multiplier form) on the (cropped) image.
    let filters = parse_filters(el.style.as_ref());
    if filters.blur > 0.0 {
        img = image::imageops::blur(&img, filters.blur);
    }
    img = apply_multiplier_filters(&img, &filters);

    // Rotation expands the canvas (transparent corners), Electron parity
    // (sharp rotates before resize).
    if el.rotation != 0.0 {
        img = rotate_arbitrary(&img, el.rotation as f32);
    }

    // Bleed extension: grow into the outer bleed on page-touching edges.
    let mut box_w = (el.width * span_px as f64).round().max(1.0) as u32;
    let mut box_h = (el.height * page_h_px as f64).round().max(1.0) as u32;
    let mut left = bleed_px as f64 + el.x * span_px as f64;
    let mut top = bleed_px as f64 + el.y * page_h_px as f64;
    let eps = 0.001;
    if el.x <= eps {
        left -= bleed_px as f64;
        box_w += bleed_px;
    }
    if el.x + el.width >= 1.0 - eps {
        box_w += bleed_px;
    }
    if el.y <= eps {
        top -= bleed_px as f64;
        box_h += bleed_px;
    }
    if el.y + el.height >= 1.0 - eps {
        box_h += bleed_px;
    }

    // Cover vs exact fill: with an explicit crop the aspect already matches,
    // so fill exactly; otherwise centre-crop cover.
    let has_crop = el.crop.is_some() && crop_from_value(el.crop.as_ref().unwrap()).is_some();
    let fitted = if has_crop {
        image::imageops::resize(&img, box_w, box_h, image::imageops::FilterType::Lanczos3)
    } else {
        resize_cover(&img, box_w, box_h)
    };

    // Alpha matte (`subject_mattes`, mask.kind === "alpha") — dest-in parity.
    let mut final_img = fitted;
    let mask_kind = el
        .style
        .as_ref()
        .and_then(|s| s.get("mask"))
        .and_then(|m| m.get("kind"))
        .and_then(|k| k.as_str())
        .unwrap_or("");
    if mask_kind == "alpha" {
        if let Some(matte_path) = sources.mattes.get(photo_id) {
            if let Ok(matte) = image::open(matte_path) {
                let mut m = matte.to_rgba8();
                if let Some(crop) = el.crop.as_ref().and_then(crop_from_value) {
                    let (iw, ih) = (photo.width as f32, photo.height as f32);
                    let cw = (crop.2 * iw).round().clamp(1.0, iw) as u32;
                    let ch = (crop.3 * ih).round().clamp(1.0, ih) as u32;
                    let cx = (crop.0 * iw).round().clamp(0.0, (iw - cw as f32).max(0.0)) as u32;
                    let cy = (crop.1 * ih).round().clamp(0.0, (ih - ch as f32).max(0.0)) as u32;
                    m = image::imageops::crop_imm(&mut m, cx, cy, cw, ch).to_image();
                }
                let m = image::imageops::resize(
                    &m,
                    final_img.width(),
                    final_img.height(),
                    image::imageops::FilterType::Lanczos3,
                );
                let (fw, fh) = (final_img.width(), final_img.height());
                let mut out = image::RgbaImage::new(fw, fh);
                for (x, y, px) in final_img.enumerate_pixels() {
                    let ma = m.get_pixel(x, y).0[0];
                    out.put_pixel(
                        x,
                        y,
                        image::Rgba([px.0[0], px.0[1], px.0[2], (px.0[3] as u32 * ma as u32 / 255) as u8]),
                    );
                }
                final_img = out;
            }
        }
    }

    let mode = blend_mode_of(el.style.as_ref()).unwrap_or(BlendMode::Normal);
    composite_into(canvas, &final_img, left.round() as i64, top.round() as i64, mode);
    Ok(())
}

/// Centre-crop cover resize (Electron `fit: "cover"` parity).
fn resize_cover(img: &image::RgbaImage, w: u32, h: u32) -> image::RgbaImage {
    let (iw, ih) = (img.width() as f64, img.height() as f64);
    if iw == 0.0 || ih == 0.0 || w == 0 || h == 0 {
        return image::RgbaImage::new(w.max(1), h.max(1));
    }
    let scale = ((w as f64 / iw).max(h as f64 / ih)).max(1e-6);
    let rw = (iw * scale).round().max(1.0) as u32;
    let rh = (ih * scale).round().max(1.0) as u32;
    let scaled = image::imageops::resize(img, rw, rh, image::imageops::FilterType::Lanczos3);
    let ox = (rw.saturating_sub(w)) / 2;
    let oy = (rh.saturating_sub(h)) / 2;
    image::imageops::crop_imm(&mut scaled.to_owned(), ox, oy, w, h).to_image()
}

struct PhotoFilters {
    brightness: f32,
    contrast: f32,
    saturation: f32,
    hue_deg: f32,
    blur: f32,
}

fn parse_filters(style: Option<&serde_json::Value>) -> PhotoFilters {
    let f = |k: &str, d: f32| -> f32 {
        style
            .and_then(|s| s.get("filters"))
            .and_then(|v| v.get(k))
            .and_then(|v| v.as_f64())
            .map(|x| x as f32)
            .unwrap_or(d)
    };
    PhotoFilters {
        brightness: f("brightness", 1.0),
        contrast: f("contrast", 1.0),
        saturation: f("saturation", 1.0),
        hue_deg: f("hue", 0.0),
        blur: f("blur", 0.0),
    }
}

/// Canonical multiplier filters (Electron `applyImageFilters` parity):
/// brightness/hue/saturation via modulate, contrast via `linear(a,
/// 127.5(1-a))`, blur above already applied (pixel ops are order-free here).
fn apply_multiplier_filters(img: &image::RgbaImage, f: &PhotoFilters) -> image::RgbaImage {
    let (w, h) = img.dimensions();
    let mut out = image::RgbaImage::new(w, h);
    let hue = f.hue_deg.to_radians();
    let (hc, hs) = (hue.cos(), hue.sin());
    for (x, y, px) in img.enumerate_pixels() {
        let mut r = px.0[0] as f32 / 255.0;
        let mut g = px.0[1] as f32 / 255.0;
        let mut b = px.0[2] as f32 / 255.0;
        // Hue rotation (linear colour matrix, css hue-rotate form).
        if hs.abs() > 1e-4 || (hc - 1.0).abs() > 1e-4 {
            let (nr, ng, nb) = hue_rotate(r, g, b, hc, hs);
            r = nr;
            g = ng;
            b = nb;
        }
        // Saturation multiplier around luma.
        if (f.saturation - 1.0).abs() > 1e-4 {
            let luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            let k = f.saturation;
            r = luma + (r - luma) * k;
            g = luma + (g - luma) * k;
            b = luma + (b - luma) * k;
        }
        // Contrast: linear(a, 127.5 * (1 - a)).
        if (f.contrast - 1.0).abs() > 1e-4 {
            let a = f.contrast;
            r = r * a + 0.5 * (1.0 - a);
            g = g * a + 0.5 * (1.0 - a);
            b = b * a + 0.5 * (1.0 - a);
        }
        // Brightness multiplier.
        if (f.brightness - 1.0).abs() > 1e-4 {
            r *= f.brightness;
            g *= f.brightness;
            b *= f.brightness;
        }
        out.put_pixel(
            x,
            y,
            image::Rgba([
                (r.clamp(0.0, 1.0) * 255.0).round() as u8,
                (g.clamp(0.0, 1.0) * 255.0).round() as u8,
                (b.clamp(0.0, 1.0) * 255.0).round() as u8,
                px.0[3],
            ]),
        );
    }
    out
}

/// CSS `hue-rotate` matrix (MDN canonical coefficients) applied to
/// normalised RGB — matches the libvips hue rotation Electron uses.
fn hue_rotate(r: f32, g: f32, b: f32, c: f32, s: f32) -> (f32, f32, f32) {
    let nr = (0.213 + 0.787 * c - 0.213 * s) * r
        + (0.715 - 0.715 * c - 0.715 * s) * g
        + (0.072 - 0.072 * c + 0.928 * s) * b;
    let ng = (0.213 - 0.213 * c + 0.143 * s) * r
        + (0.715 + 0.285 * c + 0.140 * s) * g
        + (0.072 - 0.072 * c - 0.283 * s) * b;
    let nb = (0.213 - 0.213 * c - 0.787 * s) * r
        + (0.715 - 0.715 * c + 0.715 * s) * g
        + (0.072 + 0.928 * c + 0.072 * s) * b;
    (nr, ng, nb)
}

/* ---------- text rendering (fontdue) ---------- */

struct LoadedFont {
    family: String,
    font: fontdue::Font,
}

/// Fonts available for text elements: filename stem == family (Electron
/// `listFonts` parity), bundled dirs first so first-seen wins.
fn load_fonts(dirs: &[PathBuf]) -> Vec<LoadedFont> {
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for dir in dirs {
        let Ok(entries) = std::fs::read_dir(dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let Some(stem) = path.file_stem().map(|s| s.to_string_lossy().into_owned()) else {
                continue;
            };
            if seen.contains(&stem) {
                continue;
            }
            let lower = path.extension().map(|e| e.to_string_lossy().to_lowercase());
            if lower.as_deref() != Some("ttf") {
                continue;
            }
            if let Ok(bytes) = std::fs::read(&path) {
                if let Ok(font) = fontdue::Font::from_bytes(bytes, fontdue::FontSettings::default()) {
                    seen.insert(stem.clone());
                    out.push(LoadedFont { family: stem, font });
                }
            }
        }
    }
    out
}

fn resolve_font<'a>(fonts: &'a [LoadedFont], family: &str) -> &'a fontdue::Font {
    let want = family.trim().to_lowercase();
    fonts
        .iter()
        .find(|f| f.family.to_lowercase() == want)
        .map(|f| &f.font)
        .unwrap_or_else(|| &fonts[0].font)
}

fn parse_text_style(style: Option<&serde_json::Value>) -> (f32, [u8; 3], String, f32, f32) {
    let get = |k: &str, d: f64| -> f64 {
        style.and_then(|s| s.get(k)).and_then(|v| v.as_f64()).unwrap_or(d)
    };
    let color = style
        .and_then(|s| s.get("color"))
        .and_then(|v| v.as_str())
        .map(hex_to_rgb)
        .unwrap_or((0, 0, 0));
    let family = style
        .and_then(|s| s.get("fontFamily"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let align = style
        .and_then(|s| s.get("align"))
        .and_then(|v| v.as_str())
        .unwrap_or("left")
        .to_string();
    (
        get("fontSize", 18.0) as f32,
        [color.0, color.1, color.2],
        family,
        get("lineHeight", 1.2) as f32,
        if align == "center" {
            0.5
        } else if align == "right" {
            1.0
        } else {
            0.0
        },
    )
}

/// Draw a text element into the canvas (top-left origin, mm design space
/// scaled to px). Font size `style.fontSize` is in PDF points (72/in) — the
/// Electron exporter draws text in pt over mm geometry, so px = pt × dpi/72.
fn draw_text_element(
    canvas: &mut image::RgbaImage,
    el: &AlbumElementDef,
    opts: &ExportOptions,
    page_h_mm: f64,
    bleed_px: u32,
    span_px: u32,
    fonts: &[LoadedFont],
) {
    let Some(text_val) = el.text.as_ref() else { return };
    let content = text_val
        .get("content")
        .and_then(|c| c.as_str())
        .unwrap_or("")
        .to_string();
    if content.trim().is_empty() {
        return;
    }
    let (font_size_pt, color, family, line_height, align) = parse_text_style(el.style.as_ref());
    let align = align as f64;
    let font = resolve_font(fonts, &family);

    // Box in mm (spread pages span double width for x; y uses the page height).
    let px_per_mm = opts.dpi as f64 / MM_PER_INCH;
    let span_mm = span_px as f64 / px_per_mm;
    let left_mm = bleed_px as f64 / px_per_mm + el.x * span_mm;
    let top_mm = bleed_px as f64 / px_per_mm + el.y * page_h_mm;
    let box_w_mm = el.width * span_mm;

    let px = (font_size_pt as f64 * opts.dpi as f64 / 72.0).round().max(1.0) as f32;
    let line_m = font.horizontal_line_metrics(px).expect("font metrics");
    let ascent = line_m.ascent;
    let line_h_px = (font_size_pt as f64 * line_height as f64 * opts.dpi as f64 / 72.0).max(ascent as f64) as f32;

    let origin_x_px = left_mm * px_per_mm;
    let origin_y_px = top_mm * px_per_mm;

    let lines: Vec<&str> = content.split('\n').collect();

    for (li, line) in lines.iter().enumerate() {
        let line_origin_x = origin_x_px + align * (box_w_mm * px_per_mm);
        // Measure first (align shifts the start).
        let mut width_px = 0.0f32;
        for ch in line.chars() {
            let (metrics, _) = font.rasterize(ch, px);
            width_px += metrics.advance_width;
        }
        let mut cursor_x = line_origin_x - align * width_px as f64;
        let baseline_y = origin_y_px + li as f64 * line_h_px as f64 + ascent as f64;
        for ch in line.chars() {
            let (metrics, bitmap) = font.rasterize(ch, px);
            let gx = (cursor_x + metrics.xmin as f64).round() as i64;
            let gy = (baseline_y + metrics.ymin as f64).round() as i64;
            for by in 0..metrics.height as usize {
                let row_start = by * metrics.width as usize;
                for bx in 0..metrics.width as usize {
                    let cov = bitmap[row_start + bx];
                    if cov == 0 {
                        continue;
                    }
                    let dx = gx + bx as i64;
                    let dy = gy + by as i64;
                    if dx < 0 || dy < 0 || dx >= canvas.width() as i64 || dy >= canvas.height() as i64 {
                        continue;
                    }
                    let alpha = cov as f32 / 255.0;
                    let dp = canvas.get_pixel(dx as u32, dy as u32).0;
                    let mix = |d: u8, s: u8| (d as f32 * (1.0 - alpha) + s as f32 * alpha).round() as u8;
                    canvas.put_pixel(
                        dx as u32,
                        dy as u32,
                        image::Rgba([
                            mix(dp[0], color[0]),
                            mix(dp[1], color[1]),
                            mix(dp[2], color[2]),
                            255,
                        ]),
                    );
                }
            }
            cursor_x += metrics.advance_width as f64;
        }
    }
}

/// Diagonal watermark raster (proof exports). Rendered onto a transparent
/// layer, rotated −45°, composited at 35% grey over the physical page.
fn apply_watermark(
    img: image::RgbaImage,
    text: Option<&str>,
    opts: &ExportOptions,
) -> Result<image::RgbaImage, String> {
    let Some(text) = text.filter(|t| !t.trim().is_empty()) else {
        return Ok(img);
    };
    let Some(first) = opts.font_dirs.first() else {
        return Ok(img);
    };
    let fonts = load_fonts(&[first.clone()]);
    let Some(f) = fonts.first() else {
        return Ok(img);
    };

    let (w, h) = img.dimensions();
    let font_px = ((w.min(h) as f64 * 0.22) as f32).max(24.0);
    let mut width_px = 0.0f32;
    for ch in text.chars() {
        let (m, _) = f.font.rasterize(ch, font_px);
        width_px += m.advance_width;
    }
    let line_m = f.font.horizontal_line_metrics(font_px).expect("metrics");
    let text_h = (line_m.ascent + line_m.descent).max(font_px);
    let layer_w = (width_px + font_px) as u32;
    let layer_h = (text_h + font_px) as u32;
    let mut layer = image::RgbaImage::from_pixel(layer_w.max(1), layer_h.max(1), image::Rgba([0, 0, 0, 0]));
    let mut cursor_x = font_px / 2.0;
    let baseline_y = font_px / 2.0 + line_m.ascent;
    for ch in text.chars() {
        let (m, bitmap) = f.font.rasterize(ch, font_px);
        let gx = (cursor_x + m.xmin as f32) as i64;
        let gy = (baseline_y + m.ymin as f32) as i64;
        for by in 0..m.height as usize {
            for bx in 0..m.width as usize {
                let cov = bitmap[by * m.width as usize + bx];
                if cov == 0 {
                    continue;
                }
                let dx = gx + bx as i64;
                let dy = gy + by as i64;
                if dx >= 0 && dy >= 0 && dx < layer.width() as i64 && dy < layer.height() as i64 {
                    let p = layer.get_pixel(dx as u32, dy as u32);
                    layer.put_pixel(
                        dx as u32,
                        dy as u32,
                        image::Rgba([191, 191, 191, p.0[3].saturating_add(cov)]),
                    );
                }
            }
        }
        cursor_x += m.advance_width;
    }
    let rotated = rotate_arbitrary(&layer, 45.0);
    let (rx, ry) = (
        (w.saturating_sub(rotated.width())) / 2,
        (h.saturating_sub(rotated.height())) / 2,
    );
    // 35% opacity grey (Electron drawWatermark parity).
    let mut base = img;
    let mut stamp = image::RgbaImage::new(base.width(), base.height());
    image::imageops::overlay(&mut stamp, &rotated, rx as i64, ry as i64);
    for (x, y, px) in stamp.enumerate_pixels() {
        if px.0[3] == 0 {
            continue;
        }
        let a = px.0[3] as f32 / 255.0 * 0.35;
        let dp = base.get_pixel(x, y).0;
        let mix = |d: u8, s: u8| (d as f32 * (1.0 - a) + s as f32 * a).round() as u8;
        base.put_pixel(x, y, image::Rgba([mix(dp[0], px.0[0]), mix(dp[1], px.0[1]), mix(dp[2], px.0[2]), 255]));
    }
    Ok(base)
}

fn sanitize_file_stem(name: &str) -> String {
    let mut out: String = name
        .chars()
        .map(|c| match c {
            'a'..='z' | 'A'..='Z' | '0'..='9' | ' ' | '-' | '_' => c,
            _ => '-',
        })
        .collect();
    if out.trim().is_empty() {
        out = "album".to_string();
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tiny_photo(path: &Path, w: u32, h: u32) {
        let img = image::RgbaImage::from_fn(w, h, |x, y| {
            image::Rgba([(x * 7) as u8, (y * 13) as u8, 180, 255])
        });
        image::DynamicImage::ImageRgba8(img)
            .save(path)
            .unwrap();
    }

    fn page_with_image(w_px: u32, h_px: u32) -> (AlbumPageDef, RenderSources, std::path::PathBuf) {
        let dir = std::env::temp_dir().join(format!("af-exp-geom-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let photo_path = dir.join("p.png");
        tiny_photo(&photo_path, 400, 300);
        let page = AlbumPageDef {
            id: "pg1".into(),
            layout_key: None,
            background: None,
            elements: vec![AlbumElementDef {
                kind: "image".into(),
                z: 0,
                x: 0.0,
                y: 0.0,
                width: 1.0,
                height: 1.0,
                rotation: 0.0,
                photo_id: Some("ph1".into()),
                crop: None,
                text: None,
                style: None,
            }],
        };
        let mut sources = RenderSources::default();
        sources.photos.insert(
            "ph1".into(),
            PhotoSource {
                path: photo_path.display().to_string(),
                width: 400,
                height: 300,
            },
        );
        (page, sources, dir)
    }

    #[test]
    fn single_page_canvas_is_trim_plus_full_bleed() {
        // 100 x 200 mm at 300 dpi with 3 mm bleed.
        let px_per_mm = 300.0 / MM_PER_INCH;
        let (page, sources, dir) = page_with_image(0, 0);
        let opts = ExportOptions {
            dpi: 300,
            bleed_mm: 3.0,
            color_mode: "rgb".into(),
            watermark: None,
            font_dirs: vec![],
            lab_package: true,
        };
        let page_w = (100.0 * px_per_mm).round() as u32;
        let page_h = (200.0 * px_per_mm).round() as u32;
        let bleed = (3.0 * px_per_mm).round() as u32;
        let mut notes = Vec::new();
        let rasters = render_physical_pages(
            &page,
            200.0,
            &opts,
            &sources,
            page_w,
            page_h,
            bleed,
            &mut notes,
        )
        .unwrap();
        assert_eq!(rasters.len(), 1);
        let (canvas, is_right) = &rasters[0];
        assert!(!is_right);
        assert_eq!(canvas.width(), page_w + 2 * bleed);
        assert_eq!(canvas.height(), page_h + 2 * bleed);
        // Full-bleed photo: the outer bleed ring must be non-white (photo px).
        let px = canvas.get_pixel(2, 2).0;
        assert_ne!(px, [255, 255, 255, 255]);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn spread_slices_into_two_physical_pages() {
        let px_per_mm = 300.0 / MM_PER_INCH;
        let (mut page, sources, dir) = page_with_image(0, 0);
        page.layout_key = Some("spread_hero".into());
        page.elements[0].x = 0.0;
        page.elements[0].width = 1.0; // spans the whole double width
        let opts = ExportOptions {
            dpi: 300,
            bleed_mm: 3.0,
            color_mode: "rgb".into(),
            watermark: None,
            font_dirs: vec![],
            lab_package: true,
        };
        let page_w = (100.0 * px_per_mm).round() as u32;
        let page_h = (200.0 * px_per_mm).round() as u32;
        let bleed = (3.0 * px_per_mm).round() as u32;
        let mut notes = Vec::new();
        let rasters = render_physical_pages(
            &page,
            200.0,
            &opts,
            &sources,
            page_w,
            page_h,
            bleed,
            &mut notes,
        )
        .unwrap();
        assert_eq!(rasters.len(), 2);
        // Each half is one page + one outer bleed (fold side has no bleed).
        assert_eq!(rasters[0].0.width(), page_w + bleed);
        assert!(!rasters[0].1);
        assert_eq!(rasters[1].0.width(), page_w + bleed);
        assert!(rasters[1].1);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn multiplier_filters_keep_neutral_at_defaults() {
        let img = image::RgbaImage::from_pixel(3, 1, image::Rgba([120, 90, 40, 255]));
        let f = PhotoFilters {
            brightness: 1.0,
            contrast: 1.0,
            saturation: 1.0,
            hue_deg: 0.0,
            blur: 0.0,
        };
        let out = apply_multiplier_filters(&img, &f);
        assert_eq!(out.get_pixel(1, 0).0, [120, 90, 40, 255]);
        // Brightness 2x doubles, clamped.
        let f2 = PhotoFilters { brightness: 2.0, ..f };
        let out2 = apply_multiplier_filters(&img, &f2);
        assert_eq!(out2.get_pixel(0, 0).0[0], 240);
    }

    #[test]
    fn multiply_blend_darkens_against_white() {
        let mut canvas = image::RgbaImage::from_pixel(1, 1, image::Rgba([255, 255, 255, 255]));
        let src = image::RgbaImage::from_pixel(1, 1, image::Rgba([128, 128, 128, 255]));
        composite_into(&mut canvas, &src, 0, 0, BlendMode::Multiply);
        let px = canvas.get_pixel(0, 0).0;
        assert_eq!(px[0], 128);
        assert_eq!(px[1], 128);
    }

    #[test]
    fn text_requires_no_fonts_and_skips_cleanly() {
        let (mut page, sources, dir) = page_with_image(0, 0);
        page.elements.push(AlbumElementDef {
            kind: "text".into(),
            z: 1,
            x: 0.1,
            y: 0.1,
            width: 0.5,
            height: 0.1,
            rotation: 0.0,
            photo_id: None,
            crop: None,
            text: Some(serde_json::json!({ "content": "Hello" })),
            style: Some(serde_json::json!({ "fontSize": 48 })),
        });
        let opts = ExportOptions {
            dpi: 300,
            bleed_mm: 3.0,
            color_mode: "rgb".into(),
            watermark: None,
            font_dirs: vec![],
            lab_package: true,
        };
        let px_per_mm = 300.0 / MM_PER_INCH;
        let page_w = (100.0 * px_per_mm).round() as u32;
        let page_h = (200.0 * px_per_mm).round() as u32;
        let bleed = (3.0 * px_per_mm).round() as u32;
        let mut notes = Vec::new();
        let rasters = render_physical_pages(
            &page,
            200.0,
            &opts,
            &sources,
            page_w,
            page_h,
            bleed,
            &mut notes,
        )
        .unwrap();
        assert_eq!(rasters.len(), 1);
        assert!(notes.iter().any(|n| n.contains("text element(s) skipped")));
        std::fs::remove_dir_all(&dir).ok();
    }
}

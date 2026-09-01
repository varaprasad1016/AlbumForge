//! Headless 300 DPI export engine (foundation).
//!
//! Consumes a JSON layout state, re-opens the original uncompressed sources,
//! applies transforms/crops/filters, and renders pages at print resolution.
//! The page raster pipeline is real (so preview parity can be verified
//! against the WebGL shader preview); PDF/TIFF assembly lands here next via
//! the `printpdf` / `tiff` crates.

use std::path::Path;

use serde::{Deserialize, Serialize};

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
            image::imageops::rotate(&filtered.to_rgba8(), el.rotation)
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

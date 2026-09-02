//! PDF assembly (Phase 5) — the headless renderer's print output.
//!
//! The raster engine (`core/export.rs`) renders one print-ready JPEG per
//! *physical* page (trim size + bleed already baked into the pixels). This
//! module wraps those JPEGs into a multi-page PDF with exact page geometry:
//!
//!   - MediaBox  = trim + 2× bleed (the sheet the lab cuts from)
//!   - BleedBox  = MediaBox (bleed reaches the media edge)
//!   - TrimBox   = the final page size (what the customer keeps)
//!   - JPEG      = embedded as an Image XObject with `/Filter /DCTDecode`
//!     (byte passthrough — the `image` crate already encoded it)
//!
//! PDF/X-4 conformance is provided **where supported**: a `/GTS_PDFX` output
//! intent needs a real ICC profile stream, so we look for the OS's bundled
//! sRGB profile (Windows ships `sRGB Color Space Profile.icm`, macOS ships
//! `sRGB Profile.icc`, most Linux distros ship one under colord). When none
//! is found the PDF still carries the correct boxes and renders identically;
//! only the X-4 intent marker is omitted (see `PdfOutcome`).
//!
//! Assembly is intentionally lopdf-only: raw JPEG bytes pass through
//! unchanged (no re-encode, no colour mangling), the object graph is small
//! and fully under our control, and the output round-trips through
//! `lopdf::Document::load` in tests.

use std::path::{Path, PathBuf};

/// A fully-rendered page raster (already includes bleed pixels where the
/// caller chose to bleed).
pub struct PageJpeg {
    pub bytes: Vec<u8>,
    pub width_px: u32,
    pub height_px: u32,
}

/// One PDF page: the JPEG plus where (in mm, PDF origin bottom-left) and how
/// large it must be drawn on the media sheet.
pub struct PrintedPage {
    pub jpeg: PageJpeg,
    /// Draw origin in media coordinates (bottom-left), millimetres.
    pub x_mm: f64,
    pub y_mm: f64,
    pub w_mm: f64,
    pub h_mm: f64,
}

pub struct PdfSpec {
    /// Trim size of one physical page (mm).
    pub width_mm: f64,
    pub height_mm: f64,
    pub bleed_mm: f64,
    pub pages: Vec<PrintedPage>,
    pub album_name: String,
    pub color_mode: String,
}

pub struct PdfOutcome {
    /// Path of the sRGB profile embedded for the X-4 output intent, if any.
    pub profile: Option<String>,
    /// True when a `/GTS_PDFX` output intent was embedded (profile found).
    pub pdfx4: bool,
}

const PT_PER_MM: f64 = 72.0 / 25.4;

/// Candidate sRGB ICC/ICM files shipped by each OS. Looked up at assembly
/// time so no profile bytes need to live in the repo or the binary.
pub fn srgb_profile_candidates() -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = Vec::new();
    #[cfg(windows)]
    {
        if let Ok(windir) = std::env::var("WINDIR") {
            let base = Path::new(&windir).join("System32/spool/drivers/color");
            out.push(base.join("sRGB Color Space Profile.icm"));
            out.push(base.join("sRGB Color Space Profile.icc"));
        }
    }
    #[cfg(target_os = "macos")]
    {
        out.push(PathBuf::from(
            "/System/Library/ColorSync/Profiles/sRGB Profile.icc",
        ));
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        out.push(PathBuf::from("/usr/share/color/icc/colord/sRGB.icc"));
        out.push(PathBuf::from("/usr/share/color/icc/sRGB.icc"));
        if let Ok(home) = std::env::var("HOME") {
            out.push(Path::new(&home).join(".local/share/icc/sRGB.icc"));
        }
    }
    out.retain(|p| p.is_file());
    out
}

use lopdf::{dictionary, Document, Object, Stream};

/// Name object helper (`/Type /XObject`, `/Filter /DCTDecode`, …). PDF
/// dictionaries demand Name objects for enumerated values; `&str` values
/// alone would serialise as literal strings.
fn nm(s: &str) -> Object {
    Object::Name(s.as_bytes().to_vec())
}

/// Rectangle array helper (`/MediaBox`, `/TrimBox`, …) — four reals.
fn rect(x0: f64, y0: f64, x1: f64, y1: f64) -> Vec<Object> {
    vec![
        Object::Real(x0 as f32),
        Object::Real(y0 as f32),
        Object::Real(x1 as f32),
        Object::Real(y1 as f32),
    ]
}

/// XMP packet advertising PDF/X-4:2008. The `/OutputIntent` (only added when
/// an ICC profile is found) is what actually makes the file X-4 conformant;
/// this metadata mirrors the claim for validators that read XMP.
fn x4_xmp(album: &str) -> Vec<u8> {
    let escaped = album.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;");
    format!(
        "<?xpacket begin=\"\u{feff}\" id=\"W5M0MpCehiHzreSzNTczkc9d\"?>\n\
         <x:xmpmeta xmlns:x=\"adobe:ns:meta/\">\n\
         <rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">\n\
         <rdf:Description rdf:about=\"\" xmlns:pdfaid=\"http://www.aiim.org/pdfa/ns/id/\"\n\
         xmlns:xmp=\"http://ns.adobe.com/xap/1.0/\"\n\
         xmlns:xmpMM=\"http://ns.adobe.com/xap/1.0/mm/\"\n\
         xmlns:dc=\"http://purl.org/dc/elements/1.1/\"\n\
         xmlns:pdfx=\"http://ns.adobe.com/pdfx/1.3/\">\n\
         <pdfaid:part>4</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance>\n\
         <xmp:CreatorTool>AlbumForge native export</xmp:CreatorTool>\n\
         <xmp:CreateDate>{}</xmp:CreateDate>\n\
         <dc:title><rdf:Alt><rdf:li xml:lang=\"x-default\">{}</rdf:li></rdf:Alt></dc:title>\n\
         <pdfx:GTS_PDFXVersion>PDF/X-4:2008</pdfx:GTS_PDFXVersion>\n\
         <pdfx:GTS_PDFXConformance>PDF/X-4</pdfx:GTS_PDFXConformance>\n\
         </rdf:Description></rdf:RDF></x:xmpmeta>\n\
         <?xpacket end=\"w\"?>",
        chrono::Utc::now().to_rfc3339(),
        escaped
    )
    .into_bytes()
}

pub fn assemble_pdf(path: &Path, spec: &PdfSpec) -> Result<PdfOutcome, String> {
    let media_w_mm = spec.width_mm + 2.0 * spec.bleed_mm;
    let media_h_mm = spec.height_mm + 2.0 * spec.bleed_mm;
    let (mw, mh) = (media_w_mm * PT_PER_MM, media_h_mm * PT_PER_MM);
    let b = spec.bleed_mm * PT_PER_MM;

    let mut doc = Document::with_version("1.6");
    let catalog_id = doc.new_object_id();
    let pages_id = doc.new_object_id();
    let mut page_refs: Vec<Object> = Vec::new();

    // PDF/X-4 output intent: embedded sRGB profile stream when discoverable.
    let (outcome_profile, intent_id) = match srgb_profile_candidates().first() {
        Some(profile) => {
            let icc = std::fs::read(profile).map_err(|e| format!("read icc profile: {e}"))?;
            let icc_id = doc.add_object(Stream::new(
                dictionary! {
                    "N" => 3i64,
                    "Alternate" => nm("sRGB"),
                },
                icc,
            ));
            let intent = doc.add_object(dictionary! {
                "Type" => nm("OutputIntent"),
                "S" => nm("GTS_PDFX"),
                "OutputConditionIdentifier" => Object::string_literal("sRGB IEC61966-2.1"),
                "Info" => Object::string_literal(format!(
                    "sRGB (embedded from {})",
                    profile.file_name().unwrap_or_default().to_string_lossy()
                )),
                "RegistryName" => Object::string_literal("http://www.color.org"),
                "DestOutputProfile" => icc_id,
            });
            (Some(profile.display().to_string()), Some(intent))
        }
        None => (None, None),
    };

    let xmp_id = doc.add_object(Stream::new(
        dictionary! {
            "Type" => nm("Metadata"),
            "Subtype" => nm("XML"),
        },
        x4_xmp(&spec.album_name),
    ));

    for printed in &spec.pages {
        // Image XObject — the JPEG bytes pass through untouched.
        let img_id = doc.add_object(Stream::new(
            dictionary! {
                "Type" => nm("XObject"),
                "Subtype" => nm("Image"),
                "Width" => printed.jpeg.width_px as i64,
                "Height" => printed.jpeg.height_px as i64,
                "ColorSpace" => nm("DeviceRGB"),
                "BitsPerComponent" => 8i64,
                "Filter" => nm("DCTDecode"),
            },
            printed.jpeg.bytes.clone(),
        ));

        // Content: `cm` maps the image's top-left to (x, mediaH - y - h) in pt.
        let x = printed.x_mm * PT_PER_MM;
        let y_top = (media_h_mm - printed.y_mm - printed.h_mm) * PT_PER_MM;
        let w = printed.w_mm * PT_PER_MM;
        let h = printed.h_mm * PT_PER_MM;
        let content = format!(
            "q\n{w:.2} 0 0 {h:.2} {x:.2} {y_top:.2} cm\n/Im0 Do\nQ\n"
        );
        let content_id = doc.add_object(Stream::new(dictionary! {}, content.into_bytes()));

        let page_id = doc.new_object_id();
        let mut page_dict = dictionary! {
            "Type" => nm("Page"),
            "Parent" => pages_id,
            "MediaBox" => rect(0.0, 0.0, mw, mh),
            "BleedBox" => rect(0.0, 0.0, mw, mh),
            "TrimBox" => rect(b, b, mw - b, mh - b),
            "Resources" => dictionary! {
                "XObject" => dictionary! { "Im0" => img_id },
            },
            "Contents" => content_id,
        };
        // Every physical page shares the X-4 intent.
        if let Some(intent) = intent_id {
            page_dict.set("OutputIntent", vec![Object::Reference(intent)]);
        }
        page_refs.push(Object::Reference(page_id));
        doc.objects.insert(page_id, Object::Dictionary(page_dict));
    }

    let mut catalog = dictionary! {
        "Type" => nm("Catalog"),
        "Pages" => pages_id,
        "Metadata" => xmp_id,
    };
    if let Some(intent) = intent_id {
        catalog.set("OutputIntents", vec![Object::Reference(intent)]);
    }
    doc.objects.insert(catalog_id, Object::Dictionary(catalog));

    let pages_dict = dictionary! {
        "Type" => nm("Pages"),
        "Kids" => page_refs,
        "Count" => spec.pages.len() as i64,
        "MediaBox" => rect(0.0, 0.0, mw, mh),
    };
    doc.objects.insert(pages_id, Object::Dictionary(pages_dict));
    doc.trailer.set("Root", catalog_id);

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("create pdf dir: {e}"))?;
    }
    doc.save(path).map_err(|e| format!("save pdf: {e}"))?;
    Ok(PdfOutcome {
        profile: outcome_profile,
        pdfx4: intent_id.is_some(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tiny_jpeg() -> PageJpeg {
        // 2x1 RGB JPEG via the image crate (same codec the raster engine uses).
        let img = image::RgbImage::from_pixel(2, 1, image::Rgb([200, 0, 0]));
        let mut bytes = std::io::Cursor::new(Vec::new());
        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut bytes, 92)
            .encode(img.as_raw(), 2, 1, image::ExtendedColorType::Rgb8)
            .unwrap();
        PageJpeg { bytes: bytes.into_inner(), width_px: 2, height_px: 1 }
    }

    #[test]
    fn assembles_pdf_with_boxes() {
        let dir = std::env::temp_dir().join(format!("af-pdf-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let out = dir.join("out.pdf");
        let spec = PdfSpec {
            width_mm: 300.0,
            height_mm: 200.0,
            bleed_mm: 3.0,
            pages: vec![PrintedPage {
                jpeg: tiny_jpeg(),
                x_mm: 0.0,
                y_mm: 0.0,
                w_mm: 306.0,
                h_mm: 206.0,
            }],
            album_name: "Test".into(),
            color_mode: "rgb".into(),
        };
        let res = assemble_pdf(&out, &spec).unwrap();
        // Profile presence depends on the host; the boxes must always be right.
        let parsed = Document::load(&out).unwrap();
        let pages = parsed.get_pages();
        assert_eq!(pages.len(), 1);
        let page_id = pages.values().next().unwrap();
        let dict = parsed.get_dictionary(*page_id).unwrap();
        let trim: Vec<f64> = dict
            .get(b"TrimBox")
            .unwrap()
            .as_array()
            .unwrap()
            .iter()
            .map(|o| o.as_float().unwrap_or(0.0) as f64)
            .collect();
        let pt = 72.0 / 25.4;
        let b = 3.0 * pt;
        assert!((trim[0] - b).abs() < 0.01, "trim left = {}", trim[0]);
        assert!((trim[2] - (300.0 * pt + b)).abs() < 0.01, "trim right = {}", trim[2]);
        let _ = res;
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn discovers_srgb_or_reports_none() {
        // Either the OS ships a profile (then candidates is non-empty and the
        // first is a file) or none — never panics.
        let _ = srgb_profile_candidates();
    }
}

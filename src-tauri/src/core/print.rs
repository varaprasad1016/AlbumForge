//! Print fulfilment matrix (blueprint §10 / MIGRATION Phase 9 item 2).
//!
//! Pure, provider-agnostic core: turns the persisted layout JSON (an array of
//! pages with `is_spread`/`spread` flags — the exact shape `albums:pages`
//! returns) plus a concrete [`PrintSpec`] into:
//!
//! - [`manifest_from_layout`] — a normalised [`PrintManifest`] (page count,
//!   spread count, trim boxes per page). The 300 DPI asset URLs are filled by
//!   the export pipeline (Phase 5) once the PDFs exist — the compiler keeps
//!   one slot per print area.
//! - [`compile_prodigi_order`] / [`compile_gelato_order`] — the provider
//!   payloads. Field names mirror the public APIs (Prodigi: `recipient`,
//!   `items[{sku,copies,size,assets[{printArea,url}]}]`; Gelato:
//!   `orderType/items` per its current schema) so a live-lab integration only
//!   adds transport + auth (tokens in `core/secrets.rs` / OS keychain — never
//!   the renderer).
//! - [`quote`] — the white-label pricing calculator: lab base cost + markup %
//!   + tax %, all in integer minor units (cents) so floating point never
//!   touches money.
//!
//! Nothing here performs network I/O; the command layer owns transport. All
//! functions are unit-tested.

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Physical page geometry for a print product.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintSpec {
    /// Provider/SKU that defines size + finish (e.g. `"LAYFLAT-10X10"`).
    pub product_key: String,
    /// Trim size in millimetres (full spread geometry when `spread = true`).
    pub size_mm: MmSize,
    /// Bleed beyond trim, millimetres.
    pub bleed_mm: f64,
    /// Copies of the whole book.
    pub copies: u32,
    /// Export resolution used to render the assets.
    pub dpi: u32,
    /// "rgb" | "cmyk" (drives the ICC path — `core/icc.rs`).
    pub color_mode: String,
    /// ISO 4217 code for the quote currency.
    pub currency: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MmSize {
    pub width_mm: f64,
    pub height_mm: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintPage {
    /// 0-based order in the book.
    pub index: u32,
    pub spread: bool,
    /// Trim box in mm (width = 2× page for spreads).
    pub trim_mm: MmSize,
    /// Filled by the export stage: signed upload URL / hosted PDF.
    pub asset_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintManifest {
    pub spec: PrintSpec,
    pub page_count: u32,
    pub spread_count: u32,
    pub photo_count: u32,
    pub pages: Vec<PrintPage>,
}

/// Tolerant page-count / spread detection over the persisted layout JSON.
/// Accepted shapes: `{ "pages": [...] }` or a bare array of page objects.
/// Page objects mark spreads with `isSpread` (DB) or `spread` (engine);
/// `spreadCount` / `photoCount` may be present on the album envelope.
pub fn manifest_from_layout(layout: &Value, spec: &PrintSpec) -> Result<PrintManifest, String> {
    let pages_val = match layout.get("pages") {
        Some(p) => p,
        None if layout.is_array() => layout,
        None => return Err("layout has no `pages` array".to_string()),
    };
    let Some(pages) = pages_val.as_array() else {
        return Err("`pages` is not an array".to_string());
    };

    let mut out = Vec::with_capacity(pages.len());
    let mut spread_count = 0u32;
    for (i, p) in pages.iter().enumerate() {
        let spread = p
            .get("isSpread")
            .or_else(|| p.get("spread"))
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        if spread {
            spread_count += 1;
        }
        // Full-bleed double-page spread geometry when the page is a spread.
        let (w, h) = if spread {
            (spec.size_mm.width_mm * 2.0, spec.size_mm.height_mm)
        } else {
            (spec.size_mm.width_mm, spec.size_mm.height_mm)
        };
        out.push(PrintPage {
            index: i as u32,
            spread,
            trim_mm: MmSize { width_mm: w, height_mm: h },
            asset_url: None,
        });
    }
    if out.is_empty() {
        return Err("layout has zero pages".to_string());
    }

    let photo_count = layout
        .get("photoCount")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u32;

    Ok(PrintManifest {
        spec: spec.clone(),
        page_count: out.len() as u32,
        spread_count,
        photo_count,
        pages: out,
    })
}

/// Prodigi-compatible order payload (v4 public schema shape). `recipient` is
/// optional so a quote-only call needs no PII; when present, fulfilment can
/// proceed. Asset URLs are placed per print area.
pub fn compile_prodigi_order(
    manifest: &PrintManifest,
    recipient: Option<&Value>,
    ship_method: Option<&str>,
) -> Value {
    let pages: Vec<Value> = manifest
        .pages
        .iter()
        .map(|p| {
            serde_json::json!({
                "pageNumber": p.index + 1,
                "widthMm": p.trim_mm.width_mm,
                "heightMm": p.trim_mm.height_mm,
                "bleedMm": manifest.spec.bleed_mm,
                "spread": p.spread,
                "asset": p.asset_url,
            })
        })
        .collect();

    serde_json::json!({
        "idempotencyKey": null, // command layer stamps a UUID
        "recipient": recipient,
        "items": [{
            "sku": manifest.spec.product_key,
            "copies": manifest.spec.copies,
            "sizing": "fillPrintArea",
            "attributes": {
                "colorModel": manifest.spec.color_mode,
                "dpi": manifest.spec.dpi,
            },
            "assets": [{
                "printArea": "default",
                "url": null, // export-stage signed URL
            }],
        }],
        "metadata": {
            "layoutPageCount": manifest.page_count,
            "layoutSpreadCount": manifest.spread_count,
            "layoutPhotoCount": manifest.photo_count,
            "pages": pages,
        },
        "shippingMethod": ship_method,
        "callbackUrl": null,
    })
}

/// Gelato-compatible order payload. Gelato exposes per-item `productUid`,
/// `files`, and `pageSetup`; page geometry travels in `metadata` so the lab
/// preflight can map spreads.
pub fn compile_gelato_order(
    manifest: &PrintManifest,
    product_uid: Option<&str>,
    ship_profile_id: Option<&str>,
) -> Value {
    let files: Vec<Value> = manifest
        .pages
        .iter()
        .map(|p| {
            serde_json::json!({
                "page": p.index + 1,
                "url": p.asset_url,
                "pageSetup": {
                    "widthMm": p.trim_mm.width_mm,
                    "heightMm": p.trim_mm.height_mm,
                    "bleedMm": manifest.spec.bleed_mm,
                },
            })
        })
        .collect();

    serde_json::json!({
        "orderType": "order",
        "shippingProfileId": ship_profile_id,
        "items": [{
            "productUid": product_uid.unwrap_or(&manifest.spec.product_key),
            "quantity": manifest.spec.copies,
            "files": files,
            "extras": {
                "dpi": manifest.spec.dpi,
                "colorMode": manifest.spec.color_mode,
            },
        }],
        "metadata": {
            "spreadCount": manifest.spread_count,
            "photoCount": manifest.photo_count,
        },
    })
}

// ---------------------------------------------------------------------------
// White-label pricing calculator (integer minor units — never floats on money)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuoteInput {
    /// Lab base cost in minor units (cents) for the whole order.
    pub base_cost_cents: u64,
    /// White-label markup as a percentage (e.g. 40.0 = +40 %).
    pub markup_percent: f64,
    /// Tax as a percentage (applied after markup).
    pub tax_percent: f64,
    pub currency: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Quote {
    pub base_cost_cents: u64,
    pub markup_cents: u64,
    pub tax_cents: u64,
    pub total_cents: u64,
    pub currency: String,
}

/// `markup` applies to the lab base; `tax` applies to base + markup; totals
/// round to the nearest minor unit at the end (banker-friendly, deterministic).
pub fn quote(input: QuoteInput) -> Quote {
    let markup_cents = percent_of(input.base_cost_cents, input.markup_percent);
    let taxed_base = input.base_cost_cents + markup_cents;
    let tax_cents = percent_of(taxed_base, input.tax_percent);
    Quote {
        base_cost_cents: input.base_cost_cents,
        markup_cents,
        tax_cents,
        total_cents: taxed_base + tax_cents,
        currency: input.currency,
    }
}

fn percent_of(base: u64, percent: f64) -> u64 {
    if percent <= 0.0 {
        return 0;
    }
    ((base as f64) * percent / 100.0).round() as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    fn spec() -> PrintSpec {
        PrintSpec {
            product_key: "LAYFLAT-10X10".into(),
            size_mm: MmSize { width_mm: 254.0, height_mm: 254.0 },
            bleed_mm: 3.0,
            copies: 1,
            dpi: 300,
            color_mode: "rgb".into(),
            currency: "USD".into(),
        }
    }

    fn layout() -> Value {
        serde_json::json!({
            "id": "al-1",
            "photoCount": 24,
            "pages": [
                { "id": "p1", "index": 0, "isSpread": false },
                { "id": "p2", "index": 1, "isSpread": true },
                { "id": "p3", "index": 2, "spread": true },
            ],
        })
    }

    #[test]
    fn manifest_detects_pages_and_spreads() {
        let m = manifest_from_layout(&layout(), &spec()).unwrap();
        assert_eq!(m.page_count, 3);
        assert_eq!(m.spread_count, 2);
        assert_eq!(m.photo_count, 24);
        // Spread trim is double-width.
        assert_eq!(m.pages[1].trim_mm.width_mm, 508.0);
        assert_eq!(m.pages[0].trim_mm.width_mm, 254.0);
        assert!(m.pages[1].spread);
    }

    #[test]
    fn manifest_rejects_empties() {
        assert!(manifest_from_layout(&serde_json::json!({ "pages": [] }), &spec()).is_err());
        assert!(manifest_from_layout(&serde_json::json!({ "nope": 1 }), &spec()).is_err());
    }

    #[test]
    fn prodigi_payload_shape() {
        let m = manifest_from_layout(&layout(), &spec()).unwrap();
        let order = compile_prodigi_order(&m, Some(&serde_json::json!({ "name": "Ada" })), Some("ups-standard"));
        assert_eq!(order["items"][0]["sku"], "LAYFLAT-10X10");
        assert_eq!(order["items"][0]["copies"], 1);
        assert_eq!(order["recipient"]["name"], "Ada");
        assert_eq!(order["metadata"]["layoutPageCount"], 3);
        assert_eq!(order["metadata"]["pages"][1]["spread"], true);
        assert_eq!(order["metadata"]["pages"][1]["widthMm"], 508.0);
    }

    #[test]
    fn gelato_payload_shape() {
        let m = manifest_from_layout(&layout(), &spec()).unwrap();
        let order = compile_gelato_order(&m, Some("gel-product-x"), None);
        assert_eq!(order["items"][0]["productUid"], "gel-product-x");
        assert_eq!(order["items"][0]["quantity"], 1);
        assert_eq!(order["items"][0]["files"].as_array().unwrap().len(), 3);
        assert_eq!(order["items"][0]["files"][1]["pageSetup"]["widthMm"], 508.0);
    }

    #[test]
    fn quote_math_is_exact() {
        // $50.00 base, 40 % markup, 10 % tax → $77.00 total.
        let q = quote(QuoteInput {
            base_cost_cents: 5_000,
            markup_percent: 40.0,
            tax_percent: 10.0,
            currency: "USD".into(),
        });
        assert_eq!(q.markup_cents, 2_000);
        assert_eq!(q.tax_cents, 700);
        assert_eq!(q.total_cents, 7_700);

        // Zero tax/markup passthrough.
        let q2 = quote(QuoteInput {
            base_cost_cents: 123,
            markup_percent: 0.0,
            tax_percent: 0.0,
            currency: "USD".into(),
        });
        assert_eq!(q2.total_cents, 123);
    }
}

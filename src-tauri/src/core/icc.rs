//! ICC colour management — structural boundary for the export engine
//! (blueprint §10 / MIGRATION Phase 9 item 4).
//!
//! The editor canvas is a WebGL sRGB workspace; print labs expect Adobe RGB /
//! CMYK. Full profile embedding needs a C library (`lcms2`) which the GNU /
//! w64devkit fallback toolchain cannot link. So this module owns the *contract*
//! and the pure fallback math:
//!
//! - [`ColorSpace`] normalises the export `colorMode` string ("rgb" | "cmyk"
//!   | "adobeRgb") into a target working space.
//! - [`workspace_to_output`] converts one sRGB pixel to the output space.
//!   sRGB→sRGB is identity; sRGB→Adobe RGB uses the well-known 3×3 linear
//!   matrix (done in linear light with sRGB gamma round-trips); CMYK is not
//!   approximated — it returns [`Err`] so the caller flags the job instead of
//!   shipping a wrong colour, until the `lcms2`-gated path (or the Phase 5
//!   `printpdf` profile embed) lands.
//!
//! The real profile path is gated behind Cargo feature `lcms2` (off by
//! default); when enabled, `profile_to_profile` will delegate to
//! `lcms2::transform::*` with the intent map below. Nothing in `core/export.rs`
//! changes — it calls [`workspace_to_output`] per rendered pixel and embeds
//! the profile named by [`default_profile`].

/// Output colour spaces the export pipeline can target.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ColorSpace {
    /// sRGB (webview/editor workspace) — identity path.
    Srgb,
    /// Adobe RGB (1998) — wide-gamut photo-print target.
    AdobeRgb,
    /// CMYK — offset lab target. Requires real profiling (lcms2/printpdf);
    /// the fallback refuses rather than approximate.
    Cmyk,
}

impl ColorSpace {
    /// Normalise the export input string ("rgb"/"cmyk"/"adobeRgb"/…).
    /// Unknown values fall back to sRGB (the export callers default to it),
    /// mirroring the Electron shell's permissive parse.
    pub fn parse(s: &str) -> ColorSpace {
        let s = s.trim().to_ascii_lowercase();
        match s.as_str() {
            "cmyk" | "cmyk_tiff" => ColorSpace::Cmyk,
            "adobe" | "adobe_rgb" | "adobergb" | "adobergb(1998)" => ColorSpace::AdobeRgb,
            _ => ColorSpace::Srgb,
        }
    }
}

/// Named ICC profile descriptor the export bundler embeds (Phase 5 wiring
/// point: `core/export.rs` writes the profile bytes named here next to the
/// page raster; the lcms2 feature fills the *conversion*).
#[derive(Debug, Clone)]
pub struct IccProfileRef {
    /// Canonical ICC profile file name inside the bundle (e.g. `sRGB.icc`).
    pub name: &'static str,
    /// Human-readable description (shown in export settings).
    pub description: &'static str,
}

pub fn default_profile(space: ColorSpace) -> IccProfileRef {
    match space {
        ColorSpace::Srgb => IccProfileRef {
            name: "sRGB IEC61966-2.1.icc",
            description: "sRGB IEC61966-2.1",
        },
        ColorSpace::AdobeRgb => IccProfileRef {
            name: "AdobeRGB1998.icc",
            description: "Adobe RGB (1998)",
        },
        ColorSpace::Cmyk => IccProfileRef {
            name: "CoatedFOGRA39.icc",
            description: "Coated FOGRA39 (ISO 12647-2)",
        },
    }
}

/// Rendering intent map (lcms2 `Intent` when the feature is on).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Intent {
    Perceptual,
    RelativeColorimetric,
    Saturation,
    AbsoluteColorimetric,
}

pub fn default_intent(space: ColorSpace) -> Intent {
    match space {
        ColorSpace::Cmyk => Intent::RelativeColorimetric,
        _ => Intent::Perceptual,
    }
}

// ---------------------------------------------------------------------------
// Pure fallback math (sRGB ↔ linear light, Adobe RGB matrix) — unit-tested.
// ---------------------------------------------------------------------------

/// sRGB gamma: encoded 0..1 → linear light 0..1 (IEC 61966-2.1).
pub fn srgb_to_linear(c: f32) -> f32 {
    if c <= 0.04045 {
        c / 12.92
    } else {
        ((c + 0.055) / 1.055).powf(2.4)
    }
}

/// Linear light 0..1 → sRGB encoded 0..1.
pub fn linear_to_srgb(c: f32) -> f32 {
    if c <= 0.003_130_8 {
        c * 12.92
    } else {
        1.055 * c.powf(1.0 / 2.4) - 0.055
    }
}

/// Linear-light transform sRGB D65 → Adobe RGB (1998) D65, coefficients from
/// the ICC AdobeRGB1998 matrix. Input/output are *linear* RGB (gamma applied
/// by the caller), each channel 0..1.
pub const SRGB_TO_ADOBE_RGB: [[f32; 3]; 3] = [
    [0.715_158_9, 0.284_841_1, 0.0],
    [0.0, 1.0, 0.0],
    [0.000_205_7, 0.000_205_7, 0.999_588_6],
];

fn apply_matrix(m: &[[f32; 3]; 3], rgb: [f32; 3]) -> [f32; 3] {
    [
        m[0][0] * rgb[0] + m[0][1] * rgb[1] + m[0][2] * rgb[2],
        m[1][0] * rgb[0] + m[1][1] * rgb[1] + m[1][2] * rgb[2],
        m[2][0] * rgb[0] + m[2][1] * rgb[1] + m[2][2] * rgb[2],
    ]
}

/// Convert a single sRGB-encoded pixel (each channel 0..1) to the output
/// space. Errors mean "needs the real profiler" — never a silent wrong colour.
pub fn workspace_to_output(pixel: [f32; 3], to: ColorSpace) -> Result<[f32; 3], String> {
    match to {
        ColorSpace::Srgb => Ok(pixel),
        ColorSpace::AdobeRgb => {
            let lin = [
                srgb_to_linear(pixel[0]),
                srgb_to_linear(pixel[1]),
                srgb_to_linear(pixel[2]),
            ];
            let out = apply_matrix(&SRGB_TO_ADOBE_RGB, lin);
            Ok([
                linear_to_srgb(out[0].clamp(0.0, 1.0)),
                linear_to_srgb(out[1].clamp(0.0, 1.0)),
                linear_to_srgb(out[2].clamp(0.0, 1.0)),
            ])
        }
        ColorSpace::Cmyk => Err(
            "CMYK conversion requires the lcms2-gated profile path (Cargo feature `lcms2`); \
             refusing to approximate a lab target from an sRGB workspace"
                .to_string(),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_color_mode_aliases() {
        assert_eq!(ColorSpace::parse("rgb"), ColorSpace::Srgb);
        assert_eq!(ColorSpace::parse("cmyk"), ColorSpace::Cmyk);
        assert_eq!(ColorSpace::parse("adobeRgb"), ColorSpace::AdobeRgb);
        assert_eq!(ColorSpace::parse("Adobe RGB (1998)"), ColorSpace::Srgb); // unknown → sRGB
        assert_eq!(ColorSpace::parse(""), ColorSpace::Srgb);
    }

    #[test]
    fn srgb_gamma_round_trips() {
        for c in [0.0f32, 0.003, 0.04045, 0.2, 0.5, 0.8, 1.0] {
            let back = linear_to_srgb(srgb_to_linear(c));
            assert!((back - c).abs() < 1e-4, "gamma round-trip failed at {c}");
        }
        // Known values (IEC 61966-2.1): 0.5 → ~0.2140 linear.
        assert!((srgb_to_linear(0.5) - 0.214_041).abs() < 1e-5);
    }

    #[test]
    fn adobe_matrix_is_white_preserving() {
        // Pure white linear stays white in Adobe RGB.
        let out = apply_matrix(&SRGB_TO_ADOBE_RGB, [1.0, 1.0, 1.0]);
        for (i, c) in out.iter().enumerate() {
            assert!((c - 1.0).abs() < 1e-3, "white channel {i} drifted: {c}");
        }
    }

    #[test]
    fn cmyk_refuses_without_profiler() {
        assert!(workspace_to_output([0.5, 0.5, 0.5], ColorSpace::Cmyk).is_err());
        assert_eq!(
            workspace_to_output([0.5, 0.5, 0.5], ColorSpace::Srgb).unwrap(),
            [0.5, 0.5, 0.5]
        );
    }
}

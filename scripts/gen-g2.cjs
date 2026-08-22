/** Part 2: dividers, swashes, monogram, heart, flourish. */
const { polar, leaf, blossom } = require("./gen-helpers.cjs");

function build() {
  const G = [];

  {
    const p = [];
    p.push({ d: "M8 30 H96", mode: "stroke" });
    p.push({ d: "M144 30 H232", mode: "stroke" });
    p.push({ d: "M120 30 C110 22 98 22 92 30 C98 38 110 38 120 30 Z", mode: "fill" });
    p.push({ d: "M100 30 C100 40 96 46 88 48 C82 46 78 40 80 32 C82 26 90 24 96 28", mode: "stroke" });
    p.push({ d: "M140 30 C140 20 144 14 152 12 C158 14 162 20 160 28 C158 34 150 36 144 32", mode: "stroke" });
    p.push({ d: "M120 22 a4 4 0 1 1 8 0 a4 4 0 1 1 -8 0 Z", mode: "fill" });
    p.push({ d: "M120 38 a4 4 0 1 1 8 0 a4 4 0 1 1 -8 0 Z", mode: "fill" });
    G.push({ id: "divider_scroll", name: "Scroll divider", w: 240, h: 60, paths: p });
  }

  {
    const p = [];
    p.push({ d: "M10 30 C50 14 90 14 112 30", mode: "stroke" });
    p.push({ d: "M128 30 C150 14 190 14 230 30", mode: "stroke" });
    p.push({ d: leaf(50, 22, -50, 22, 7), mode: "fill" });
    p.push({ d: leaf(74, 18, -40, 20, 6), mode: "fill" });
    p.push({ d: leaf(168, 18, -140, 20, 6), mode: "fill" });
    p.push({ d: leaf(192, 22, -130, 22, 7), mode: "fill" });
    for (const bp of blossom(120, 28, 10)) p.push({ d: bp, mode: "fill" });
    G.push({ id: "divider_floral", name: "Floral divider", w: 240, h: 60, paths: p });
  }

  {
    const p = [];
    p.push({ d: "M60 8 a52 52 0 1 1 0 104 a52 52 0 1 1 0 -104 Z", mode: "stroke" });
    p.push({ d: "M60 18 a42 42 0 1 1 0 84 a42 42 0 1 1 0 -84 Z", mode: "stroke" });
    for (let i = 0; i < 4; i++) {
      const [dx, dy] = polar(60, 60, 48, i * 90 + 45);
      p.push({
        d: `M${(dx - 4).toFixed(1)} ${dy.toFixed(1)} L${dx.toFixed(1)} ${(dy - 4).toFixed(1)} L${(dx + 4).toFixed(1)} ${dy.toFixed(1)} L${dx.toFixed(1)} ${(dy + 4).toFixed(1)} Z`,
        mode: "fill",
      });
    }
    G.push({ id: "monogram_luxe", name: "Monogram frame", w: 120, h: 120, paths: p });
  }

  {
    const p = [];
    p.push({ d: "M6 24 C40 6 70 8 96 22 C112 30 126 32 154 26", mode: "stroke" });
    p.push({ d: "M96 22 C92 12 82 8 70 12 C66 14 66 20 70 24 C76 30 88 28 90 20", mode: "stroke" });
    p.push({ d: "M110 24 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z", mode: "fill" });
    p.push({ d: "M124 25 a2.5 2.5 0 1 1 5 0 a2.5 2.5 0 1 1 -5 0 Z", mode: "fill" });
    G.push({ id: "swash_l", name: "Calligraphic swashes", w: 160, h: 40, paths: p });
  }

  {
    const p = [];
    p.push({ d: "M154 24 C120 6 90 8 64 22 C48 30 34 32 6 26", mode: "stroke" });
    p.push({ d: "M64 22 C68 12 78 8 90 12 C94 14 94 20 90 24 C84 30 72 28 70 20", mode: "stroke" });
    p.push({ d: "M50 24 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z", mode: "fill" });
    p.push({ d: "M36 25 a2.5 2.5 0 1 1 5 0 a2.5 2.5 0 1 1 -5 0 Z", mode: "fill" });
    G.push({ id: "swash_r", name: "Swashes (mirror)", w: 160, h: 40, paths: p });
  }

  {
    const p = [];
    p.push({ d: "M6 30 C46 8 86 8 112 24 C138 40 178 40 214 18", mode: "stroke" });
    p.push({ d: "M112 24 C104 12 88 6 74 10 C66 13 64 20 70 25 C80 32 94 30 96 20", mode: "stroke" });
    p.push({ d: "M112 24 C120 36 136 42 150 38 C158 35 160 28 154 23 C144 16 130 18 128 28", mode: "stroke" });
    p.push({ d: "M126 24 a3.5 3.5 0 1 1 7 0 a3.5 3.5 0 1 1 -7 0 Z", mode: "fill" });
    G.push({ id: "flourish", name: "Grand flourish", w: 220, h: 60, paths: p });
  }

  {
    const p = [];
    p.push({ d: "M70 108 C30 84 6 62 6 36 C6 18 18 8 32 8 C44 8 56 16 70 34 C84 16 96 8 108 8 C122 8 134 18 134 36 C134 62 110 84 70 108 Z", mode: "stroke" });
    p.push({ d: "M70 40 C60 34 48 32 40 36 C44 44 56 48 66 46", mode: "stroke" });
    p.push({ d: "M70 40 C80 34 92 32 100 36 C96 44 84 48 74 46", mode: "stroke" });
    p.push({ d: leaf(24, 20, -60, 16, 6), mode: "fill" });
    p.push({ d: leaf(116, 20, -120, 16, 6), mode: "fill" });
    G.push({ id: "heart_vine", name: "Heart with vines", w: 140, h: 120, paths: p });
  }

  return G;
}

module.exports = { build };

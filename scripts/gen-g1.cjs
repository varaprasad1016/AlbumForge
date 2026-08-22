/** Part 1: ornate corners, wreaths, mandala, medallion, frames. */
const { polar, leaf, blossom } = require("./gen-helpers.cjs");

function build() {
  const G = [];

  {
    const p = [];
    p.push({ d: "M14 120 C14 56 56 14 120 14", mode: "stroke" });
    p.push({ d: "M36 120 C36 70 70 36 120 36", mode: "stroke" });
    p.push({ d: "M22 116 C16 112 14 104 14 96 C14 90 18 86 24 86 C28 86 30 89 29 92", mode: "stroke" });
    p.push({ d: "M116 22 C112 16 104 14 96 14 C90 14 86 18 86 24 C86 28 89 30 92 29", mode: "stroke" });
    p.push({ d: "M50 50 L58 50 L54 58 Z", mode: "fill" });
    p.push({ d: "M64 50 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z", mode: "fill" });
    p.push({ d: "M50 64 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z", mode: "fill" });
    G.push({ id: "corner_filigree", name: "Ornate corner", w: 120, h: 120, paths: p });
  }

  {
    const p = [];
    p.push({ d: "M8 140 C8 62 62 8 140 8", mode: "stroke" });
    p.push({ d: leaf(46, 96, -45, 34, 9), mode: "fill" });
    p.push({ d: leaf(76, 66, -45, 34, 9), mode: "fill" });
    p.push({ d: leaf(104, 38, -45, 30, 8), mode: "fill" });
    p.push({ d: leaf(20, 118, -135, 26, 7), mode: "fill" });
    for (const bp of blossom(112, 28, 9)) p.push({ d: bp, mode: "fill" });
    for (const bp of blossom(30, 110, 7)) p.push({ d: bp, mode: "fill" });
    G.push({ id: "corner_floral", name: "Floral corner", w: 140, h: 140, paths: p });
  }

  {
    const p = [];
    p.push({ d: "M80 20 a60 60 0 1 1 0 120 a60 60 0 1 1 0 -120 Z", mode: "stroke" });
    for (let i = 0; i < 24; i++) {
      const [cx, cy] = polar(80, 80, 64, i * 15);
      p.push({ d: leaf(cx, cy, i * 15, 20, 7), mode: "fill" });
    }
    for (let i = 0; i < 12; i++) {
      const [bx, by] = polar(80, 80, 52, i * 30 + 15);
      p.push({ d: `M${bx} ${by} a3.5 3.5 0 1 1 7 0 a3.5 3.5 0 1 1 -7 0 Z`, mode: "fill" });
    }
    G.push({ id: "wreath", name: "Laurel wreath", w: 160, h: 160, paths: p });
  }

  {
    const p = [];
    p.push({ d: "M80 22 a58 58 0 1 1 0 116 a58 58 0 1 1 0 -116 Z", mode: "stroke" });
    for (let i = 0; i < 12; i++) {
      const [cx, cy] = polar(80, 80, 64, i * 30);
      p.push({ d: leaf(cx, cy, i * 30, 18, 6), mode: "fill" });
    }
    for (let i = 0; i < 6; i++) {
      const [cx, cy] = polar(80, 80, 52, i * 60 + 30);
      for (const bp of blossom(cx, cy, 7)) p.push({ d: bp, mode: "fill" });
    }
    for (const bp of blossom(80, 80, 9)) p.push({ d: bp, mode: "fill" });
    G.push({ id: "wreath_floral", name: "Floral wreath", w: 160, h: 160, paths: p });
  }

  {
    const p = [];
    p.push({ d: "M80 4 a76 76 0 1 1 0 152 a76 76 0 1 1 0 -152 Z", mode: "stroke" });
    p.push({ d: "M80 16 a64 64 0 1 1 0 128 a64 64 0 1 1 0 -128 Z", mode: "stroke" });
    for (let i = 0; i < 12; i++) {
      const [x1, y1] = polar(80, 80, 28, i * 30 - 7);
      const [x2, y2] = polar(80, 80, 28, i * 30 + 7);
      const [tx, ty] = polar(80, 80, 74, i * 30);
      const [ix, iy] = polar(80, 80, 20, i * 30);
      p.push({
        d: `M${x1.toFixed(1)} ${y1.toFixed(1)} Q${(tx - 10).toFixed(1)} ${(ty - 10).toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)} Q${(tx + 10).toFixed(1)} ${(ty + 10).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)} Q${ix.toFixed(1)} ${iy.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)} Z`,
        mode: "fill",
      });
    }
    for (let i = 0; i < 12; i++) {
      const [dx, dy] = polar(80, 80, 86, i * 30);
      p.push({ d: `M${dx.toFixed(1)} ${dy.toFixed(1)} a2 2 0 1 1 4 0 a2 2 0 1 1 -4 0 Z`, mode: "fill" });
    }
    p.push({ d: "M80 70 a10 10 0 1 1 0 20 a10 10 0 1 1 0 -20 Z", mode: "stroke" });
    G.push({ id: "mandala", name: "Mandala", w: 160, h: 160, paths: p });
  }

  {
    const p = [];
    p.push({ d: "M70 12 a58 58 0 1 1 0 116 a58 58 0 1 1 0 -116 Z", mode: "stroke" });
    p.push({ d: "M70 22 a48 48 0 1 1 0 96 a48 48 0 1 1 0 -96 Z", mode: "stroke" });
    for (let i = 0; i < 8; i++) {
      const [x1, y1] = polar(70, 70, 24, i * 45 - 8);
      const [x2, y2] = polar(70, 70, 24, i * 45 + 8);
      const [tx, ty] = polar(70, 70, 60, i * 45);
      p.push({
        d: `M${x1.toFixed(1)} ${y1.toFixed(1)} Q${(tx - 6).toFixed(1)} ${(ty - 6).toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)} Q${(tx + 6).toFixed(1)} ${(ty + 6).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)} Z`,
        mode: "fill",
      });
    }
    for (let i = 0; i < 4; i++) {
      const [dx, dy] = polar(70, 70, 35, i * 90 + 45);
      p.push({
        d: `M${(dx - 3.5).toFixed(1)} ${dy.toFixed(1)} L${dx.toFixed(1)} ${(dy - 3.5).toFixed(1)} L${(dx + 3.5).toFixed(1)} ${dy.toFixed(1)} L${dx.toFixed(1)} ${(dy + 3.5).toFixed(1)} Z`,
        mode: "fill",
      });
    }
    G.push({ id: "medallion", name: "Medallion", w: 140, h: 140, paths: p });
  }

  {
    const p = [];
    p.push({ d: "M70 8 a62 42 0 1 1 0 84 a62 42 0 1 1 0 -84 Z", mode: "stroke" });
    p.push({ d: "M70 20 a50 30 0 1 1 0 60 a50 30 0 1 1 0 -60 Z", mode: "stroke" });
    G.push({ id: "frame_oval", name: "Oval frame", w: 140, h: 100, paths: p });
  }

  {
    const p = [];
    p.push({ d: "M6 6 H114 V84 H6 Z", mode: "stroke" });
    p.push({ d: "M18 18 H102 V72 H18 Z", mode: "stroke" });
    p.push({ d: "M60 6 V18 M60 72 V84 M6 45 H18 M102 45 H114", mode: "stroke" });
    G.push({ id: "frame_rect", name: "Classic frame", w: 120, h: 90, paths: p });
  }

  return G;
}

module.exports = { build };

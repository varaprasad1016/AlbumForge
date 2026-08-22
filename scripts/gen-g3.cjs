/** Part 3: Indian wedding ornaments — lantern, peacock, arch, paisley, banners. */
const { polar } = require("./gen-helpers.cjs");

function build() {
  const G = [];

  {
    const p = [];
    p.push({ d: "M52 4 C52 0 64 0 64 4", mode: "stroke" });
    p.push({ d: "M58 8 a3.5 3.5 0 1 1 0 7 a3.5 3.5 0 1 1 0 -7 Z", mode: "fill" });
    p.push({ d: "M36 22 Q58 4 80 22 L80 26 Q58 44 36 26 Z", mode: "fill" });
    p.push({ d: "M30 36 L86 36 L82 98 Q58 112 34 98 Z", mode: "stroke" });
    p.push({ d: "M46 46 Q58 54 70 46", mode: "stroke" });
    p.push({ d: "M46 66 Q58 74 70 66", mode: "stroke" });
    p.push({ d: "M46 86 Q58 94 70 86", mode: "stroke" });
    p.push({ d: "M58 46 V94", mode: "stroke" });
    p.push({ d: "M50 104 L58 122 L66 104", mode: "stroke" });
    p.push({ d: "M58 122 L58 130", mode: "stroke" });
    p.push({ d: "M53 134 a5 5 0 1 1 10 0 a5 5 0 1 1 -10 0 Z", mode: "fill" });
    G.push({ id: "lantern", name: "Hanging lantern", w: 116, h: 140, paths: p });
  }

  {
    const p = [];
    p.push({ d: "M80 128 C66 128 58 118 62 108 C66 100 76 98 80 104 C84 98 94 100 98 108 C102 118 94 128 80 128 Z", mode: "fill" });
    p.push({ d: "M80 104 L80 96", mode: "stroke" });
    p.push({ d: "M76 96 a4 4 0 1 1 8 0 a4 4 0 1 1 -8 0 Z", mode: "fill" });
    for (let i = -4; i <= 4; i++) {
      const ang = 90 + i * 14;
      const [x2, y2] = polar(80, 96, 88, ang);
      p.push({
        d: `M80 96 Q${((80 + x2) / 2 + i * 4).toFixed(1)} 18 ${x2.toFixed(1)} ${y2.toFixed(1)}`,
        mode: "stroke",
      });
      const [ex, ey] = polar(80, 96, 64, ang);
      p.push({ d: `M${(ex - 4).toFixed(1)} ${ey.toFixed(1)} a4 4 0 1 1 8 0 a4 4 0 1 1 -8 0 Z`, mode: "fill" });
    }
    G.push({ id: "peacock", name: "Peacock", w: 160, h: 140, paths: p });
  }

  {
    const p = [];
    p.push({ d: "M22 178 V78 C22 34 46 20 70 20 C94 20 118 34 118 78 V178", mode: "stroke" });
    p.push({ d: "M36 178 V80 C36 44 54 34 70 34 C86 34 104 44 104 80 V178", mode: "stroke" });
    for (let i = 0; i < 5; i++) {
      const x0 = 40 + i * 12;
      p.push({ d: `M${x0} 52 a6 6 0 0 1 12 0`, mode: "stroke" });
    }
    p.push({ d: "M26 178 V170 H114 V178", mode: "stroke" });
    p.push({ d: "M32 160 L38 160 L35 154 Z", mode: "fill" });
    p.push({ d: "M108 160 L102 160 L105 154 Z", mode: "fill" });
    G.push({ id: "arch", name: "Ornate arch", w: 140, h: 180, paths: p });
  }

  {
    const p = [];
    p.push({ d: "M50 8 C78 8 94 28 94 62 C94 98 74 128 46 130 C30 131 18 120 18 104 C18 88 30 80 44 86 C58 92 62 106 52 114 C44 120 34 114 38 102", mode: "stroke" });
    p.push({ d: "M46 26 C62 26 74 40 74 62 C74 86 62 104 48 110", mode: "stroke" });
    p.push({ d: "M60 44 a4 4 0 1 1 8 0 a4 4 0 1 1 -8 0 Z", mode: "fill" });
    p.push({ d: "M52 70 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z", mode: "fill" });
    p.push({ d: "M36 108 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z", mode: "fill" });
    G.push({ id: "paisley", name: "Paisley", w: 100, h: 140, paths: p });
  }

  {
    const p = [];
    p.push({ d: "M10 22 H230 L222 34 L230 46 H10 L18 34 Z", mode: "fill" });
    for (let i = 0; i < 7; i++) {
      const x = 36 + i * 28;
      p.push({ d: `M${x} 10 a6 6 0 0 1 12 0`, mode: "stroke" });
    }
    p.push({ d: "M28 22 V46 M44 22 V46 M196 22 V46 M212 22 V46", mode: "stroke" });
    G.push({ id: "banner_scallop", name: "Scalloped banner", w: 240, h: 56, paths: p });
  }

  {
    const p = [];
    p.push({ d: "M8 14 H86 M114 14 H192", mode: "stroke" });
    p.push({ d: "M100 6 L106 14 L100 22 L94 14 Z", mode: "fill" });
    p.push({ d: "M114 14 L116 16 L114 18 L112 16 Z", mode: "fill" });
    p.push({ d: "M86 14 L88 16 L86 18 L84 16 Z", mode: "fill" });
    G.push({ id: "divider_diamond", name: "Diamond divider", w: 200, h: 28, paths: p });
  }

  {
    const p = [];
    p.push({ d: "M40 12 a28 28 0 1 1 0 56 a28 28 0 1 1 0 -56 Z", mode: "stroke" });
    p.push({ d: "M40 24 a16 16 0 1 1 0 32 a16 16 0 1 1 0 -32 Z", mode: "stroke" });
    p.push({ d: "M40 4 V12 M40 68 V76 M12 40 H20 M60 40 H68", mode: "stroke" });
    G.push({ id: "ring_seal", name: "Seal ring", w: 80, h: 80, paths: p });
  }

  return G;
}

module.exports = { build };

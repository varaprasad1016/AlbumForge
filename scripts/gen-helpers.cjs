/** Shared geometry helpers for the design generator. */
const rad = (d) => (d * Math.PI) / 180;
const fmt = (n) => Math.round(n * 100) / 100;

function polar(cx, cy, r, deg) {
  return [cx + r * Math.cos(rad(deg)), cy + r * Math.sin(rad(deg))];
}

function leaf(cx, cy, deg, len, wid) {
  const [tx, ty] = polar(cx, cy, len, deg);
  const [wx1, wy1] = polar(cx, cy, wid, deg + 90);
  const [wx2, wy2] = polar(cx, cy, wid, deg - 90);
  const [cx1, cy1] = polar(cx, cy, len * 0.45, deg + 55);
  const [cx2, cy2] = polar(cx, cy, len * 0.45, deg - 55);
  return `M${fmt(wx1)} ${fmt(wy1)} Q${fmt(cx1)} ${fmt(cy1)} ${fmt(tx)} ${fmt(ty)} Q${fmt(cx2)} ${fmt(cy2)} ${fmt(wx2)} ${fmt(wy2)} Z`;
}

function blossom(cx, cy, r) {
  const out = [];
  for (let i = 0; i < 5; i++) {
    const [px, py] = polar(cx, cy, r, i * 72);
    out.push(`M${fmt(px - 3)} ${fmt(py)} a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z`);
  }
  out.push(`M${fmt(cx - 2)} ${fmt(cy)} a2 2 0 1 1 4 0 a2 2 0 1 1 -4 0 Z`);
  return out;
}

module.exports = { rad, fmt, polar, leaf, blossom };

/* =====================================================================
   art.js — every graphic in this game is drawn in code.
   No image files, nothing to download, nothing to go missing.
   ===================================================================== */

/* Deterministic pseudo-random, so a suspect always looks the same. */
function rng(seed) {
  let s = seed * 2654435761 % 2147483647;
  return () => (s = s * 16807 % 2147483647) / 2147483647;
}

const SKIN  = ['#d9a878', '#b47c52', '#8a5a39', '#e8c49a', '#6f4529', '#c08e62'];
const COAT  = ['#2b3444', '#3a2e3f', '#243a3a', '#402e26', '#1f2c3a', '#39323f'];
const HAT   = ['#151a24', '#1d1620', '#101d1d', '#201611', '#0d1620'];

/**
 * A noir mugshot: hard rim light from the left, heavy shadow,
 * grading lines behind, numbered placard below.
 */
export function portrait(suspect, size = 120) {
  const r = rng(suspect.suspect_id * 97 + 13);
  const skin = SKIN[Math.floor(r() * SKIN.length)];
  const coat = COAT[Math.floor(r() * COAT.length)];
  const hat  = HAT[Math.floor(r() * HAT.length)];
  const hasHat = r() > 0.45;
  const hasGlasses = r() > 0.68;
  const hair = Math.floor(r() * 3);
  const jaw = 19 + r() * 2.4;          // a little variation in face width
  const collarUp = r() > 0.5;
  const uid = 'p' + suspect.suspect_id;

  return `
<svg viewBox="0 0 100 120" width="${size}" height="${size * 1.2}" class="portrait" role="img"
     aria-label="Mugshot of ${esc(suspect.name)}">
  <defs>
    <linearGradient id="${uid}bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2a3140"/><stop offset="1" stop-color="#121722"/>
    </linearGradient>
    <linearGradient id="${uid}rim" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ffffff" stop-opacity=".30"/>
      <stop offset=".45" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="${uid}clip"><rect x="0" y="0" width="100" height="120" rx="4"/></clipPath>
  </defs>
  <g clip-path="url(#${uid}clip)">
    <rect width="100" height="120" fill="url(#${uid}bg)"/>
    ${[0,1,2,3,4].map(i => `<line x1="0" y1="${16+i*18}" x2="100" y2="${16+i*18}"
        stroke="#ffffff" stroke-opacity=".05" stroke-width="1"/>`).join('')}
    <text x="4" y="13" font-size="7" fill="#ffffff" fill-opacity=".22"
          font-family="ui-monospace,monospace">ASH-${String(suspect.suspect_id).padStart(3,'0')}</text>

    <!-- shoulders -->
    <path d="M12 120 Q14 88 34 80 L66 80 Q86 88 88 120 Z" fill="${coat}"/>
    ${collarUp ? `<path d="M34 80 L50 98 L66 80 L60 78 L50 88 L40 78 Z" fill="#0c111a" opacity=".65"/>`
               : `<path d="M38 81 L50 94 L62 81" fill="none" stroke="#0c111a" stroke-opacity=".6" stroke-width="2"/>`}
    <!-- neck -->
    <rect x="43" y="68" width="14" height="16" fill="${skin}" opacity=".85"/>
    <!-- head -->
    <ellipse cx="50" cy="52" rx="${jaw.toFixed(1)}" ry="24" fill="${skin}"/>
    <path d="M50 28 a${jaw.toFixed(1)} 24 0 0 0 0 48 Z" fill="#000" opacity=".16"/>
    <!-- ears -->
    <ellipse cx="29" cy="54" rx="3.4" ry="5" fill="${skin}"/>
    <ellipse cx="71" cy="54" rx="3.4" ry="5" fill="${skin}"/>
    ${hasHat ? `
      <path d="M26 36 Q50 18 74 36 L74 38 L26 38 Z" fill="${hat}"/>
      <rect x="18" y="36" width="64" height="4.5" rx="2.2" fill="${hat}"/>
      <rect x="26" y="33" width="48" height="3" fill="#000" opacity=".35"/>`
    : [
        `<path d="M30 42 Q50 24 70 42 Q58 34 50 36 Q40 34 30 42 Z" fill="${hat}"/>`,
        `<path d="M29 44 Q50 20 71 44 Q66 32 50 31 Q34 32 29 44 Z" fill="${hat}"/>`,
        `<path d="M28 47 Q29 24 50 23 Q71 24 72 47 Q70 33 60 30 Q50 27 40 30 Q30 33 28 47 Z" fill="${hat}"/>`
      ][hair]}
    <!-- eyes -->
    <ellipse cx="42" cy="51" rx="3" ry="${hasGlasses ? 2.4 : 1.9}" fill="#10141c"/>
    <ellipse cx="58" cy="51" rx="3" ry="${hasGlasses ? 2.4 : 1.9}" fill="#10141c"/>
    ${hasGlasses ? `
      <circle cx="42" cy="51" r="6.5" fill="none" stroke="#0e1219" stroke-width="1.6"/>
      <circle cx="58" cy="51" r="6.5" fill="none" stroke="#0e1219" stroke-width="1.6"/>
      <line x1="48.5" y1="51" x2="51.5" y2="51" stroke="#0e1219" stroke-width="1.6"/>` : ''}
    <!-- brows -->
    <path d="M37 45 q5 -2.5 10 0" stroke="#10141c" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <path d="M53 45 q5 -2.5 10 0" stroke="#10141c" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <!-- nose + mouth -->
    <path d="M50 53 L47 61 q3 1.6 6 0" stroke="#000" stroke-opacity=".35" stroke-width="1.3" fill="none"/>
    <!-- nobody smiles for a mugshot -->
    <path d="M43.5 66.5 q6.5 -2 13 0" stroke="#3a2420" stroke-width="1.8" fill="none"
          stroke-linecap="round"/>
    <!-- rim light -->
    <rect width="100" height="120" fill="url(#${uid}rim)"/>
    <!-- placard -->
    <rect x="22" y="104" width="56" height="12" rx="1.5" fill="#e9e3d4"/>
    <text x="50" y="112.8" text-anchor="middle" font-size="7.4" fill="#1a1a1a"
          font-family="ui-monospace,monospace" letter-spacing=".5">
      ${esc(lastName(suspect.name).toUpperCase()).slice(0, 11)}
    </text>
  </g>
  <rect x=".5" y=".5" width="99" height="119" rx="4" fill="none"
        stroke="#ffffff" stroke-opacity=".14"/>
</svg>`;
}

function lastName(n) { const p = String(n).split(' '); return p[p.length - 1]; }

export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ------------------------------------------------------------------ */
/* The Ashvale skyline, drawn once behind everything                   */
/* ------------------------------------------------------------------ */

export function skyline() {
  const r = rng(7);
  let far = '', near = '', windows = '';
  let x = 0;
  while (x < 1440) {
    const w = 38 + Math.floor(r() * 70);
    const h = 70 + Math.floor(r() * 150);
    far += `<rect x="${x}" y="${320 - h}" width="${w}" height="${h}"/>`;
    x += w + 6;
  }
  x = -20;
  while (x < 1440) {
    const w = 50 + Math.floor(r() * 90);
    const h = 110 + Math.floor(r() * 180);
    const top = 320 - h;
    near += `<rect x="${x}" y="${top}" width="${w}" height="${h}"/>`;
    if (r() > 0.6) near += `<rect x="${x + w / 2 - 3}" y="${top - 26}" width="6" height="26"/>`;
    for (let wy = top + 12; wy < 312; wy += 16) {
      for (let wx = x + 8; wx < x + w - 8; wx += 14) {
        if (r() > 0.58) {
          windows += `<rect x="${wx}" y="${wy}" width="5" height="7" opacity="${(0.25 + r() * 0.65).toFixed(2)}"/>`;
        }
      }
    }
    x += w + 10;
  }
  return `
<svg viewBox="0 0 1440 320" preserveAspectRatio="xMidYMax slice" class="skyline" aria-hidden="true">
  <defs>
    <linearGradient id="skyglow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1b2740" stop-opacity="0"/>
      <stop offset="1" stop-color="#0a0e16" stop-opacity=".9"/>
    </linearGradient>
    <radialGradient id="moon" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="#ffe8b0" stop-opacity=".55"/>
      <stop offset="1" stop-color="#ffe8b0" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="1180" cy="78" r="130" fill="url(#moon)"/>
  <circle cx="1180" cy="78" r="26" fill="#f4e7c3" opacity=".5"/>
  <g fill="#131a28" opacity=".75">${far}</g>
  <g fill="#0b1018">${near}</g>
  <g fill="#ffd27a">${windows}</g>
  <rect width="1440" height="320" fill="url(#skyglow)"/>
</svg>`;
}

/* ------------------------------------------------------------------ */
/* Rain, on a canvas, cheap enough to leave running                    */
/* ------------------------------------------------------------------ */

export function startRain(canvas) {
  const ctx = canvas.getContext('2d');
  let drops = [], w = 0, h = 0, raf = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);

  function resize() {
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.min(220, Math.floor(w / 7));
    drops = Array.from({ length: n }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      len: 8 + Math.random() * 18, v: 380 + Math.random() * 520,
      a: 0.06 + Math.random() * 0.22
    }));
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = 'round';
    for (const d of drops) {
      d.y += d.v * dt; d.x += d.v * dt * 0.18;
      if (d.y > h) { d.y = -d.len; d.x = Math.random() * w; }
      if (d.x > w) d.x = -4;
      ctx.strokeStyle = `rgba(190,215,255,${d.a})`;
      ctx.lineWidth = d.len > 20 ? 1.3 : 0.8;
      ctx.beginPath(); ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - d.len * 0.18, d.y - d.len); ctx.stroke();
    }
    raf = requestAnimationFrame(frame);
  }

  resize();
  window.addEventListener('resize', resize);
  raf = requestAnimationFrame(frame);
  return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
}

/* ------------------------------------------------------------------ */
/* Case-file furniture                                                 */
/* ------------------------------------------------------------------ */

export function stamp(text, color = '#ff5a5a') {
  return `
<svg viewBox="0 0 260 90" class="stamp-svg" aria-hidden="true">
  <g transform="rotate(-9 130 45)" fill="none" stroke="${color}" stroke-opacity=".85">
    <rect x="8" y="10" width="244" height="70" rx="6" stroke-width="4"/>
    <rect x="17" y="19" width="226" height="52" rx="3" stroke-width="1.5"/>
    <text x="130" y="55" text-anchor="middle" fill="${color}" fill-opacity=".9"
          stroke="none" font-size="30" font-weight="800" letter-spacing="4"
          font-family="ui-monospace,monospace">${esc(text)}</text>
  </g>
</svg>`;
}

export function caseSeal(number, accent) {
  return `
<svg viewBox="0 0 120 120" class="seal" aria-hidden="true">
  <circle cx="60" cy="60" r="54" fill="none" stroke="${accent}" stroke-opacity=".5" stroke-width="2"/>
  <circle cx="60" cy="60" r="46" fill="none" stroke="${accent}" stroke-opacity=".3" stroke-width="1"
          stroke-dasharray="3 5"/>
  <circle cx="60" cy="60" r="34" fill="${accent}" fill-opacity=".10"/>
  <text x="60" y="54" text-anchor="middle" font-size="11" fill="${accent}" fill-opacity=".75"
        font-family="ui-monospace,monospace" letter-spacing="2">CASE</text>
  <text x="60" y="84" text-anchor="middle" font-size="36" font-weight="800" fill="${accent}"
        font-family="ui-monospace,monospace">${String(number).padStart(2, '0')}</text>
</svg>`;
}

export function progressRing(done, total, size = 42) {
  const pct = total ? done / total : 0;
  const r = 16, c = 2 * Math.PI * r;
  return `
<svg viewBox="0 0 40 40" width="${size}" height="${size}" class="ring" aria-hidden="true">
  <circle cx="20" cy="20" r="${r}" fill="none" stroke="currentColor" stroke-opacity=".15" stroke-width="3.5"/>
  <circle cx="20" cy="20" r="${r}" fill="none" stroke="currentColor" stroke-width="3.5"
          stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}"
          transform="rotate(-90 20 20)"/>
  <text x="20" y="24" text-anchor="middle" font-size="11" fill="currentColor"
        font-family="ui-monospace,monospace">${done}</text>
</svg>`;
}

/* A short string of evidence-board thread between two pins. */
export function thread(i) {
  const r = rng(i * 31 + 5);
  const sag = 10 + r() * 16;
  return `<svg viewBox="0 0 120 40" class="thread" aria-hidden="true">
    <path d="M4 8 Q60 ${8 + sag} 116 8" fill="none" stroke="#c8443c" stroke-opacity=".5" stroke-width="1.4"/>
    <circle cx="4" cy="8" r="3" fill="#c8443c" fill-opacity=".8"/>
    <circle cx="116" cy="8" r="3" fill="#c8443c" fill-opacity=".8"/>
  </svg>`;
}

export const ICON = {
  lock: `<svg viewBox="0 0 16 16" class="ico"><path d="M4 7V5a4 4 0 1 1 8 0v2h1v8H3V7h1zm2 0h4V5a2 2 0 1 0-4 0v2z" fill="currentColor"/></svg>`,
  tick: `<svg viewBox="0 0 16 16" class="ico"><path d="M2 8.5 6 12.5 14 4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  play: `<svg viewBox="0 0 16 16" class="ico"><path d="M4 2.5 13 8l-9 5.5z" fill="currentColor"/></svg>`,
  bulb: `<svg viewBox="0 0 16 16" class="ico"><path d="M8 1a5 5 0 0 0-3 9v2h6v-2a5 5 0 0 0-3-9zM6 13h4v1.5H6z" fill="currentColor"/></svg>`,
  book: `<svg viewBox="0 0 16 16" class="ico"><path d="M2 2h5a2 2 0 0 1 1 .5A2 2 0 0 1 9 2h5v11H9.5A1.5 1.5 0 0 0 8 14.5 1.5 1.5 0 0 0 6.5 13H2z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`,
  db:   `<svg viewBox="0 0 16 16" class="ico"><ellipse cx="8" cy="3.5" rx="5.5" ry="2.2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M2.5 3.5v9c0 1.2 2.5 2.2 5.5 2.2s5.5-1 5.5-2.2v-9" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M2.5 8c0 1.2 2.5 2.2 5.5 2.2s5.5-1 5.5-2.2" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>`,
  pin:  `<svg viewBox="0 0 16 16" class="ico"><path d="M8 1a4 4 0 0 1 4 4c0 3-4 10-4 10S4 8 4 5a4 4 0 0 1 4-4z" fill="currentColor"/><circle cx="8" cy="5" r="1.6" fill="#0b0e14"/></svg>`,
  sound:`<svg viewBox="0 0 16 16" class="ico"><path d="M3 6h3l3-3v10L6 10H3z" fill="currentColor"/><path d="M11 5.5a4 4 0 0 1 0 5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  mute: `<svg viewBox="0 0 16 16" class="ico"><path d="M3 6h3l3-3v10L6 10H3z" fill="currentColor"/><path d="M11 6l4 4m0-4l-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`
};

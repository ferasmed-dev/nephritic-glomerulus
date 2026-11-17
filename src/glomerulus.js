// Hand-drawn SVG glomerulus (schematic cross-section) and IF panel.
// renderGlomerulus() returns an SVG string; every pathological layer is a
// <g data-layer="..."> so the UI can highlight one step of the pathogenesis.

const CX = 200, CY = 182, R = 50;
const LOOPS = [[132, 124], [268, 124], [132, 240], [268, 240]];
const CAP = { rx: 188, ry: 170 };

const f1 = (n) => Math.round(n * 10) / 10;
const pol = (cx, cy, r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
const outward = ([x, y]) => Math.atan2(y - CY, x - CX);

function arcPath(cx, cy, r, a0, a1) {
  const [x0, y0] = pol(cx, cy, r, a0);
  const [x1, y1] = pol(cx, cy, r, a1);
  const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
  return `M${f1(x0)} ${f1(y0)} A${r} ${r} 0 ${large} 1 ${f1(x1)} ${f1(y1)}`;
}

function ellipseArcPoints(rx, ry, a0, a1, n = 60) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([CX + rx * Math.cos(a), CY + ry * Math.sin(a)]);
  }
  return pts;
}
const polyline = (pts) => 'M' + pts.map(([x, y]) => `${f1(x)} ${f1(y)}`).join(' L');

function antibody(x, y, color, rot = 0, s = 1) {
  return `<path d="M0 6 L0 0 L-4 -5 M0 0 L4 -5" transform="translate(${f1(x)} ${f1(y)}) rotate(${rot}) scale(${s})" stroke="${color}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
}

function neutrophil(x, y) {
  return `<g transform="translate(${f1(x)} ${f1(y)})"><circle r="7.5" fill="var(--g-neut-cyto)"/>` +
    `<circle cx="-2.6" cy="-1.5" r="2.4" fill="var(--g-neut)"/><circle cx="2.4" cy="-1.8" r="2.2" fill="var(--g-neut)"/><circle cx="0.2" cy="2.4" r="2.3" fill="var(--g-neut)"/></g>`;
}

// ---------------------------------------------------------------------------
function anatomy() {
  let s = '<g class="anat">';
  // Bowman's capsule + parietal epithelium
  s += `<ellipse cx="${CX}" cy="${CY}" rx="${CAP.rx}" ry="${CAP.ry}" fill="var(--g-bowman)" stroke="var(--g-capsule)" stroke-width="3"/>`;
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const x = CX + (CAP.rx - 4) * Math.cos(a), y = CY + (CAP.ry - 4) * Math.sin(a);
    const tang = (Math.atan2(CAP.ry * Math.cos(a), -CAP.rx * Math.sin(a)) * 180) / Math.PI;
    s += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="7" ry="2.2" transform="rotate(${f1(tang)} ${f1(x)} ${f1(y)})" fill="var(--g-capsule)"/>`;
  }
  // Mesangium: central body with stalks toward each loop
  s += `<g><circle cx="${CX}" cy="${CY}" r="40" fill="var(--g-mes)"/>`;
  for (const [x, y] of LOOPS) {
    const mx = CX + (x - CX) * 0.42, my = CY + (y - CY) * 0.42;
    const rot = (Math.atan2(y - CY, x - CX) * 180) / Math.PI;
    s += `<ellipse cx="${f1(mx)}" cy="${f1(my)}" rx="34" ry="20" transform="rotate(${f1(rot)} ${f1(mx)} ${f1(my)})" fill="var(--g-mes)"/>`;
  }
  s += `<circle cx="${CX - 12}" cy="${CY - 6}" r="4" fill="var(--g-nucleus)"/><circle cx="${CX + 13}" cy="${CY + 8}" r="4" fill="var(--g-nucleus)"/>`;
  s += '</g>';
  // Capillary loops
  LOOPS.forEach(([x, y], li) => {
    const out = outward([x, y]);
    s += `<circle cx="${x}" cy="${y}" r="${R - 3.5}" fill="var(--g-lumen)"/>`;
    // red cells
    s += `<ellipse cx="${x - 14}" cy="${y + 10}" rx="7" ry="4" fill="var(--g-rbc)" transform="rotate(${20 + li * 30} ${x - 14} ${y + 10})"/>`;
    s += `<ellipse cx="${x + 12}" cy="${y - 14}" rx="7" ry="4" fill="var(--g-rbc)" transform="rotate(${-30 + li * 25} ${x + 12} ${y - 14})"/>`;
    // endothelium (fenestrated)
    s += `<circle cx="${x}" cy="${y}" r="${R - 2}" fill="none" stroke="var(--g-endo)" stroke-width="2.6" stroke-dasharray="7 2.5"/>`;
    // GBM
    s += `<circle cx="${x}" cy="${y}" r="${R + 2}" fill="none" stroke="var(--g-gbm)" stroke-width="3.4"/>`;
    // podocyte foot processes + cell bodies on the urinary side
    for (let k = 0; k < 20; k++) {
      const a = (k / 20) * Math.PI * 2;
      const da = Math.abs(((a - out + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
      if (da > 2.2) continue; // the side facing the mesangium has no podocytes
      const [px, py] = pol(x, y, R + 6.5, a);
      s += `<circle cx="${f1(px)}" cy="${f1(py)}" r="3.6" fill="var(--g-podo)"/>`;
    }
    for (const d of [-0.55, 0.55]) {
      const [px, py] = pol(x, y, R + 15, out + d);
      const rot = ((out + d) * 180) / Math.PI + 90;
      s += `<ellipse cx="${f1(px)}" cy="${f1(py)}" rx="12" ry="7" transform="rotate(${f1(rot)} ${f1(px)} ${f1(py)})" fill="var(--g-podo)"/>`;
      s += `<circle cx="${f1(px)}" cy="${f1(py)}" r="3" fill="var(--g-nucleus)"/>`;
    }
  });
  s += '</g>';
  return s;
}

// ---------------------------------------------------------------------------
const DEP_COLOR = { IC: 'var(--g-dep-ic)', IgA: 'var(--g-dep-iga)', C3: 'var(--g-dep-c3)' };

function layer(name, title, inner) {
  return `<g data-layer="${name}" tabindex="-1"><title>${title}</title>${inner}</g>`;
}

function circulatingGlyphs(kind) {
  const [x, y] = LOOPS[0];
  let s = '';
  const spots = [[-18, -14], [6, -24], [-24, 12], [16, 16], [0, 2]];
  if (kind === 'ic' || kind === 'gdIgA1') {
    const col = kind === 'ic' ? 'var(--g-dep-ic)' : 'var(--g-dep-iga)';
    spots.forEach(([dx, dy], i) => {
      s += antibody(x + dx, y + dy, col, i * 40);
      s += `<circle cx="${f1(x + dx)}" cy="${f1(y + dy - 6)}" r="2.4" fill="${col}"/>`;
    });
  } else if (kind === 'antiGBM') {
    spots.forEach(([dx, dy], i) => { s += antibody(x + dx, y + dy, 'var(--g-dep-igg)', i * 55); });
  } else if (kind === 'anca') {
    s += neutrophil(x - 10, y - 6) + neutrophil(x + 14, y + 12);
    [[-22, -18], [-2, -22], [24, 0], [2, 22]].forEach(([dx, dy], i) => { s += antibody(x + dx, y + dy, 'var(--g-anca)', i * 70, 0.9); });
  } else if (kind === 'cryo') {
    spots.forEach(([dx, dy]) => { s += `<path d="M${x + dx} ${y + dy} l5 -3 l4 4 l-3 5 l-6 -1 z" fill="var(--g-cryo)" stroke="var(--g-cryo-edge)" stroke-width="1"/>`; });
  }
  return s;
}

/**
 * opts: { title: {layerKey: text}, crescent: {cellular, fibrous} in %, idPrefix }
 */
export function renderGlomerulus(entity, opts = {}) {
  const v = entity.visual;
  const T = opts.titles || {};
  const t = (k) => T[k] || k;
  let s = anatomy();
  const loopsSubset = LOOPS;

  if (entity.pathway && entity.pathway !== 'none') {
    let c = '';
    for (const [x, y] of [LOOPS[1], LOOPS[3]]) {
      const out = outward([x, y]);
      for (const d of [-1.2, -0.4, 0.5]) {
        const [px, py] = pol(x, y, R + 1, out + d + 0.9);
        c += `<path d="M${f1(px)} ${f1(py - 4)} l3 4 l-3 4 l-3 -4 z" fill="var(--g-dep-c3)" stroke="var(--g-c3-edge)" stroke-width="0.8"/>`;
      }
    }
    c += `<text x="${CX}" y="${CY + 4}" text-anchor="middle" class="g-tag">C3b</text>`;
    s += layer('complement', t('complement'), c);
  }

  if (v.mesangialProlif) {
    let c = `<circle cx="${CX}" cy="${CY}" r="47" fill="var(--g-mes)" opacity="0.9"/>`;
    [[-22, -18], [20, -20], [-26, 16], [24, 20], [0, -30], [2, 30], [-34, 0], [34, -2]].forEach(([dx, dy]) => {
      c += `<circle cx="${CX + dx}" cy="${CY + dy}" r="4.2" fill="var(--g-nucleus)"/>`;
    });
    s += layer('mesangialProlif', t('mesangialProlif'), c);
  }

  if (v.mesangialDeposits) {
    const col = DEP_COLOR[v.mesangialDeposits] || DEP_COLOR.IC;
    let c = '';
    [[-14, -22], [10, -26], [-28, -4], [26, 4], [-10, 22], [14, 26], [0, -8], [-4, 10], [22, -12]].forEach(([dx, dy], i) => {
      c += `<ellipse cx="${CX + dx}" cy="${CY + dy}" rx="5.5" ry="3.6" transform="rotate(${i * 37} ${CX + dx} ${CY + dy})" fill="${col}"/>`;
    });
    s += layer('mesangial', t('mesangial'), c);
  }

  if (v.endoProlif) {
    let c = '';
    loopsSubset.forEach(([x, y], i) => {
      c += `<circle cx="${x}" cy="${y}" r="${R - 4.5}" fill="none" stroke="var(--g-endo)" stroke-width="5" opacity="0.75"/>`;
      c += neutrophil(x + (i % 2 ? -12 : 12), y + 6) + neutrophil(x - 4, y - 18);
    });
    s += layer('endoProlif', t('endoProlif'), c);
  }

  if (v.pseudothrombi) {
    let c = '';
    loopsSubset.forEach(([x, y]) => {
      c += `<path d="M${x - 16} ${y + 2} q6 -16 20 -10 q14 4 8 16 q-8 12 -20 6 q-10 -4 -8 -12 z" fill="var(--g-cryo)" stroke="var(--g-cryo-edge)" stroke-width="1.2"/>`;
    });
    s += layer('pseudothrombi', t('pseudothrombi'), c);
  }

  if (v.doubleContour) {
    let c = '';
    loopsSubset.forEach(([x, y]) => {
      c += `<circle cx="${x}" cy="${y}" r="${R - 6}" fill="none" stroke="var(--g-gbm)" stroke-width="2" stroke-dasharray="6 3"/>`;
    });
    s += layer('doubleContour', t('doubleContour'), c);
  }

  if (v.subendoDeposits) {
    let c = '';
    loopsSubset.forEach(([x, y]) => {
      if (v.subendoDeposits === 'heavy') {
        for (const a0 of [0.3, 2.4, 4.4]) c += `<path d="${arcPath(x, y, R - 0.3, a0, a0 + 0.9)}" stroke="var(--g-dep-ic)" stroke-width="5" fill="none" stroke-linecap="round"/>`;
      } else {
        for (let k = 0; k < 6; k++) {
          const a = k * 1.05 + 0.3;
          const [px, py] = pol(x, y, R, a);
          c += `<ellipse cx="${f1(px)}" cy="${f1(py)}" rx="4.2" ry="2.3" transform="rotate(${f1((a * 180) / Math.PI + 90)} ${f1(px)} ${f1(py)})" fill="var(--g-dep-ic)"/>`;
        }
      }
    });
    s += layer('subendo', t('subendo'), c);
  }

  if (v.humps) {
    let c = '';
    const n = v.humps === 'few' ? 2 : 5;
    loopsSubset.forEach(([x, y]) => {
      const out = outward([x, y]);
      for (let k = 0; k < n; k++) {
        const a = out - 1.2 + (k * 2.4) / Math.max(1, n - 1);
        const [px, py] = pol(x, y, R + 5.2, a);
        c += `<path d="${arcPath(px, py, 4.6, a - Math.PI / 2, a + Math.PI / 2)} Z" fill="var(--g-dep-ic)" stroke="var(--g-dep-edge)" stroke-width="0.8"/>`;
      }
    });
    s += layer('subepi', t('subepi'), c);
  }

  if (v.intramembranous) {
    let c = '';
    loopsSubset.forEach(([x, y]) => {
      for (const a0 of [0.2, 2.2, 4.2]) c += `<path d="${arcPath(x, y, R + 2, a0, a0 + 1.1)}" stroke="var(--g-dense)" stroke-width="6.5" fill="none" stroke-linecap="round"/>`;
    });
    s += layer('intramembranous', t('intramembranous'), c);
  }

  if (v.linear) {
    let c = '';
    loopsSubset.forEach(([x, y]) => {
      c += `<circle cx="${x}" cy="${y}" r="${R + 2}" fill="none" stroke="var(--g-dep-igg)" stroke-width="2.6" filter="url(#${opts.idPrefix || 'g'}-glow)"/>`;
    });
    s += layer('linear', t('linear'), c);
  }

  if (v.necrosis) {
    const [x, y] = LOOPS[1];
    const out = outward([x, y]);
    let c = `<path d="${arcPath(x, y, R + 2, out - 0.28, out + 0.28)}" stroke="var(--g-bowman)" stroke-width="9" fill="none"/>`;
    const [gx, gy] = pol(x, y, R + 4, out);
    const pts = [];
    for (let k = 0; k < 6; k++) {
      const [px, py] = pol(gx, gy, k * 6, out + (k % 2 ? 0.5 : -0.5));
      pts.push([px, py]);
    }
    c += `<path d="${polyline(pts)}" stroke="var(--g-fibrin)" stroke-width="2.6" fill="none" stroke-linejoin="round"/>`;
    const [rx1, ry1] = pol(gx, gy, 18, out + 0.2);
    c += `<ellipse cx="${f1(rx1)}" cy="${f1(ry1)}" rx="6" ry="3.4" fill="var(--g-rbc)"/>`;
    s += layer('necrosis', t('necrosis'), c);
  }

  if (v.crescent) {
    const cr = opts.crescent || { cellular: 35, fibrous: 15 };
    const total = Math.max(0, Math.min(100, cr.cellular + cr.fibrous));
    if (total > 0.5) {
      const span = (total / 100) * Math.PI * 1.7;
      const mid = Math.PI / 2;
      const a0 = mid - span / 2, a1 = mid + span / 2;
      const rx = CAP.rx - 15, ry = CAP.ry - 15;
      let c = `<path d="${polyline(ellipseArcPoints(rx, ry, a0, a1))}" stroke="var(--g-cres-cell)" stroke-width="24" fill="none" stroke-linecap="round"/>`;
      const nN = Math.max(2, Math.round(span * 9));
      for (let k = 0; k <= nN; k++) {
        const a = a0 + ((a1 - a0) * k) / nN;
        for (const dr of [-6, 6]) {
          c += `<circle cx="${f1(CX + (rx + dr) * Math.cos(a + (dr > 0 ? 0.02 : 0)))}" cy="${f1(CY + (ry + dr) * Math.sin(a))}" r="2.6" fill="var(--g-nucleus)"/>`;
        }
      }
      const fspan = (cr.fibrous / Math.max(total, 1e-6)) * span;
      if (fspan > 0.02) {
        const f0 = mid - fspan / 2, f1a = mid + fspan / 2;
        c += `<path d="${polyline(ellipseArcPoints(rx, ry, f0, f1a))}" stroke="var(--g-cres-fib)" stroke-width="25" fill="none" stroke-linecap="round"/>`;
        for (const dr of [-7, 0, 7]) c += `<path d="${polyline(ellipseArcPoints(rx + dr, ry + dr, f0, f1a, 30))}" stroke="var(--g-cres-fib-line)" stroke-width="1" fill="none"/>`;
      }
      s += layer('crescent', t('crescent'), c);
    }
  }

  if (v.circulating && v.circulating !== 'none') {
    s += layer('circulating', t('circulating'), circulatingGlyphs(v.circulating));
  }

  const id = opts.idPrefix || 'g';
  const defs = `<defs><filter id="${id}-glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
  const label = opts.label ? ` aria-label="${opts.label}"` : '';
  return `<svg viewBox="0 0 400 364" class="glom" role="img"${label}>${defs}${s}</svg>`;
}

/** Layers actually drawn for an entity, in pathogenic order. */
export function layersOf(entity) {
  const v = entity.visual;
  const out = [];
  if (v.circulating && v.circulating !== 'none') out.push('circulating');
  if (entity.pathway && entity.pathway !== 'none') out.push('complement');
  if (v.linear) out.push('linear');
  if (v.subendoDeposits) out.push('subendo');
  if (v.humps) out.push('subepi');
  if (v.mesangialDeposits) out.push('mesangial');
  if (v.intramembranous) out.push('intramembranous');
  if (v.endoProlif) out.push('endoProlif');
  if (v.mesangialProlif) out.push('mesangialProlif');
  if (v.doubleContour) out.push('doubleContour');
  if (v.pseudothrombi) out.push('pseudothrombi');
  if (v.necrosis) out.push('necrosis');
  if (v.crescent) out.push('crescent');
  return out;
}

export const LAYER_SWATCH = {
  lumen: 'var(--g-lumen)', endothelium: 'var(--g-endo)', gbm: 'var(--g-gbm)', podocyte: 'var(--g-podo)',
  mesangium: 'var(--g-mes)', bowman: 'var(--g-capsule)',
  circulating: 'var(--g-dep-ic)', complement: 'var(--g-dep-c3)', subendo: 'var(--g-dep-ic)', subepi: 'var(--g-dep-ic)',
  mesangial: 'var(--g-dep-ic)', linear: 'var(--g-dep-igg)', intramembranous: 'var(--g-dense)',
  endoProlif: 'var(--g-neut)', mesangialProlif: 'var(--g-nucleus)', doubleContour: 'var(--g-gbm)',
  pseudothrombi: 'var(--g-cryo)', necrosis: 'var(--g-fibrin)', crescent: 'var(--g-cres-cell)',
};

export function swatchFor(entity, layerKey) {
  const v = entity.visual;
  if (layerKey === 'mesangial') return DEP_COLOR[v.mesangialDeposits] || DEP_COLOR.IC;
  if (layerKey === 'circulating') {
    return { ic: 'var(--g-dep-ic)', gdIgA1: 'var(--g-dep-iga)', antiGBM: 'var(--g-dep-igg)', anca: 'var(--g-anca)', cryo: 'var(--g-cryo)' }[v.circulating] || 'var(--g-dep-ic)';
  }
  return LAYER_SWATCH[layerKey];
}

// ---------------------------------------------------------------------------
// Immunofluorescence panel (dark field, FITC green)
const ICX = 80, ICY = 82, IR = 19;
const ILOOPS = [[54, 58], [106, 58], [54, 106], [106, 106]];

function seeded(n) {
  let a = n;
  return () => { a = (a * 9301 + 49297) % 233280; return a / 233280; };
}

export function renderIF(pattern, opts = {}) {
  const rnd = seeded(7);
  const id = opts.idPrefix || 'if';
  let s = `<defs><filter id="${id}-b" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.1" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
  s += `<rect width="160" height="164" rx="10" fill="#050806"/>`;
  s += `<ellipse cx="${ICX}" cy="${ICY}" rx="72" ry="70" fill="none" stroke="#1a2a1c" stroke-width="2"/>`;
  for (const [x, y] of ILOOPS) s += `<circle cx="${x}" cy="${y}" r="${IR}" fill="none" stroke="#132015" stroke-width="2"/>`;
  const G = '#6cf47a';
  let p = '';
  const dotsOnLoops = (n, r, jitter) => {
    for (const [x, y] of ILOOPS) for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rnd() * 0.3;
      const rr = IR + (rnd() - 0.5) * jitter;
      p += `<circle cx="${f1(x + rr * Math.cos(a))}" cy="${f1(y + rr * Math.sin(a))}" r="${f1(r * (0.7 + rnd() * 0.6))}" fill="${G}"/>`;
    }
  };
  const mesBlobs = (n, r) => {
    for (let k = 0; k < n; k++) {
      const a = rnd() * Math.PI * 2, d = rnd() * 22;
      p += `<ellipse cx="${f1(ICX + d * Math.cos(a))}" cy="${f1(ICY + d * Math.sin(a))}" rx="${f1(r * (0.8 + rnd() * 0.6))}" ry="${f1(r * 0.6)}" fill="${G}" transform="rotate(${Math.round(rnd() * 180)} ${f1(ICX + d * Math.cos(a))} ${f1(ICY + d * Math.sin(a))})"/>`;
    }
  };
  switch (pattern) {
    case 'linear':
      for (const [x, y] of ILOOPS) p += `<circle cx="${x}" cy="${y}" r="${IR}" fill="none" stroke="${G}" stroke-width="2.2"/>`;
      break;
    case 'starry':
      dotsOnLoops(13, 2.6, 6);
      mesBlobs(4, 2.2);
      break;
    case 'granular':
      dotsOnLoops(18, 1.6, 2);
      mesBlobs(6, 2);
      break;
    case 'fullHouse':
      dotsOnLoops(20, 1.9, 2);
      for (const [x, y] of ILOOPS) p += `<path d="${arcPath(x, y, IR, 0.4, 1.6)}" stroke="${G}" stroke-width="3.2" fill="none"/>`;
      mesBlobs(10, 2.6);
      break;
    case 'mesangialIgA':
      for (const [x, y] of ILOOPS) {
        const mx = ICX + (x - ICX) * 0.45, my = ICY + (y - ICY) * 0.45;
        const rot = (Math.atan2(y - ICY, x - ICX) * 180) / Math.PI;
        p += `<ellipse cx="${f1(mx)}" cy="${f1(my)}" rx="12" ry="4.5" transform="rotate(${f1(rot)} ${f1(mx)} ${f1(my)})" fill="${G}"/>`;
      }
      p += `<circle cx="${ICX}" cy="${ICY}" r="9" fill="${G}"/>`;
      mesBlobs(8, 2.4);
      break;
    case 'c3only':
      for (const [x, y] of ILOOPS) for (const a0 of [0.2, 1.8, 3.4, 5.0]) p += `<path d="${arcPath(x, y, IR, a0, a0 + 0.9)}" stroke="${G}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
      mesBlobs(7, 2.2);
      break;
    case 'negative':
    default:
      // only scattered fibrin in a crescent along Bowman's capsule (upper right)
      for (let k = 0; k < 22; k++) {
        const a = -1.35 + rnd() * 1.5, rr = 58 + rnd() * 10;
        p += `<circle cx="${f1(ICX + rr * Math.cos(a))}" cy="${f1(ICY + rr * Math.sin(a))}" r="${f1(0.8 + rnd())}" fill="${G}" opacity="0.45"/>`;
      }
      break;
  }
  s += `<g filter="url(#${id}-b)" opacity="0.95">${p}</g>`;
  const label = opts.label ? ` aria-label="${opts.label}"` : '';
  return `<svg viewBox="0 0 160 164" class="ifsvg" role="img"${label}>${s}</svg>`;
}

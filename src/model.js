// Glomérulo nefrítico interactivo: pure model (no DOM).
// Every entity of the nephritic syndrome is described by structured data
// (mechanism, deposits, immunofluorescence, typical labs) plus two small
// dynamic models: post-streptococcal recovery and crescent formation in
// rapidly progressive GN. Text lives in i18n.js; this file only holds data
// and functions, so it can be tested in Node.

// ---------------------------------------------------------------------------
// Parameters and normal ranges
// ---------------------------------------------------------------------------
// kind: 'quant' = number with a normal band; 'index' = serology as
// value / assay cut-off (>= 1 positive); 'qual' = absent (0) / present (1);
// 'ord' = 0-3 crosses.
// Normal ranges follow common reference values for adults; labs differ, so
// the UI shows them as approximate.
export const PARAMS = [
  // Urine sediment
  { key: 'hematuria', group: 'sediment', kind: 'quant', unit: 'hem/campo', lo: 0, hi: 3, min: 0, max: 100 },
  // <= 3 red cells per high-power field (standard sediment cut-off)
  { key: 'dysmorphic', group: 'sediment', kind: 'qual' },
  { key: 'casts', group: 'sediment', kind: 'qual' },
  // Kidney function
  { key: 'egfr', group: 'kidney', kind: 'quant', unit: 'mL/min/1,73 m²', lo: 90, hi: Infinity, min: 0, max: 130 },
  // KDIGO: G1 >= 90
  { key: 'proteinuria', group: 'kidney', kind: 'quant', unit: 'g/24 h', lo: 0, hi: 0.15, min: 0, max: 5, mark: 3.5 },
  // normal < 150 mg/24 h; nephrotic range >= 3.5 g/24 h (adult)
  { key: 'diuresis', group: 'kidney', kind: 'quant', unit: 'mL/24 h', lo: 800, hi: 2000, min: 0, max: 2500, mark: 400 },
  // oliguria < 400 mL/24 h
  // Clinical
  { key: 'sbp', group: 'clinical', kind: 'quant', unit: 'mmHg', lo: 90, hi: 129, min: 70, max: 190 },
  // adult: < 130 mmHg systolic. Child reference replaced in normalRange() (Modelo)
  { key: 'edema', group: 'clinical', kind: 'ord' },
  // Complement
  { key: 'c3', group: 'complement', kind: 'quant', unit: 'mg/dL', lo: 90, hi: 180, min: 0, max: 220 },
  { key: 'c4', group: 'complement', kind: 'quant', unit: 'mg/dL', lo: 10, hi: 40, min: 0, max: 50 },
  // Serology
  { key: 'aslo', group: 'serology', kind: 'quant', unit: 'UI/mL', lo: 0, hi: 200, min: 0, max: 1000 },
  { key: 'iga', group: 'serology', kind: 'quant', unit: 'mg/dL', lo: 70, hi: 400, min: 0, max: 700 },
  { key: 'antigbm', group: 'serology', kind: 'index' },
  { key: 'pr3', group: 'serology', kind: 'index' },
  { key: 'mpo', group: 'serology', kind: 'index' },
  { key: 'ana', group: 'serology', kind: 'index' },
  { key: 'cryo', group: 'serology', kind: 'qual' },
  { key: 'c3nef', group: 'serology', kind: 'qual' },
  { key: 'eos', group: 'serology', kind: 'quant', unit: '×10⁹/L', lo: 0, hi: 0.5, min: 0, max: 5 },
];

export const PARAM_GROUPS = ['sediment', 'kidney', 'clinical', 'complement', 'serology'];
export const paramByKey = Object.fromEntries(PARAMS.map((p) => [p.key, p]));
export const INDEX_MAX = 10; // display range for serology indices

/** Normal range for a parameter; children get a lower systolic limit (Modelo). */
export function normalRange(key, age = 'adult') {
  const p = paramByKey[key];
  if (!p) throw new Error(`unknown parameter ${key}`);
  if (key === 'sbp' && age === 'child') return { lo: 85, hi: 114 };
  // ~95th percentile systolic for a school-age child of average height (Modelo)
  if (p.kind === 'index') return { lo: 0, hi: 0.99 };
  if (p.kind === 'qual' || p.kind === 'ord') return { lo: 0, hi: 0 };
  return { lo: p.lo, hi: p.hi };
}

/** 'low' | 'normal' | 'high' (quant/ord) or 'neg' | 'pos' (index/qual). */
export function status(key, value, age = 'adult') {
  const p = paramByKey[key];
  const { lo, hi } = normalRange(key, age);
  if (p.kind === 'index') return value >= 1 ? 'pos' : 'neg';
  if (p.kind === 'qual') return value >= 0.5 ? 'pos' : 'neg';
  if (p.kind === 'ord') return Math.round(value) > hi ? 'high' : 'normal';
  if (value < lo) return 'low';
  if (value > hi) return 'high';
  return 'normal';
}

export const isAbnormal = (key, value, age) => !['normal', 'neg'].includes(status(key, value, age));

// Typical normal values used as the baseline of every entity.
const NORMAL_TYPICAL = {
  hematuria: [0, 2], dysmorphic: [0, 0], casts: [0, 0],
  egfr: [95, 115], proteinuria: [0.05, 0.12], diuresis: [1200, 1600],
  sbp: [110, 124], edema: [0, 0],
  c3: [110, 150], c4: [20, 32],
  aslo: [50, 150], iga: [150, 300],
  antigbm: [0.1, 0.5], pr3: [0.1, 0.5], mpo: [0.1, 0.5], ana: [0.1, 0.5],
  cryo: [0, 0], c3nef: [0, 0], eos: [0.1, 0.3],
};
const CHILD_SBP = [96, 108];

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------
// mechanism: antiGBM | icNormalC3 | icLowC3 | complement | pauci | double
// group: tree branch (C3 splits the immune-complex branch, as in the
// classical pathogenic classification of the nephritic syndrome).
// labs: [lo, hi] typical range at presentation (overrides NORMAL_TYPICAL).
// visual: layers drawn on the glomerulus.
// if: immunofluorescence pattern + reactants (0-3).
// clinical: age group, latency after infection (days), extrarenal signs.
// gnrp: crescent-model settings for types I, III and IV.

export const MECHANISMS = ['antiGBM', 'icNormalC3', 'icLowC3', 'pauci', 'double'];

export const ENTITIES = {
  // --- Anti-GBM antibodies ---------------------------------------------
  antigbm: {
    group: 'antiGBM', mechanism: 'antiGBM', gnrpType: 'I', pathway: 'none',
    labs: { hematuria: [30, 70], dysmorphic: [1, 1], casts: [1, 1], egfr: [10, 25], proteinuria: [0.8, 2], diuresis: [250, 500], sbp: [130, 145], edema: [1, 1], antigbm: [5, 9] },
    if: { pattern: 'linear', reactants: { IgG: 3, C3: 1 } },
    visual: { linear: true, necrosis: true, crescent: true, circulating: 'antiGBM' },
    clinical: { age: 'adult', latency: null, signs: [] },
    gnrp: { k: 0.09 },
  },
  goodpasture: {
    group: 'antiGBM', mechanism: 'antiGBM', gnrpType: 'I', pathway: 'none',
    labs: { hematuria: [30, 70], dysmorphic: [1, 1], casts: [1, 1], egfr: [10, 25], proteinuria: [0.8, 2], diuresis: [250, 500], sbp: [130, 145], edema: [1, 1], antigbm: [5, 9] },
    if: { pattern: 'linear', reactants: { IgG: 3, C3: 1 } },
    visual: { linear: true, necrosis: true, crescent: true, circulating: 'antiGBM' },
    clinical: { age: 'adult', latency: null, signs: ['lung'] },
    gnrp: { k: 0.09 },
  },
  // --- Immune complexes, normal C3 ------------------------------------
  igan: {
    group: 'icNormalC3', mechanism: 'icNormalC3', gnrpType: null, pathway: 'altLectin',
    labs: { hematuria: [20, 45], dysmorphic: [1, 1], casts: [1, 1], egfr: [75, 95], proteinuria: [0.3, 1.0], sbp: [128, 142], iga: [420, 560] },
    if: { pattern: 'mesangialIgA', reactants: { IgA: 3, C3: 2, IgG: 1 } },
    visual: { mesangialDeposits: 'IgA', mesangialProlif: true, circulating: 'gdIgA1' },
    clinical: { age: 'adult', latency: [1, 3], signs: [] },
  },
  igav: {
    group: 'icNormalC3', mechanism: 'icNormalC3', gnrpType: null, pathway: 'altLectin',
    labs: { hematuria: [15, 40], dysmorphic: [1, 1], casts: [1, 1], egfr: [85, 105], proteinuria: [0.3, 1.0], iga: [410, 520] },
    if: { pattern: 'mesangialIgA', reactants: { IgA: 3, C3: 2 } },
    visual: { mesangialDeposits: 'IgA', mesangialProlif: true, circulating: 'gdIgA1' },
    clinical: { age: 'child', latency: [1, 3], signs: ['purpura', 'joints', 'abdomen'] },
  },
  // --- Immune complexes / complement, low C3 --------------------------
  gnape: {
    group: 'icLowC3', mechanism: 'icLowC3', gnrpType: null, pathway: 'alternative',
    labs: { hematuria: [60, 90], dysmorphic: [1, 1], casts: [1, 1], egfr: [55, 70], proteinuria: [0.6, 1.4], diuresis: [300, 500], sbp: [130, 145], edema: [3, 3], c3: [30, 50], aslo: [500, 800] },
    if: { pattern: 'starry', reactants: { IgG: 2, C3: 3 } },
    visual: { subendoDeposits: true, humps: true, endoProlif: true, circulating: 'ic' },
    clinical: { age: 'child', latency: [7, 21], signs: [] },
  },
  lupus: {
    group: 'icLowC3', mechanism: 'icLowC3', gnrpType: null, pathway: 'classical',
    labs: { hematuria: [15, 40], dysmorphic: [1, 1], casts: [1, 1], egfr: [40, 65], proteinuria: [1.5, 3.0], sbp: [135, 155], edema: [1, 2], c3: [40, 70], c4: [3, 8], ana: [5, 9] },
    if: { pattern: 'fullHouse', reactants: { IgG: 3, IgA: 2, IgM: 2, C3: 3, C1q: 3 } },
    visual: { subendoDeposits: 'heavy', mesangialDeposits: 'IC', humps: 'few', endoProlif: true, circulating: 'ic' },
    clinical: { age: 'adult', latency: null, signs: ['malar', 'joints', 'serositis'] },
  },
  mpgn: {
    group: 'icLowC3', mechanism: 'icLowC3', gnrpType: null, pathway: 'classical',
    labs: { hematuria: [10, 30], dysmorphic: [1, 1], casts: [1, 1], egfr: [45, 70], proteinuria: [2.0, 3.2], sbp: [135, 150], edema: [1, 2], c3: [50, 75], c4: [8, 16] },
    if: { pattern: 'granular', reactants: { IgG: 3, IgM: 1, C3: 3 } },
    visual: { subendoDeposits: true, mesangialDeposits: 'IC', doubleContour: true, mesangialProlif: true, circulating: 'ic' },
    clinical: { age: 'adult', latency: null, signs: ['hcv'] },
  },
  c3g: {
    group: 'icLowC3', mechanism: 'complement', gnrpType: null, pathway: 'alternative',
    labs: { hematuria: [10, 30], dysmorphic: [1, 1], casts: [1, 1], egfr: [50, 80], proteinuria: [1.0, 3.0], sbp: [130, 145], edema: [1, 1], c3: [20, 45], c3nef: [1, 1] },
    if: { pattern: 'c3only', reactants: { C3: 3 } },
    visual: { intramembranous: true, mesangialDeposits: 'C3', mesangialProlif: true, doubleContour: true, circulating: 'none' },
    clinical: { age: 'any', latency: null, signs: [] },
  },
  endocarditis: {
    group: 'icLowC3', mechanism: 'icLowC3', gnrpType: null, pathway: 'classical',
    labs: { hematuria: [15, 40], dysmorphic: [1, 1], casts: [1, 1], egfr: [40, 65], proteinuria: [0.5, 1.5], c3: [50, 75], c4: [12, 22] },
    if: { pattern: 'granular', reactants: { IgG: 2, IgM: 2, C3: 3 } },
    visual: { subendoDeposits: true, mesangialDeposits: 'IC', endoProlif: true, circulating: 'ic' },
    clinical: { age: 'adult', latency: null, signs: ['fever', 'murmur'] },
  },
  cryo: {
    group: 'icLowC3', mechanism: 'icLowC3', gnrpType: null, pathway: 'classical',
    labs: { hematuria: [10, 30], dysmorphic: [1, 1], casts: [1, 1], egfr: [40, 65], proteinuria: [1.5, 3.0], sbp: [140, 160], edema: [1, 2], c3: [60, 85], c4: [1, 5], cryo: [1, 1] },
    if: { pattern: 'granular', reactants: { IgM: 3, IgG: 2, C3: 2 } },
    visual: { subendoDeposits: true, pseudothrombi: true, doubleContour: true, endoProlif: true, circulating: 'cryo' },
    clinical: { age: 'adult', latency: null, signs: ['purpura', 'joints', 'neuropathy', 'hcv'] },
  },
  // --- Pauci-immune (ANCA) ---------------------------------------------
  gpa: {
    group: 'pauci', mechanism: 'pauci', gnrpType: 'III', pathway: 'none',
    labs: { hematuria: [20, 50], dysmorphic: [1, 1], casts: [1, 1], egfr: [20, 40], proteinuria: [0.5, 1.5], diuresis: [500, 800], pr3: [4, 8] },
    if: { pattern: 'negative', reactants: { fibrin: 2 } },
    visual: { necrosis: true, crescent: true, circulating: 'anca' },
    clinical: { age: 'adult', latency: null, signs: ['upperAirway', 'lung'] },
    anca: { PR3: 75, MPO: 20, neg: 5 },
    gnrp: { k: 0.05 },
  },
  mpa: {
    group: 'pauci', mechanism: 'pauci', gnrpType: 'III', pathway: 'none',
    labs: { hematuria: [20, 50], dysmorphic: [1, 1], casts: [1, 1], egfr: [15, 35], proteinuria: [0.5, 1.5], diuresis: [400, 800], mpo: [4, 8] },
    if: { pattern: 'negative', reactants: { fibrin: 2 } },
    visual: { necrosis: true, crescent: true, circulating: 'anca' },
    clinical: { age: 'adult', latency: null, signs: ['lung', 'neuropathy'] },
    anca: { PR3: 30, MPO: 60, neg: 10 },
    gnrp: { k: 0.05 },
  },
  egpa: {
    group: 'pauci', mechanism: 'pauci', gnrpType: 'III', pathway: 'none',
    labs: { hematuria: [5, 20], dysmorphic: [1, 1], casts: [1, 1], egfr: [55, 80], proteinuria: [0.3, 1.0], mpo: [1.5, 4], eos: [1.5, 4] },
    if: { pattern: 'negative', reactants: { fibrin: 1 } },
    visual: { necrosis: true, crescent: true, circulating: 'anca' },
    clinical: { age: 'adult', latency: null, signs: ['asthma', 'upperAirway', 'neuropathy'] },
    anca: { PR3: 5, MPO: 35, neg: 60 },
    gnrp: { k: 0.02 },
  },
  rlv: {
    group: 'pauci', mechanism: 'pauci', gnrpType: 'III', pathway: 'none',
    labs: { hematuria: [20, 50], dysmorphic: [1, 1], casts: [1, 1], egfr: [20, 40], proteinuria: [0.5, 1.5], diuresis: [500, 800], mpo: [4, 8] },
    if: { pattern: 'negative', reactants: { fibrin: 2 } },
    visual: { necrosis: true, crescent: true, circulating: 'anca' },
    clinical: { age: 'adult', latency: null, signs: [] },
    anca: { PR3: 10, MPO: 80, neg: 10 },
    gnrp: { k: 0.05 },
  },
  // --- Double positive --------------------------------------------------
  double: {
    group: 'double', mechanism: 'double', gnrpType: 'IV', pathway: 'none',
    labs: { hematuria: [30, 70], dysmorphic: [1, 1], casts: [1, 1], egfr: [8, 20], proteinuria: [0.8, 2], diuresis: [200, 450], sbp: [130, 145], edema: [1, 1], antigbm: [3, 6], mpo: [3, 6] },
    if: { pattern: 'linear', reactants: { IgG: 2, C3: 1 } },
    visual: { linear: true, necrosis: true, crescent: true, circulating: 'antiGBM' },
    clinical: { age: 'adult', latency: null, signs: [] },
    gnrp: { k: 0.09 },
  },
};

export const ENTITY_IDS = Object.keys(ENTITIES);

/** Entities grouped by branch of the classification tree, in display order. */
export const TREE = [
  { group: 'antiGBM', ids: ['antigbm', 'goodpasture'] },
  { group: 'icNormalC3', ids: ['igan', 'igav'] },
  { group: 'icLowC3', ids: ['gnape', 'lupus', 'mpgn', 'c3g', 'endocarditis', 'cryo'] },
  { group: 'pauci', ids: ['gpa', 'mpa', 'egpa', 'rlv'] },
  { group: 'double', ids: ['double'] },
];

export const IF_PATTERNS = ['linear', 'starry', 'granular', 'fullHouse', 'mesangialIgA', 'c3only', 'negative'];
export const SIGNS = ['lung', 'purpura', 'joints', 'abdomen', 'malar', 'serositis', 'fever', 'murmur', 'neuropathy', 'hcv', 'upperAirway', 'asthma'];

const mid = ([a, b]) => (a + b) / 2;

function rangeFor(entityId, key) {
  const e = ENTITIES[entityId];
  if (e.labs[key]) return e.labs[key];
  if (key === 'sbp' && e.clinical.age === 'child') return CHILD_SBP;
  return NORMAL_TYPICAL[key];
}

export function ageOf(entityId) {
  const a = ENTITIES[entityId].clinical.age;
  return a === 'child' ? 'child' : 'adult';
}

/** Typical labs at presentation (midpoint of each typical range). */
export function typicalLabs(entityId) {
  if (!ENTITIES[entityId]) throw new Error(`unknown entity ${entityId}`);
  const out = {};
  for (const p of PARAMS) out[p.key] = mid(rangeFor(entityId, p.key));
  return out;
}

// ---------------------------------------------------------------------------
// Dynamics
// ---------------------------------------------------------------------------
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

// Post-streptococcal GN after infection on day 0.
// Latency: ~10 days after pharyngitis, ~3 weeks after skin infection
// (standard range 1-3 weeks / 3-6 weeks). Recovery times follow the classic
// course: edema 5-10 d, gross hematuria 1-3 wk, hypertension 2-3 wk,
// renal function ~6 wk, C3 normal by ~8 wk, microhematuria up to ~6 months.
export const GNAPE = {
  latency: { pharynx: 10, skin: 21 },
  // [abnormal value at onset, normal value, recovery start, recovery end] (days after onset)
  course: {
    edema: [3, 0, 4, 10],
    diuresis: [400, 1300, 2, 10],
    sbp: [138, 102, 7, 21],
    egfr: [62, 105, 7, 42],
    c3: [40, 130, 28, 60],
    proteinuria: [1.0, 0.1, 14, 150],
  },
  // hematuria: gross (80/field) -> micro (12/field) by 1-3 wk -> normal by ~6 months
  hematuria: { gross: 80, micro: 12, normal: 1, grossEnd: [7, 21], microEnd: [60, 180] },
  aslo: { normal: 100, peak: { pharynx: 700, skin: 190 }, rise: [7, 28], fall: [60, 180] },
  // ASLO rises in ~75-80 % after pharyngitis but only ~30 % after skin infection
};

function gnapeValue(key, s, atypical) {
  const onset = smoothstep(0, 1.5, s); // onset over ~1-2 days
  if (key === 'hematuria') {
    const h = GNAPE.hematuria;
    const grossPart = (h.gross - h.micro) * (1 - smoothstep(h.grossEnd[0], h.grossEnd[1], s));
    const microPart = (h.micro - h.normal) * (atypical ? 1 : 1 - smoothstep(h.microEnd[0], h.microEnd[1], s));
    return h.normal + onset * (grossPart + microPart);
  }
  const c = GNAPE.course[key];
  if (!c) return null;
  const [abn, norm, r0, r1] = c;
  let rec = smoothstep(r0, r1, s);
  if (atypical && (key === 'c3' || key === 'proteinuria')) rec = 0;
  return norm + onset * (abn - norm) * (1 - rec);
}

/** Labs of a post-streptococcal GN `day` days after the infection. */
export function gnapeLabs(day, { site = 'pharynx', atypical = false } = {}) {
  const L = GNAPE.latency[site] ?? GNAPE.latency.pharynx;
  const s = day - L;
  const labs = typicalLabs('gnape');
  // baseline normal values before onset
  const base = { edema: 0, diuresis: 1300, sbp: 102, egfr: 105, c3: 130, proteinuria: 0.1 };
  for (const key of Object.keys(GNAPE.course)) {
    labs[key] = s < 0 ? base[key] : gnapeValue(key, s, atypical);
  }
  labs.hematuria = s < 0 ? GNAPE.hematuria.normal : gnapeValue('hematuria', s, atypical);
  labs.dysmorphic = labs.hematuria > 3 ? 1 : 0;
  labs.casts = s >= 0 && labs.hematuria > 20 ? 1 : 0; // red-cell casts during the active (gross) phase
  const a = GNAPE.aslo;
  labs.aslo = a.normal + (a.peak[site] - a.normal) * smoothstep(a.rise[0], a.rise[1], day) * (1 - 0.7 * smoothstep(a.fall[0], a.fall[1], day));
  labs.c4 = mid(NORMAL_TYPICAL.c4);
  return labs;
}

/** Abnormality of a GNAPE parameter as % of its onset deviation (0 = normal). */
export function gnapeDeviation(key, day, opts = {}) {
  const labs = gnapeLabs(day, opts);
  if (key === 'hematuria') {
    const h = GNAPE.hematuria;
    return clamp(((labs.hematuria - h.normal) / (h.gross - h.normal)) * 100, 0, 100);
  }
  if (key === 'aslo') {
    const a = GNAPE.aslo;
    return clamp(((labs.aslo - a.normal) / (a.peak.pharynx - a.normal)) * 100, 0, 100);
  }
  const [abn, norm] = GNAPE.course[key];
  return clamp(((labs[key] - norm) / (abn - norm)) * 100, 0, 100);
}

export const GNAPE_SERIES = ['edema', 'hematuria', 'sbp', 'egfr', 'c3', 'aslo'];

// IgA nephropathy / IgA vasculitis: persistent microhematuria with a bout of
// gross hematuria 1-3 days after a pharyngitis ("synpharyngitic").
export function igaHematuria(day) {
  return 15 + 65 * smoothstep(0.5, 1.5, day) * (1 - smoothstep(3, 5, day));
}

export function igaLabs(entityId, day) {
  const labs = typicalLabs(entityId);
  labs.hematuria = igaHematuria(day);
  return labs;
}

// Crescent model for rapidly progressive GN (types I, III, IV). Modelo.
// Glomeruli are normal (N), with a cellular crescent (Ce) or with a fibrous
// crescent (F). Active disease turns normal glomeruli into cellular
// crescents at rate k; cellular crescents scar into fibrous ones at rate c;
// treatment makes disease activity fade (time constant tau) and lets
// cellular crescents resolve at rate r. Filtration ~ N + 0.4*Ce (a cellular crescent still
// filters a little; a fibrous one does not).
export const CRESCENT = {
  c: 0.06,        // per day: cellular -> fibrous (~2-3 weeks)  [Modelo]
  r: 0.10,        // per day: cellular crescent resolution on treatment  [Modelo]
  tau: 4,         // days: disease activity fades with this time constant once treated  [Modelo]
  ceFilter: 0.4,  // residual filtration of a glomerulus with a cellular crescent  [Modelo]
  baseGfr: 105,   // mL/min/1.73 m² before the disease
  dialysis: 15,   // KDIGO G5 (kidney failure)
  days: 120,
};

/**
 * Integrates the crescent model. Returns daily arrays.
 * txDay = null means no treatment.
 */
export function crescentModel(entityId, { txDay = null, days = CRESCENT.days } = {}) {
  const g = ENTITIES[entityId]?.gnrp;
  if (!g) throw new Error(`${entityId} has no crescent model`);
  const { c, r, tau, ceFilter, baseGfr } = CRESCENT;
  let N = 1, Ce = 0, F = 0;
  const dt = 0.05;
  const out = { day: [], normal: [], cellular: [], fibrous: [], egfr: [] };
  const push = (d) => {
    out.day.push(d);
    out.normal.push(N * 100);
    out.cellular.push(Ce * 100);
    out.fibrous.push(F * 100);
    out.egfr.push(baseGfr * (N + ceFilter * Ce));
  };
  push(0);
  for (let d = 1; d <= days; d++) {
    for (let i = 0; i < 1 / dt; i++) {
      const t = d - 1 + i * dt;
      const treated = txDay != null && t >= txDay;
      const activity = treated ? Math.exp(-(t - txDay) / tau) : 1;
      const form = g.k * activity * N;
      const scar = c * Ce;
      const heal = treated ? r * Ce : 0;
      N += dt * (-form + heal);
      Ce += dt * (form - scar - heal);
      F += dt * scar;
    }
    push(d);
  }
  return out;
}

export function crescentAt(entityId, day, opts) {
  const m = crescentModel(entityId, opts);
  const i = clamp(Math.round(day), 0, m.day.length - 1);
  return { normal: m.normal[i], cellular: m.cellular[i], fibrous: m.fibrous[i], egfr: m.egfr[i] };
}

export function crescentOutcome(entityId, opts) {
  const m = crescentModel(entityId, opts);
  const last = m.day.length - 1;
  const egfr = m.egfr[last];
  return {
    egfr, fibrous: m.fibrous[last], crescents: m.cellular[last] + m.fibrous[last],
    dialysis: egfr < CRESCENT.dialysis,
    nadir: Math.min(...m.egfr),
  };
}

/** Labs of any entity in a given scenario (day, treatment, site...). */
export function labsFor(entityId, sc = {}) {
  const e = ENTITIES[entityId];
  if (entityId === 'gnape') return gnapeLabs(sc.day ?? 14, sc);
  if (entityId === 'igan' || entityId === 'igav') return igaLabs(entityId, sc.day ?? 2);
  const labs = typicalLabs(entityId);
  if (e.gnrp) {
    const st = crescentAt(entityId, sc.day ?? 21, { txDay: sc.txDay ?? null });
    labs.egfr = st.egfr;
  }
  return labs;
}

// ---------------------------------------------------------------------------
// Compare
// ---------------------------------------------------------------------------
export const FEATURES = ['mechanism', 'pathway', 'ifPattern', 'deposits', 'latency', 'signs', 'gnrpType'];

export function depositSites(entityId) {
  const v = ENTITIES[entityId].visual;
  const s = [];
  if (v.linear) s.push('linear');
  if (v.subendoDeposits) s.push('subendothelial');
  if (v.humps) s.push('subepithelial');
  if (v.mesangialDeposits) s.push('mesangial');
  if (v.intramembranous) s.push('intramembranous');
  if (!s.length) s.push('none');
  return s;
}

function featureValue(entityId, f) {
  const e = ENTITIES[entityId];
  switch (f) {
    case 'mechanism': return e.mechanism;
    case 'pathway': return e.pathway;
    case 'ifPattern': return e.if.pattern;
    case 'deposits': return depositSites(entityId).join(',');
    case 'latency': return e.clinical.latency ? e.clinical.latency.join('-') : 'none';
    case 'signs': return e.clinical.signs.join(',') || 'none';
    case 'gnrpType': return e.gnrpType ?? 'none';
    default: return null;
  }
}

/** Rows for a side-by-side comparison; `differs` marks what tells them apart. */
export function compare(a, b, scA = {}, scB = {}) {
  const la = labsFor(a, scA), lb = labsFor(b, scB);
  const ageA = ageOf(a), ageB = ageOf(b);
  const labs = PARAMS.map((p) => {
    const sa = status(p.key, la[p.key], ageA);
    const sb = status(p.key, lb[p.key], ageB);
    return { key: p.key, a: la[p.key], b: lb[p.key], statusA: sa, statusB: sb, differs: sa !== sb };
  });
  const features = FEATURES.map((f) => {
    const va = featureValue(a, f), vb = featureValue(b, f);
    return { key: f, a: va, b: vb, differs: va !== vb };
  });
  return { labs, features };
}

// ---------------------------------------------------------------------------
// Rule engine: findings -> mechanism -> entity
// ---------------------------------------------------------------------------
/** Findings that a clinician would have: labs, IF pattern and clinical signs. */
export function findingsFrom(entityId, labs, extra = {}) {
  const e = ENTITIES[entityId];
  const age = ageOf(entityId);
  return {
    age,
    c3Low: status('c3', labs.c3) === 'low',
    c4Low: status('c4', labs.c4) === 'low',
    antiGBM: labs.antigbm >= 1,
    pr3: labs.pr3 >= 1,
    mpo: labs.mpo >= 1,
    ana: labs.ana >= 1,
    cryo: labs.cryo >= 0.5,
    c3nef: labs.c3nef >= 0.5,
    asloHigh: status('aslo', labs.aslo) === 'high',
    igaHigh: status('iga', labs.iga) === 'high',
    eosHigh: status('eos', labs.eos) === 'high',
    ifPattern: e.if.pattern,
    latency: extra.latency ?? (e.clinical.latency ? mid(e.clinical.latency) : null),
    signs: [...e.clinical.signs],
  };
}

/**
 * Classical stepwise reasoning. Returns the mechanism, the most likely
 * entity and the steps (i18n keys) that led there.
 */
export function classify(f) {
  const steps = [];
  const has = (s) => f.signs.includes(s);
  const anca = f.pr3 || f.mpo;
  // 1. Anti-GBM antibodies or linear IF
  if (f.antiGBM || f.ifPattern === 'linear') {
    steps.push('stepAntiGBM');
    if (anca) {
      steps.push('stepDouble');
      return { mechanism: 'double', entity: 'double', steps };
    }
    if (has('lung')) {
      steps.push('stepLung');
      return { mechanism: 'antiGBM', entity: 'goodpasture', steps };
    }
    steps.push('stepNoLung');
    return { mechanism: 'antiGBM', entity: 'antigbm', steps };
  }
  // 2. ANCA or pauci-immune IF
  if (anca || f.ifPattern === 'negative') {
    steps.push('stepPauci');
    if (f.eosHigh || has('asthma')) { steps.push('stepEos'); return { mechanism: 'pauci', entity: 'egpa', steps }; }
    if (f.pr3 || has('upperAirway')) { steps.push('stepPR3'); return { mechanism: 'pauci', entity: 'gpa', steps }; }
    if (f.signs.length === 0) { steps.push('stepRenalOnly'); return { mechanism: 'pauci', entity: 'rlv', steps }; }
    steps.push('stepMPO');
    return { mechanism: 'pauci', entity: 'mpa', steps };
  }
  // 3. Immune complexes / complement: C3 splits the branch
  steps.push('stepIC');
  if (!f.c3Low) {
    steps.push('stepC3Normal');
    if (has('purpura')) { steps.push('stepPurpura'); return { mechanism: 'icNormalC3', entity: 'igav', steps }; }
    steps.push('stepIgA');
    return { mechanism: 'icNormalC3', entity: 'igan', steps };
  }
  steps.push('stepC3Low');
  if (f.ana) { steps.push('stepANA'); return { mechanism: 'icLowC3', entity: 'lupus', steps }; }
  if (f.cryo) { steps.push('stepCryo'); return { mechanism: 'icLowC3', entity: 'cryo', steps }; }
  if (f.c3nef || f.ifPattern === 'c3only') { steps.push('stepC3G'); return { mechanism: 'complement', entity: 'c3g', steps }; }
  if (has('fever') || has('murmur')) { steps.push('stepEndocarditis'); return { mechanism: 'icLowC3', entity: 'endocarditis', steps }; }
  if (f.asloHigh || (f.latency != null && f.latency >= 7 && f.latency <= 42)) {
    steps.push('stepStrep');
    return { mechanism: 'icLowC3', entity: 'gnape', steps };
  }
  steps.push('stepMPGN');
  return { mechanism: 'icLowC3', entity: 'mpgn', steps };
}

// ---------------------------------------------------------------------------
// Quiz cases
// ---------------------------------------------------------------------------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic case: picks an entity (unless given) and draws each lab
 * inside its typical range, so the pattern always matches the entity.
 */
export function generateCase(seed, entityId = null) {
  const rnd = mulberry32(seed);
  const id = entityId ?? ENTITY_IDS[Math.floor(rnd() * ENTITY_IDS.length)];
  const e = ENTITIES[id];
  const labs = {};
  for (const p of PARAMS) {
    const [lo, hi] = rangeFor(id, p.key);
    let v = lo + rnd() * (hi - lo);
    if (p.kind === 'qual') v = Math.round(v);
    if (p.kind === 'ord') v = Math.round(v);
    labs[p.key] = v;
  }
  let site = null, latency = null;
  if (id === 'gnape') {
    site = rnd() < 0.7 ? 'pharynx' : 'skin';
    latency = GNAPE.latency[site] + Math.round((rnd() - 0.5) * 6);
    if (site === 'skin') labs.aslo = 150 + rnd() * 200; // ASLO often not raised after skin infection
  } else if (e.clinical.latency) {
    latency = Math.round(e.clinical.latency[0] + rnd() * (e.clinical.latency[1] - e.clinical.latency[0]));
  }
  return { seed, entity: id, labs, age: ageOf(id), site, latency, ifPattern: e.if.pattern, signs: [...e.clinical.signs] };
}

// ---------------------------------------------------------------------------
// Presets (teacher deep links: ?preset=<key>)
// ---------------------------------------------------------------------------
export const PRESETS = {
  'faringitis-nino': { mode: 'explore', entity: 'gnape', site: 'pharynx', day: 14 },
  'impetigo': { mode: 'explore', entity: 'gnape', site: 'skin', day: 30 },
  'c3-persistente': { mode: 'explore', entity: 'gnape', site: 'pharynx', day: 100, atypical: true },
  'hematuria-sinfaringitica': { mode: 'explore', entity: 'igan', day: 2 },
  'purpura-nino': { mode: 'explore', entity: 'igav', day: 2 },
  'lupus': { mode: 'explore', entity: 'lupus' },
  'gnmp': { mode: 'explore', entity: 'mpgn' },
  'c3-glomerulopatia': { mode: 'explore', entity: 'c3g' },
  'endocarditis': { mode: 'explore', entity: 'endocarditis' },
  'crioglobulinemia': { mode: 'explore', entity: 'cryo' },
  'anti-mbg': { mode: 'explore', entity: 'antigbm', day: 21, txDay: 7 },
  'hemoptisis-irpr': { mode: 'explore', entity: 'goodpasture', day: 30, txDay: 5 },
  'goodpasture-tardio': { mode: 'explore', entity: 'goodpasture', day: 70, txDay: 42 },
  'anca-pr3': { mode: 'explore', entity: 'gpa', day: 30, txDay: 10 },
  'anca-mpo': { mode: 'explore', entity: 'mpa', day: 30, txDay: 14 },
  'egpa': { mode: 'explore', entity: 'egpa', day: 30, txDay: 14 },
  'vasculitis-renal': { mode: 'explore', entity: 'rlv', day: 45, txDay: 28 },
  'doble-positivo': { mode: 'explore', entity: 'double', day: 21, txDay: 7 },
  'postinfecciosa-vs-iga': { mode: 'compare', a: 'gnape', b: 'igan' },
  'lupus-vs-gnmp': { mode: 'compare', a: 'lupus', b: 'mpgn' },
  'goodpasture-vs-gpa': { mode: 'compare', a: 'goodpasture', b: 'gpa' },
  'iga-vs-vasculitis-iga': { mode: 'compare', a: 'igan', b: 'igav' },
  'quiz': { mode: 'quiz' },
};

export const DEFAULT_SCENARIO = { day: 21, txDay: 7, site: 'pharynx', atypical: false };

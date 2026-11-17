import * as M from './model.js';
import { STRINGS, LANGS, pickLang } from './i18n.js';
import { renderGlomerulus, renderIF, layersOf, swatchFor } from './glomerulus.js';
import { lineChart, stackedArea } from './charts.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};

let lang = pickLang(location.search, store.get('ng-lang'), navigator.language);
let S = STRINGS[lang];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
function timeKind(id) {
  if (id === 'gnape') return 'gnape';
  if (id === 'igan' || id === 'igav') return 'iga';
  if (M.ENTITIES[id].gnrp) return 'crescent';
  return null;
}

function defaultScenario(id) {
  const k = timeKind(id);
  if (k === 'gnape') return { day: 14, site: 'pharynx', atypical: false };
  if (k === 'iga') return { day: 2 };
  if (k === 'crescent') return { day: 21, txDay: 7, noTx: false };
  return {};
}

const state = {
  mode: 'explore',
  entity: 'gnape',
  sc: defaultScenario('gnape'),
  cmp: { a: 'gnape', b: 'igan', onlyDiff: false },
  quiz: { seed: null, n: 1, choice: null, ok: 0, total: 0 },
  onlyAbnormal: false,
  highlight: null,
  step: null,
};
let stepTimer = null;
let timeTimer = null;

const modelArgs = (sc) => ({ ...sc, txDay: sc.noTx ? null : sc.txDay });

function applyPreset(p) {
  state.mode = p.mode;
  if (p.mode === 'explore') {
    state.entity = p.entity;
    state.sc = { ...defaultScenario(p.entity) };
    for (const k of ['day', 'txDay', 'site', 'atypical']) if (p[k] != null) state.sc[k] = p[k];
  } else if (p.mode === 'compare') {
    state.cmp.a = p.a; state.cmp.b = p.b;
  }
}

function readUrl() {
  const q = new URLSearchParams(location.search);
  const preset = q.get('preset');
  if (preset && M.PRESETS[preset]) applyPreset(M.PRESETS[preset]);
  const mode = q.get('mode');
  if (['explore', 'compare', 'quiz'].includes(mode)) state.mode = mode;
  const ent = q.get('entity');
  if (M.ENTITIES[ent] && ent !== state.entity) { state.entity = ent; state.sc = defaultScenario(ent); }
  const num = (k) => { const v = Number(q.get(k)); return q.get(k) != null && Number.isFinite(v) ? v : null; };
  const k = timeKind(state.entity);
  if (num('day') != null && k) state.sc.day = M.clamp(num('day'), 0, k === 'gnape' ? 200 : k === 'iga' ? 14 : 120);
  if (k === 'crescent') {
    if (q.get('tx') === 'none') state.sc.noTx = true;
    else if (num('tx') != null) { state.sc.txDay = M.clamp(num('tx'), 0, 60); state.sc.noTx = false; }
  }
  if (k === 'gnape') {
    if (['pharynx', 'skin'].includes(q.get('site'))) state.sc.site = q.get('site');
    if (q.get('atypical') === '1') state.sc.atypical = true;
  }
  if (M.ENTITIES[q.get('a')]) state.cmp.a = q.get('a');
  if (M.ENTITIES[q.get('b')]) state.cmp.b = q.get('b');
  if (q.get('only') === '1') state.cmp.onlyDiff = true;
  if (num('case') != null) state.quiz.seed = Math.abs(Math.round(num('case')));
}

function writeUrl() {
  const q = new URLSearchParams();
  q.set('lang', lang);
  q.set('mode', state.mode);
  if (state.mode === 'explore') {
    q.set('entity', state.entity);
    const k = timeKind(state.entity);
    if (k) q.set('day', String(state.sc.day));
    if (k === 'crescent') q.set('tx', state.sc.noTx ? 'none' : String(state.sc.txDay));
    if (k === 'gnape') { q.set('site', state.sc.site); if (state.sc.atypical) q.set('atypical', '1'); }
  } else if (state.mode === 'compare') {
    q.set('a', state.cmp.a); q.set('b', state.cmp.b);
    if (state.cmp.onlyDiff) q.set('only', '1');
  } else if (state.quiz.seed != null) {
    q.set('case', String(state.quiz.seed));
  }
  history.replaceState(null, '', `${location.pathname}?${q}`);
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
const nf = (v, d = 0) => new Intl.NumberFormat(S.locale, { maximumFractionDigits: d, minimumFractionDigits: d }).format(v);

function digits(p, v) {
  if (p.kind === 'index') return 1;
  if (p.key === 'proteinuria') return v < 1 ? 2 : 1;
  if (p.key === 'eos') return 1;
  return 0;
}

const QUAL_PRESENCE = new Set(['dysmorphic', 'casts']);

function valueText(p, v) {
  if (p.kind === 'qual') {
    const pos = v >= 0.5;
    return QUAL_PRESENCE.has(p.key) ? (pos ? S.present : S.absent) : (pos ? S.status.pos : S.status.neg);
  }
  if (p.kind === 'ord') return ['0', '+', '++', '+++'][Math.round(M.clamp(v, 0, 3))];
  if (p.kind === 'index') return `${nf(v, 1)} (${S.indexUnit})`;
  return `${nf(v, digits(p, v))} ${S.units[p.key] || ''}`.trim();
}

function normalText(p, age) {
  if (p.kind === 'qual') return QUAL_PRESENCE.has(p.key) ? S.absent : S.status.neg;
  if (p.kind === 'ord') return '0';
  if (p.kind === 'index') return '< 1';
  const { lo, hi } = M.normalRange(p.key, age);
  const u = S.units[p.key] || '';
  const d = p.key === 'proteinuria' || p.key === 'eos' ? 2 : 0;
  if (hi === Infinity) return `≥ ${nf(lo, d)} ${u}`;
  if (lo === 0) return `< ${nf(hi, d)} ${u}`;
  return `${nf(lo, d)}–${nf(hi, d)} ${u}`;
}

const ARROW = { low: '↓', high: '↑', pos: '+', normal: '', neg: '' };

function badge(st, p = null) {
  let txt = S.status[st];
  if (p && QUAL_PRESENCE.has(p.key)) txt = st === 'pos' ? S.present : S.absent;
  return `<span class="st st-${st}">${ARROW[st] ? `<b aria-hidden="true">${ARROW[st]}</b> ` : ''}${esc(txt)}</span>`;
}

const STATUS_COLOR = { low: 'var(--lo)', high: 'var(--hi)', pos: 'var(--hi)', normal: 'var(--ink-2)', neg: 'var(--ink-3)' };

function barSvg(p, v, age) {
  const W = 200, x0 = 6, x1 = 194;
  if (p.kind === 'qual') return '';
  const st = M.status(p.key, v, age);
  if (p.kind === 'ord') {
    let s = '';
    for (let i = 0; i < 3; i++) s += `<rect x="${x0 + i * 22}" y="2" width="18" height="14" rx="4" fill="${i < Math.round(v) ? STATUS_COLOR[st] : 'var(--track)'}"/>`;
    return `<svg class="bar" viewBox="0 0 ${W} 18" aria-hidden="true">${s}</svg>`;
  }
  let min, max, lo, hi;
  if (p.kind === 'index') { min = 0; max = M.INDEX_MAX; lo = 0; hi = 1; } else {
    min = p.min; max = p.max;
    const r = M.normalRange(p.key, age);
    lo = Math.max(r.lo, min); hi = Math.min(r.hi, max);
  }
  const sx = (x) => x0 + ((M.clamp(x, min, max) - min) / (max - min)) * (x1 - x0);
  let s = `<line x1="${x0}" x2="${x1}" y1="9" y2="9" stroke="var(--track)" stroke-width="2" stroke-linecap="round"/>`;
  s += `<rect x="${sx(lo)}" y="4" width="${Math.max(2, sx(hi) - sx(lo))}" height="10" rx="3" fill="var(--band)"/>`;
  if (p.kind === 'index') s += `<line x1="${sx(1)}" x2="${sx(1)}" y1="1" y2="17" stroke="var(--ink-3)" stroke-width="1"/>`;
  if (p.mark != null) s += `<line x1="${sx(p.mark)}" x2="${sx(p.mark)}" y1="1" y2="17" stroke="var(--ink-3)" stroke-width="1" stroke-dasharray="2 2"/>`;
  s += `<circle cx="${sx(v)}" cy="9" r="5.5" fill="${STATUS_COLOR[st]}" stroke="var(--surface)" stroke-width="2"/>`;
  return `<svg class="bar" viewBox="0 0 ${W} 18" aria-hidden="true">${s}</svg>`;
}

function markNote(p) {
  if (p.key === 'proteinuria') return ` · ┆ ${S.nephroticMark} ≥ ${nf(3.5, 1)} g/24 h`;
  if (p.key === 'diuresis') return ` · ┆ ${S.oliguriaMark} < 400 mL/24 h`;
  return '';
}

function renderLabs(labs, age, { onlyAbnormal = false } = {}) {
  let html = '';
  for (const g of M.PARAM_GROUPS) {
    const rows = M.PARAMS.filter((p) => p.group === g).filter((p) => !onlyAbnormal || M.isAbnormal(p.key, labs[p.key], age));
    if (!rows.length) continue;
    html += `<div class="lgroup"><h4>${esc(S.paramGroups[g])}</h4>`;
    for (const p of rows) {
      const v = labs[p.key];
      const st = M.status(p.key, v, age);
      const abn = !['normal', 'neg'].includes(st);
      html += `<div class="lrow${abn ? ' abn' : ''}" data-param="${p.key}" data-status="${st}">` +
        `<span class="lname">${esc(S.params[p.key])}</span>` +
        `<span class="lbar" title="${esc(S.normalIs(normalText(p, age)) + markNote(p))}">${barSvg(p, v, age)}</span>` +
        `<span class="lval">${p.kind === 'qual' ? '' : esc(valueText(p, v))}</span>${badge(st, p)}` +
        `<span class="lnorm">${esc(S.normalIs(normalText(p, age)))}</span></div>`;
    }
    html += '</div>';
  }
  return html;
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------
function treeHtml({ answer = false } = {}) {
  let html = `<h3>${esc(S.tree)}</h3><div class="troot">${esc(S.treeRoot)}</div>`;
  for (const b of M.TREE) {
    html += `<div class="tbranch tb-${b.group}"><div class="tgroup">${esc(S.groups[b.group])}</div><div class="tents">`;
    for (const id of b.ids) {
      let cls = '';
      let pressed = '';
      if (answer) {
        const q = state.quiz;
        if (q.choice) {
          if (id === currentCase().entity) cls = ' right';
          else if (id === q.choice) cls = ' wrong';
        }
      } else pressed = ` aria-pressed="${id === state.entity}"`;
      html += `<button type="button" class="ent${cls}" data-ent="${id}"${pressed}${answer && state.quiz.choice ? ' disabled' : ''}>${esc(S.entities[id].short)}</button>`;
    }
    html += '</div></div>';
  }
  html += `<p class="tnote">${esc(S.treeNote)}</p>`;
  return html;
}

function chipsHtml(id) {
  const e = M.ENTITIES[id];
  let h = `<span class="chip">${esc(S.mechanisms[e.mechanism])}</span>`;
  h += `<span class="chip">${esc(S.pathways[e.pathway])}</span>`;
  if (e.gnrpType) h += `<span class="chip chip-strong">${esc(S.gnrpType(e.gnrpType))}</span>`;
  return h;
}

function reactantsHtml(id) {
  const r = M.ENTITIES[id].if.reactants;
  return Object.entries(r).map(([k, n]) => `<span class="chip chip-if">${esc(k === 'fibrin' ? (lang === 'es' ? 'Fibrina' : 'Fibrin') : k)} ${'+'.repeat(n)}</span>`).join('');
}

function glomSvg(id, crescent, prefix) {
  return renderGlomerulus(M.ENTITIES[id], { titles: S.layers, crescent, idPrefix: prefix, label: `${S.glomerulus}: ${S.entities[id].name}` });
}

function ifSvg(id, prefix) {
  return renderIF(M.ENTITIES[id].if.pattern, { idPrefix: prefix, label: `${S.ifTitle}: ${S.ifPatterns[M.ENTITIES[id].if.pattern]}` });
}

const CAT = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)'];

// ---------------------------------------------------------------------------
// Explore
// ---------------------------------------------------------------------------
function currentCrescent() {
  if (timeKind(state.entity) !== 'crescent') return null;
  const st = M.crescentAt(state.entity, state.sc.day, modelArgs(state.sc));
  return { cellular: st.cellular, fibrous: st.fibrous };
}

function currentLabs() {
  if (state.mode === 'quiz') return currentCase().labs;
  return M.labsFor(state.entity, modelArgs(state.sc));
}

function renderExploreShell() {
  const id = state.entity;
  const e = M.ENTITIES[id];
  const T = S.entities[id];
  const k = timeKind(id);
  let side = `<div class="ifbox">${ifSvg(id, 'ifx')}<div><h4>${esc(S.ifTitle)}</h4><p>${esc(S.ifPatterns[e.if.pattern])}</p><div class="chips">${reactantsHtml(id)}</div></div></div>`;
  side += `<h4>${esc(S.lmTitle)}</h4><p>${esc(T.lm)}</p><h4>${esc(S.emTitle)}</h4><p>${esc(T.em)}</p>`;
  if (e.anca) {
    const keys = ['PR3', 'MPO', 'neg'];
    side += `<h4>${esc(S.ancaTitle)}</h4><div class="ancabar" role="img" aria-label="${esc(keys.map((kk) => `${S.ancaKeys[kk]} ${e.anca[kk]} %`).join(', '))}">` +
      keys.map((kk, i) => `<span style="flex:${e.anca[kk]};background:${['var(--c1)', 'var(--c2)', 'var(--neutral)'][i]}" title="${esc(S.ancaKeys[kk])}: ${e.anca[kk]} %"></span>`).join('') +
      `</div><div class="legend">${keys.map((kk, i) => `<span class="lg"><i style="background:${['var(--c1)', 'var(--c2)', 'var(--neutral)'][i]}"></i>${esc(S.ancaKeys[kk])} ${e.anca[kk]} %</span>`).join('')}</div>`;
  }
  side += `<h4>${esc(S.txTitle)}</h4><p>${esc(T.tx)}</p><h4>${esc(S.progTitle)}</h4><p>${esc(T.prog)}</p>`;

  let time = '';
  if (k === 'gnape') {
    time = `<div class="controls">
      <label class="slider"><span>${esc(S.dayAfterInfection)}: <output id="dayOut"></output></span><input type="range" id="day" min="0" max="200" step="1"></label>
      <fieldset class="seg"><legend>${esc(S.site)}</legend>${['pharynx', 'skin'].map((s) => `<label><input type="radio" name="site" value="${s}"> ${esc(S.sites[s])}</label>`).join('')}</fieldset>
      <label class="check"><input type="checkbox" id="atypical"> ${esc(S.atypical)}</label>
      <button type="button" class="btn" id="tplay">${esc(S.play)}</button></div>`;
  } else if (k === 'iga') {
    time = `<div class="controls"><label class="slider"><span>${esc(S.dayAfterPharyngitis)}: <output id="dayOut"></output></span><input type="range" id="day" min="0" max="14" step="0.5"></label>
      <button type="button" class="btn" id="tplay">${esc(S.play)}</button></div>`;
  } else if (k === 'crescent') {
    time = `<div class="controls">
      <label class="slider"><span>${esc(S.dayFromOnset)}: <output id="dayOut"></output></span><input type="range" id="day" min="0" max="120" step="1"></label>
      <label class="slider"><span>${esc(S.txDay)}: <output id="txOut"></output></span><input type="range" id="tx" min="0" max="60" step="1"></label>
      <label class="check"><input type="checkbox" id="notx"> ${esc(S.noTx)}</label>
      <button type="button" class="btn" id="tplay">${esc(S.play)}</button></div>`;
  }
  const timeCard = k
    ? `<section class="card a-time"><h3>${esc(S.timeTitle)} <span class="tag" title="${esc(S.footerModel)}">${esc(S.modelTag)}</span></h3>${time}<p class="live" id="live" aria-live="polite"></p><p class="note" id="tnote"></p><div class="charts" id="charts"></div></section>`
    : `<section class="card a-time"><h3>${esc(S.timeTitle)}</h3><p class="note">${esc(S.noTimeModel)}</p></section>`;

  $('#app').innerHTML = `<div class="g-explore">
    <aside class="card a-tree" id="tree">${treeHtml()}</aside>
    <section class="card a-glom"><h2 id="entName" tabindex="-1">${esc(T.name)}</h2><div class="chips">${chipsHtml(id)}</div>
      <div class="signs"><span class="muted small">${esc(S.features.signs)}:</span> ${e.clinical.signs.length ? e.clinical.signs.map((sg) => `<span class="chip chip-sign">${esc(S.signs[sg])}</span>`).join('') : `<span class="small">${esc(S.noExtrarenal)}</span>`}</div>
      <div class="glomwrap" id="glom"></div><div class="layerlegend" id="layerLegend"></div></section>
    <section class="card a-steps"><div class="rowhead"><h3>${esc(S.pathogenesis)}</h3><div><button type="button" class="btn" id="splay">${esc(S.play)}</button> <button type="button" class="btn ghost" id="sall">${esc(S.allLayers)}</button></div></div><ol class="steps" id="steps"></ol></section>
    <section class="card a-side">${side}</section>
    ${timeCard}
    <section class="card a-labs"><div class="rowhead"><h3>${esc(S.labsTitle)}</h3><label class="check"><input type="checkbox" id="onlyAbn"> ${esc(S.onlyAbnormal)}</label></div><p class="note">${esc(S.labsNote)}</p><div id="labs" class="labs"></div></section>
  </div>`;

  // steps
  $('#steps').innerHTML = T.steps.map(([layer, txt], i) => `<li><button type="button" class="stepbtn" data-i="${i}" data-layer="${layer}"><span class="sn">${i + 1}</span><span>${esc(txt)}</span></button></li>`).join('');
  // legend
  const layers = layersOf(e);
  const anat = ['lumen', 'endothelium', 'gbm', 'podocyte', 'mesangium', 'bowman'];
  $('#layerLegend').innerHTML = `<div class="lgtitle">${esc(S.legend)}</div><div class="lgs">` +
    layers.map((l) => `<button type="button" class="lgbtn" data-layer="${l}"><i style="background:${swatchFor(e, l)}"></i>${esc(l === 'circulating' ? `${S.layers.circulating}: ${S.circulatingWhat[e.visual.circulating]}` : S.layers[l])}</button>`).join('') +
    `</div><div class="lgs anat">${anat.map((l) => `<span class="lg"><i style="background:${swatchFor(e, l)}"></i>${esc(S.layers[l])}</span>`).join('')}</div>`;

  // controls
  const day = $('#day');
  if (day) {
    day.value = state.sc.day;
    day.addEventListener('input', () => { stopTime(); state.sc.day = Number(day.value); updateExplore(); });
  }
  const tx = $('#tx');
  if (tx) {
    tx.value = state.sc.txDay;
    tx.addEventListener('input', () => { state.sc.txDay = Number(tx.value); state.sc.noTx = false; $('#notx').checked = false; updateExplore(); });
  }
  const notx = $('#notx');
  if (notx) { notx.checked = !!state.sc.noTx; notx.addEventListener('change', () => { state.sc.noTx = notx.checked; updateExplore(); }); }
  $$('input[name=site]').forEach((r) => {
    r.checked = r.value === state.sc.site;
    r.addEventListener('change', () => { state.sc.site = r.value; updateExplore(); });
  });
  const aty = $('#atypical');
  if (aty) { aty.checked = !!state.sc.atypical; aty.addEventListener('change', () => { state.sc.atypical = aty.checked; updateExplore(); }); }
  $('#tplay')?.addEventListener('click', toggleTimePlay);
  $('#onlyAbn').checked = state.onlyAbnormal;
  $('#onlyAbn').addEventListener('change', (ev) => { state.onlyAbnormal = ev.target.checked; updateExplore(); });
  $('#tree').addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-ent]');
    if (!b) return;
    selectEntity(b.dataset.ent);
  });
  $('#steps').addEventListener('click', (ev) => {
    const b = ev.target.closest('.stepbtn');
    if (!b) return;
    stopSteps();
    setHighlight(b.dataset.layer, Number(b.dataset.i));
  });
  $('#layerLegend').addEventListener('click', (ev) => {
    const b = ev.target.closest('.lgbtn');
    if (!b) return;
    stopSteps();
    setHighlight(state.highlight === b.dataset.layer ? null : b.dataset.layer, null);
  });
  $('#sall').addEventListener('click', () => { stopSteps(); setHighlight(null, null); });
  $('#splay').addEventListener('click', toggleSteps);
  updateExplore();
}

function applyHighlight() {
  const svg = $('#glom svg');
  if (!svg) return;
  svg.classList.toggle('hl', !!state.highlight);
  $$('g[data-layer]', svg).forEach((g) => g.classList.toggle('on', g.dataset.layer === state.highlight));
  $$('.stepbtn').forEach((b) => b.classList.toggle('on', Number(b.dataset.i) === state.step));
  $$('.lgbtn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.layer === state.highlight)));
}

function setHighlight(layer, step) {
  state.highlight = layer;
  state.step = step;
  applyHighlight();
}

function toggleSteps() {
  if (stepTimer) { stopSteps(); return; }
  const steps = S.entities[state.entity].steps;
  let i = state.step == null ? -1 : state.step;
  const tick = () => {
    i = (i + 1) % steps.length;
    setHighlight(steps[i][0], i);
  };
  tick();
  stepTimer = setInterval(tick, 2600);
  $('#splay').textContent = S.stop;
}

function stopSteps() {
  if (stepTimer) clearInterval(stepTimer);
  stepTimer = null;
  const b = $('#splay');
  if (b) b.textContent = S.play;
}

function toggleTimePlay() {
  if (timeTimer) { stopTime(); return; }
  const k = timeKind(state.entity);
  const max = k === 'gnape' ? 200 : k === 'iga' ? 14 : 120;
  const step = k === 'iga' ? 0.5 : k === 'gnape' ? 2 : 1;
  if (state.sc.day >= max) state.sc.day = 0;
  timeTimer = setInterval(() => {
    state.sc.day = Math.min(max, state.sc.day + step);
    const d = $('#day');
    if (d) d.value = state.sc.day;
    updateExplore();
    if (state.sc.day >= max) stopTime();
  }, 70);
  $('#tplay').textContent = S.stop;
}

function stopTime() {
  if (timeTimer) clearInterval(timeTimer);
  timeTimer = null;
  const b = $('#tplay');
  if (b) b.textContent = S.play;
}

function gnapePhase(day, site, atypical) {
  const L = M.GNAPE.latency[site];
  const s = day - L;
  if (s < 0) return 'latency';
  if (atypical && s >= 56) return 'atypical';
  if (s < 10) return 'active';
  if (s < 42) return 'resolving';
  const labs = M.gnapeLabs(day, { site, atypical });
  if (M.status('c3', labs.c3) === 'low') return 'c3';
  if (labs.hematuria > 3 || M.status('proteinuria', labs.proteinuria) === 'high') return 'micro';
  return 'normal';
}

const fmtDay = (v, tick) => (tick ? nf(v) : S.dayN(nf(v, Number.isInteger(v) ? 0 : 1)));

function updateExplore() {
  const id = state.entity;
  const k = timeKind(id);
  const sc = state.sc;
  const age = M.ageOf(id);
  $('#glom').innerHTML = glomSvg(id, currentCrescent(), 'gx');
  applyHighlight();
  $('#labs').innerHTML = renderLabs(currentLabs(), age, { onlyAbnormal: state.onlyAbnormal });
  if ($('#dayOut')) $('#dayOut').textContent = nf(sc.day, Number.isInteger(sc.day) ? 0 : 1);
  if ($('#txOut')) $('#txOut').textContent = sc.noTx ? '—' : nf(sc.txDay);
  const charts = $('#charts');
  if (k === 'gnape') {
    const L = M.GNAPE.latency[sc.site];
    $('#live').textContent = S.gnapeLive({ phase: gnapePhase(sc.day, sc.site, sc.atypical), day: nf(sc.day), onset: L });
    $('#tnote').textContent = sc.site === 'skin' ? S.gnapeSkinNote : '';
    charts.innerHTML = '<div class="chart" id="ch1"></div>';
    const x = Array.from({ length: 201 }, (_, i) => i);
    lineChart($('#ch1'), {
      title: S.gnapeChart, x, yMin: 0, yMax: 100, xLabel: S.dayAfterInfection, yLabel: '%',
      series: M.GNAPE_SERIES.map((key, i) => ({ name: S.gnapeSeries[key], color: CAT[i], values: x.map((d) => M.gnapeDeviation(key, d, sc)) })),
      markers: [{ x: 0, label: S.markers.infection }, { x: L, label: S.markers.onset }],
      cursor: sc.day, fmtX: fmtDay, fmtY: (v) => `${nf(v)} %`, tableSummary: S.tableView,
    });
  } else if (k === 'iga') {
    const h = M.igaHematuria(sc.day);
    $('#live').textContent = S.igaLive({ day: nf(sc.day, Number.isInteger(sc.day) ? 0 : 1), macro: h > 50 });
    $('#tnote').textContent = '';
    charts.innerHTML = '<div class="chart" id="ch1"></div>';
    const x = Array.from({ length: 57 }, (_, i) => i / 4);
    lineChart($('#ch1'), {
      title: S.igaChart, x, yMin: 0, yMax: 100, xLabel: S.dayAfterPharyngitis, yLabel: S.units.hematuria,
      series: [{ name: S.params.hematuria, color: CAT[0], values: x.map((d) => M.igaHematuria(d)) }],
      markers: [{ x: 0, label: S.markers.infection }], hlines: [{ y: 3, label: S.normalIs('≤ 3') }],
      cursor: sc.day, fmtX: fmtDay, fmtY: (v) => nf(v), tableSummary: S.tableView,
    });
  } else if (k === 'crescent') {
    const args = modelArgs(sc);
    const st = M.crescentAt(id, sc.day, args);
    const txt = sc.noTx ? S.txNone : sc.day < sc.txDay ? S.txPending(sc.txDay) : S.txFrom(sc.txDay);
    const out = M.crescentOutcome(id, args);
    const noTx = M.crescentAt(id, M.CRESCENT.days, { txDay: null });
    $('#live').textContent = S.crescentLive({ day: nf(sc.day), cres: nf(st.cellular + st.fibrous), fib: nf(st.fibrous), egfr: nf(st.egfr), tx: txt });
    $('#tnote').textContent = `${S.outcome({ days: M.CRESCENT.days, egfr: nf(out.egfr), fib: nf(out.fibrous), dialysis: out.dialysis })} ${sc.noTx ? '' : S.outcomeNoTx({ days: M.CRESCENT.days, egfr: nf(noTx.egfr) })} ${S.crescentNote}`;
    charts.innerHTML = '<div class="chart" id="ch1"></div><div class="chart" id="ch2"></div>';
    const m = M.crescentModel(id, args);
    const mNo = M.crescentModel(id, { txDay: null });
    const marks = sc.noTx ? [] : [{ x: sc.txDay, label: S.markers.tx, cls: 'vline tx' }];
    stackedArea($('#ch1'), {
      title: S.glomeruliChart, x: m.day, xLabel: S.dayFromOnset, yLabel: '%',
      series: [
        { name: S.glomeruliSeries.fibrous, color: 'var(--c1)', values: m.fibrous },
        { name: S.glomeruliSeries.cellular, color: 'var(--c2)', values: m.cellular },
        { name: S.glomeruliSeries.normal, color: 'var(--c3)', values: m.normal },
      ],
      markers: marks, cursor: sc.day, fmtX: fmtDay, fmtY: (v) => `${nf(v)} %`, tableSummary: S.tableView,
    });
    const ser = [{ name: S.egfrSeries.tx, color: CAT[0], values: m.egfr }];
    if (!sc.noTx) ser.push({ name: S.egfrSeries.notx, color: 'var(--ink-3)', dash: true, values: mNo.egfr });
    else ser[0].name = S.egfrSeries.notx;
    lineChart($('#ch2'), {
      title: S.egfrChart, x: m.day, yMin: 0, yMax: 110, xLabel: S.dayFromOnset, yLabel: S.units.egfr,
      series: ser, markers: marks, hlines: [{ y: M.CRESCENT.dialysis, label: S.dialysisLine }],
      cursor: sc.day, fmtX: fmtDay, fmtY: (v) => nf(v), tableSummary: S.tableView,
    });
  }
  writeUrl();
}

function selectEntity(id) {
  stopSteps(); stopTime();
  state.entity = id;
  state.sc = defaultScenario(id);
  state.highlight = null; state.step = null;
  renderExploreShell();
  $('#entName')?.focus?.();
}

// ---------------------------------------------------------------------------
// Compare
// ---------------------------------------------------------------------------
function entitySelect(idAttr, value) {
  return `<select id="${idAttr}">${M.TREE.map((b) => `<optgroup label="${esc(S.groups[b.group])}">${b.ids.map((id) => `<option value="${id}"${id === value ? ' selected' : ''}>${esc(S.entities[id].name)}</option>`).join('')}</optgroup>`).join('')}</select>`;
}

function featureText(f, id) {
  const e = M.ENTITIES[id];
  switch (f) {
    case 'mechanism': return S.mechanisms[e.mechanism];
    case 'pathway': return S.pathways[e.pathway];
    case 'ifPattern': return S.ifPatterns[e.if.pattern];
    case 'deposits': return M.depositSites(id).map((d) => S.deposits[d]).join(' · ');
    case 'latency': return S.latencyText(e.clinical.latency);
    case 'signs': return e.clinical.signs.length ? e.clinical.signs.map((s) => S.signs[s]).join(' · ') : S.none;
    case 'gnrpType': return e.gnrpType ? S.gnrpType(e.gnrpType) : S.none;
    default: return '';
  }
}

function renderCompare() {
  const { a, b, onlyDiff } = state.cmp;
  const scA = modelArgs(defaultScenario(a)), scB = modelArgs(defaultScenario(b));
  const c = M.compare(a, b, scA, scB);
  const nDiff = c.labs.filter((r) => r.differs).length + c.features.filter((r) => r.differs).length;
  const ageA = M.ageOf(a), ageB = M.ageOf(b);
  const crA = M.ENTITIES[a].gnrp ? M.crescentAt(a, scA.day, scA) : null;
  const crB = M.ENTITIES[b].gnrp ? M.crescentAt(b, scB.day, scB) : null;
  const col = (id, cr, p) => `<section class="card cmpcol"><h2>${esc(S.entities[id].name)}</h2><div class="chips">${chipsHtml(id)}</div>
      <div class="cmpvis"><div class="glomwrap">${glomSvg(id, cr, p + 'g')}</div><div class="ifcol">${ifSvg(id, p + 'i')}<p class="small">${esc(S.ifPatterns[M.ENTITIES[id].if.pattern])}</p></div></div></section>`;
  const feats = c.features.filter((r) => !onlyDiff || r.differs).map((r) => `<tr class="${r.differs ? 'diff' : ''}"><th scope="row">${r.differs ? '<span class="neq" aria-hidden="true">≠</span> ' : ''}${esc(S.features[r.key])}</th><td>${esc(featureText(r.key, a))}</td><td>${esc(featureText(r.key, b))}</td><td>${r.differs ? `<span class="st st-pos">${esc(S.differs)}</span>` : `<span class="muted">${esc(S.same)}</span>`}</td></tr>`).join('');
  const labs = c.labs.filter((r) => !onlyDiff || r.differs).map((r) => {
    const p = M.paramByKey[r.key];
    return `<tr class="${r.differs ? 'diff' : ''}" data-param="${r.key}"><th scope="row">${r.differs ? '<span class="neq" aria-hidden="true">≠</span> ' : ''}${esc(S.params[r.key])}<div class="small muted">${esc(S.normalIs(normalText(p, 'adult')))}</div></th>` +
      `<td>${p.kind === 'qual' ? '' : esc(valueText(p, r.a))} ${badge(r.statusA, p)}</td><td>${p.kind === 'qual' ? '' : esc(valueText(p, r.b))} ${badge(r.statusB, p)}</td></tr>`;
  }).join('');
  const hemIds = ['gnape', 'igan', 'igav'];
  const showHem = hemIds.includes(a) && hemIds.includes(b) && a !== b;
  $('#app').innerHTML = `<div class="g-compare">
    <section class="card cmpctl">
      <label>${esc(S.entityA)} ${entitySelect('selA', a)}</label>
      <button type="button" class="btn ghost" id="swap" aria-label="⇄">⇄</button>
      <label>${esc(S.entityB)} ${entitySelect('selB', b)}</label>
      <label class="check"><input type="checkbox" id="onlyDiff"${onlyDiff ? ' checked' : ''}> ${esc(S.onlyDiff)}</label>
      <span class="diffcount">${esc(S.diffCount(nDiff))}</span>
    </section>
    <div class="cmpcols">${col(a, crA, 'a')}${col(b, crB, 'b')}</div>
    <section class="card"><h3>${esc(S.featuresTitle)}</h3><div class="tblwrap"><table class="cmp fcmp"><thead><tr><th></th><th>${esc(S.entities[a].short)}</th><th>${esc(S.entities[b].short)}</th><th></th></tr></thead><tbody>${feats}</tbody></table></div></section>
    ${showHem ? '<section class="card"><div class="chart" id="hemchart"></div></section>' : ''}
    <section class="card"><h3>${esc(S.labsTitle)}</h3><p class="note">${esc(S.labsNote)}</p><div class="tblwrap"><table class="cmp labs-cmp"><thead><tr><th></th><th>${esc(S.entities[a].short)}${ageA === 'child' ? ` (${esc(S.ageGroups.child)})` : ''}</th><th>${esc(S.entities[b].short)}${ageB === 'child' ? ` (${esc(S.ageGroups.child)})` : ''}</th></tr></thead><tbody>${labs}</tbody></table></div></section>
  </div>`;
  $('#selA').addEventListener('change', (ev) => { state.cmp.a = ev.target.value; renderCompare(); });
  $('#selB').addEventListener('change', (ev) => { state.cmp.b = ev.target.value; renderCompare(); });
  $('#swap').addEventListener('click', () => { [state.cmp.a, state.cmp.b] = [state.cmp.b, state.cmp.a]; renderCompare(); });
  $('#onlyDiff').addEventListener('change', (ev) => { state.cmp.onlyDiff = ev.target.checked; renderCompare(); });
  if (showHem) {
    const x = Array.from({ length: 41 }, (_, i) => i);
    const hem = (id) => x.map((d) => (id === 'gnape' ? M.gnapeLabs(d, { site: 'pharynx' }).hematuria : M.igaHematuria(d)));
    lineChart($('#hemchart'), {
      title: S.hemCompareChart, x, yMin: 0, yMax: 100, xLabel: S.dayAfterPharyngitis, yLabel: S.units.hematuria,
      series: [{ name: S.entities[a].short, color: CAT[0], values: hem(a) }, { name: S.entities[b].short, color: CAT[1], values: hem(b) }],
      markers: [{ x: 0, label: S.markers.infection }], fmtX: fmtDay, fmtY: (v) => nf(v), tableSummary: S.tableView,
    });
  }
  writeUrl();
}

// ---------------------------------------------------------------------------
// Quiz
// ---------------------------------------------------------------------------
let caseCache = null;
function currentCase() {
  if (state.quiz.seed == null) state.quiz.seed = Math.floor(Math.random() * 1e6);
  if (!caseCache || caseCache.seed !== state.quiz.seed) caseCache = M.generateCase(state.quiz.seed);
  return caseCache;
}

function renderQuiz() {
  const c = currentCase();
  const q = state.quiz;
  const vig = [`<li>${esc(S.ageGroups[c.age])}</li>`];
  if (c.latency != null) vig.push(`<li>${esc(S.latencyAfter(c.latency, c.site))}</li>`);
  if (c.signs.length) for (const s of c.signs) vig.push(`<li>${esc(S.signs[s])}</li>`);
  else vig.push(`<li>${esc(S.noExtrarenal)}</li>`);
  let feedback = '';
  if (q.choice) {
    const ok = q.choice === c.entity;
    const f = M.findingsFrom(c.entity, c.labs, { latency: c.latency });
    const r = M.classify(f);
    const cr = M.ENTITIES[c.entity].gnrp ? { cellular: 40, fibrous: 15 } : null;
    feedback = `<section class="card a-feedback" aria-live="polite"><h3 class="${ok ? 'ok' : 'ko'}">${esc(ok ? S.correct : S.wrong(S.entities[c.entity].name))}</h3>
      <h4>${esc(S.reasoning)}</h4><ol class="reason">${r.steps.map((k) => `<li>${esc(S.steps[k])}</li>`).join('')}</ol>
      <h4>${esc(S.reveal)}: ${esc(S.entities[c.entity].name)}</h4><div class="glomwrap small-glom">${glomSvg(c.entity, cr, 'qg')}</div>
      <p><a class="btn" href="?lang=${lang}&mode=explore&entity=${c.entity}">${esc(S.openExplore)}</a></p></section>`;
  }
  $('#app').innerHTML = `<div class="g-quiz">
    <section class="card a-case"><div class="rowhead"><h2>${esc(S.caseTitle(q.n))}</h2><div><span class="score">${esc(S.score(q.ok, q.total))}</span> <button type="button" class="btn" id="newCase">${esc(S.newCase)}</button></div></div>
      <h4>${esc(S.vignette)}</h4><ul class="vig">${vig.join('')}</ul>
      <div class="ifbox">${ifSvg(c.entity, 'qi').replace(/aria-label="[^"]*"/, `aria-label="${esc(S.biopsyIf)}"`)}<div><h4>${esc(S.biopsyIf)}</h4><p>${esc(S.ifPatterns[c.ifPattern])}</p></div></div></section>
    <aside class="card a-tree" id="tree"><p class="ask">${esc(S.whichDx)}</p>${treeHtml({ answer: true })}</aside>
    ${feedback}
    <section class="card a-labs"><div class="rowhead"><h3>${esc(S.labsTitle)}</h3><label class="check"><input type="checkbox" id="onlyAbn"${state.onlyAbnormal ? ' checked' : ''}> ${esc(S.onlyAbnormal)}</label></div><p class="note">${esc(S.labsNote)}</p><div class="labs">${renderLabs(c.labs, c.age, { onlyAbnormal: state.onlyAbnormal })}</div></section>
  </div>`;
  $('#newCase').addEventListener('click', () => {
    state.quiz.seed = Math.floor(Math.random() * 1e6);
    state.quiz.n += 1;
    state.quiz.choice = null;
    renderQuiz();
  });
  $('#onlyAbn').addEventListener('change', (ev) => { state.onlyAbnormal = ev.target.checked; renderQuiz(); });
  $('#tree').addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-ent]');
    if (!b || state.quiz.choice) return;
    state.quiz.choice = b.dataset.ent;
    state.quiz.total += 1;
    if (b.dataset.ent === c.entity) state.quiz.ok += 1;
    renderQuiz();
    $('.a-feedback h3')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  writeUrl();
}

// ---------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------
function renderFrame() {
  document.documentElement.lang = lang;
  document.title = S.title;
  $('#title').textContent = S.title;
  $('#subtitle').textContent = S.subtitle;
  $('#footer').textContent = S.footer;
  $('#footerModel').textContent = S.footerModel;
  $('#copy').textContent = S.copyLink;
  $$('.langbtn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  $$('.tab').forEach((b) => {
    b.textContent = S.modes[b.dataset.mode];
    b.setAttribute('aria-selected', String(b.dataset.mode === state.mode));
  });
  $('#hint').textContent = S.modesHint[state.mode];
}

function render() {
  stopSteps(); stopTime();
  renderFrame();
  if (state.mode === 'explore') renderExploreShell();
  else if (state.mode === 'compare') renderCompare();
  else renderQuiz();
}

function init() {
  readUrl();
  $$('.langbtn').forEach((b) => b.addEventListener('click', () => {
    if (!LANGS.includes(b.dataset.lang)) return;
    lang = b.dataset.lang; S = STRINGS[lang];
    store.set('ng-lang', lang);
    render();
  }));
  $$('.tab').forEach((b) => b.addEventListener('click', () => {
    state.mode = b.dataset.mode;
    render();
  }));
  $('#copy').addEventListener('click', async () => {
    writeUrl();
    try { await navigator.clipboard.writeText(location.href); } catch { /* clipboard blocked */ }
    const btn = $('#copy');
    btn.textContent = S.copied;
    setTimeout(() => { btn.textContent = S.copyLink; }, 1500);
  });
  render();
}

window.__sim = {
  get state() { return state; },
  get lang() { return lang; },
  model: M,
  labs: () => currentLabs(),
  quizCase: () => currentCase(),
  set(patch) { Object.assign(state, patch); render(); },
  render,
};

init();

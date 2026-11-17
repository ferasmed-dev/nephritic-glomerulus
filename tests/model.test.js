import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as m from '../src/model.js';

const all = m.ENTITY_IDS;

test('every entity sits in exactly one branch of the tree', () => {
  const inTree = m.TREE.flatMap((b) => b.ids);
  assert.equal(inTree.length, all.length);
  assert.deepEqual([...inTree].sort(), [...all].sort());
  for (const b of m.TREE) for (const id of b.ids) assert.equal(m.ENTITIES[id].group, b.group);
});

test('typical labs are finite and inside the display range', () => {
  for (const id of all) {
    const labs = m.typicalLabs(id);
    for (const p of m.PARAMS) {
      const v = labs[p.key];
      assert.ok(Number.isFinite(v), `${id}.${p.key} finite`);
      assert.ok(v >= 0, `${id}.${p.key} not negative`);
      if (p.kind === 'quant') assert.ok(v <= p.max, `${id}.${p.key} <= display max`);
      if (p.kind === 'index') assert.ok(v <= m.INDEX_MAX);
    }
  }
});

test('status: normal ranges and cut-offs', () => {
  assert.equal(m.status('c3', 120), 'normal');
  assert.equal(m.status('c3', 40), 'low');
  assert.equal(m.status('c4', 5), 'low');
  assert.equal(m.status('aslo', 600), 'high');
  assert.equal(m.status('egfr', 95), 'normal');
  assert.equal(m.status('egfr', 30), 'low');
  assert.equal(m.status('proteinuria', 1), 'high');
  assert.equal(m.status('antigbm', 0.4), 'neg');
  assert.equal(m.status('antigbm', 1), 'pos');
  assert.equal(m.status('cryo', 1), 'pos');
  assert.equal(m.status('edema', 0.2), 'normal', 'edema is graded in whole crosses');
  assert.equal(m.status('edema', 2), 'high');
  // children have a lower systolic limit
  assert.equal(m.status('sbp', 120, 'adult'), 'normal');
  assert.equal(m.status('sbp', 120, 'child'), 'high');
});

test('C3 splits the immune-complex branch', () => {
  for (const id of ['antigbm', 'goodpasture', 'igan', 'igav', 'gpa', 'mpa', 'egpa', 'rlv', 'double']) {
    assert.equal(m.status('c3', m.typicalLabs(id).c3), 'normal', `${id} C3 normal`);
  }
  for (const id of ['lupus', 'mpgn', 'c3g', 'endocarditis', 'cryo']) {
    assert.equal(m.status('c3', m.typicalLabs(id).c3), 'low', `${id} C3 low`);
  }
  assert.equal(m.status('c3', m.labsFor('gnape', { day: 14 }).c3), 'low');
});

test('C4: low in lupus and cryoglobulinemia, normal in post-streptococcal GN and C3 glomerulopathy', () => {
  assert.equal(m.status('c4', m.typicalLabs('lupus').c4), 'low');
  assert.equal(m.status('c4', m.typicalLabs('cryo').c4), 'low');
  assert.equal(m.status('c4', m.labsFor('gnape', { day: 14 }).c4), 'normal');
  assert.equal(m.status('c4', m.typicalLabs('c3g').c4), 'normal');
  assert.equal(m.ENTITIES.gnape.pathway, 'alternative');
  assert.equal(m.ENTITIES.lupus.pathway, 'classical');
});

test('signature serology and immunofluorescence', () => {
  assert.equal(m.ENTITIES.antigbm.if.pattern, 'linear');
  assert.equal(m.ENTITIES.goodpasture.if.pattern, 'linear');
  assert.equal(m.ENTITIES.igan.if.pattern, 'mesangialIgA');
  assert.equal(m.ENTITIES.gnape.if.pattern, 'starry');
  assert.equal(m.ENTITIES.lupus.if.pattern, 'fullHouse');
  assert.equal(m.ENTITIES.c3g.if.pattern, 'c3only');
  for (const id of ['gpa', 'mpa', 'egpa', 'rlv']) assert.equal(m.ENTITIES[id].if.pattern, 'negative');
  assert.ok(m.typicalLabs('gpa').pr3 >= 1);
  assert.ok(m.typicalLabs('mpa').mpo >= 1);
  const d = m.typicalLabs('double');
  assert.ok(d.antigbm >= 1 && d.mpo >= 1);
  assert.ok(m.typicalLabs('egpa').eos > 1.5);
  assert.ok(m.typicalLabs('c3g').c3nef >= 1);
});

test('ANCA frequencies add up to 100 % and follow the standard pattern', () => {
  for (const id of ['gpa', 'mpa', 'egpa', 'rlv']) {
    const a = m.ENTITIES[id].anca;
    assert.equal(a.PR3 + a.MPO + a.neg, 100, id);
  }
  assert.ok(m.ENTITIES.gpa.anca.PR3 > m.ENTITIES.gpa.anca.MPO);
  assert.ok(m.ENTITIES.mpa.anca.MPO > m.ENTITIES.mpa.anca.PR3);
  assert.ok(m.ENTITIES.egpa.anca.neg >= 50, 'most EGPA is ANCA-negative');
});

test('GNRP types: I anti-GBM, III pauci-immune, IV double', () => {
  assert.equal(m.ENTITIES.antigbm.gnrpType, 'I');
  assert.equal(m.ENTITIES.goodpasture.gnrpType, 'I');
  for (const id of ['gpa', 'mpa', 'egpa', 'rlv']) assert.equal(m.ENTITIES[id].gnrpType, 'III');
  assert.equal(m.ENTITIES.double.gnrpType, 'IV');
  assert.deepEqual(m.ENTITIES.goodpasture.clinical.signs, ['lung']);
  assert.deepEqual(m.ENTITIES.antigbm.clinical.signs, []);
});

test('rule engine recovers every entity from its typical findings', () => {
  for (const id of all) {
    const f = m.findingsFrom(id, m.labsFor(id, {}));
    const r = m.classify(f);
    assert.equal(r.entity, id, `${id} classified as ${r.entity}`);
    assert.ok(r.steps.length >= 2);
  }
});

test('rule engine recovers the entity from every generated quiz case', () => {
  for (let seed = 1; seed <= 600; seed++) {
    const c = m.generateCase(seed);
    const f = m.findingsFrom(c.entity, c.labs, { latency: c.latency });
    assert.equal(m.classify(f).entity, c.entity, `seed ${seed} (${c.entity})`);
  }
});

test('quiz cases are deterministic and cover every entity', () => {
  assert.deepEqual(m.generateCase(42), m.generateCase(42));
  const seen = new Set();
  for (let seed = 1; seed <= 400; seed++) seen.add(m.generateCase(seed).entity);
  assert.equal(seen.size, all.length);
  const c = m.generateCase(7, 'lupus');
  assert.equal(c.entity, 'lupus');
  for (const p of m.PARAMS) assert.ok(Number.isFinite(c.labs[p.key]));
});

test('post-streptococcal GN: latency ~10 days after pharyngitis, ~3 weeks after skin', () => {
  const before = m.gnapeLabs(8, { site: 'pharynx' });
  assert.equal(m.status('c3', before.c3), 'normal');
  assert.ok(before.hematuria <= 3);
  const after = m.gnapeLabs(13, { site: 'pharynx' });
  assert.equal(m.status('c3', after.c3), 'low');
  assert.ok(after.hematuria > 50 && after.casts === 1);
  // skin: still normal at day 14, nephritis by day 24
  assert.ok(m.gnapeLabs(14, { site: 'skin' }).hematuria <= 3);
  assert.ok(m.gnapeLabs(24, { site: 'skin' }).hematuria > 50);
});

test('post-streptococcal GN: recovery order matches the classic course', () => {
  const L = m.GNAPE.latency.pharynx;
  const at = (s) => m.gnapeLabs(L + s);
  assert.equal(at(11).edema, 0, 'edema gone by ~10 days');
  assert.ok(at(22).hematuria < 20, 'gross hematuria gone by ~3 weeks');
  assert.equal(m.status('sbp', at(22).sbp, 'child'), 'normal', 'hypertension gone by ~3 weeks');
  assert.equal(m.status('egfr', at(43).egfr), 'normal', 'renal function normal by ~6 weeks');
  assert.equal(m.status('c3', at(40).c3), 'low', 'C3 still low at ~6 weeks');
  assert.equal(m.status('c3', at(61).c3), 'normal', 'C3 normal by ~8 weeks');
  assert.ok(at(90).hematuria > 3, 'microhematuria persists for months');
  assert.ok(at(181).hematuria <= 3, 'microhematuria gone by ~6 months');
});

test('post-streptococcal GN: atypical course keeps C3 low', () => {
  const l = m.gnapeLabs(110, { atypical: true });
  assert.equal(m.status('c3', l.c3), 'low');
  assert.ok(l.hematuria > 3);
});

test('ASLO rises much more after pharyngitis than after skin infection', () => {
  const ph = m.gnapeLabs(35, { site: 'pharynx' }).aslo;
  const sk = m.gnapeLabs(35, { site: 'skin' }).aslo;
  assert.equal(m.status('aslo', ph), 'high');
  assert.ok(ph > 2 * sk);
});

test('deviation series stay within 0-100 %', () => {
  for (let d = 0; d <= 220; d += 5) {
    for (const k of m.GNAPE_SERIES) {
      const v = m.gnapeDeviation(k, d);
      assert.ok(v >= 0 && v <= 100, `${k}@${d}=${v}`);
    }
  }
});

test('IgA: gross hematuria 1-3 days after pharyngitis, then microhematuria', () => {
  assert.ok(m.igaHematuria(0) < 20);
  assert.ok(m.igaHematuria(2) > 70);
  const late = m.igaHematuria(10);
  assert.ok(late > 3 && late < 20);
});

test('crescent model: compartments sum to 100 % and never go negative', () => {
  for (const id of ['antigbm', 'gpa', 'egpa', 'double']) {
    for (const txDay of [null, 0, 7, 30]) {
      const r = m.crescentModel(id, { txDay });
      for (let i = 0; i < r.day.length; i++) {
        const sum = r.normal[i] + r.cellular[i] + r.fibrous[i];
        assert.ok(Math.abs(sum - 100) < 1e-6, `${id} sum ${sum}`);
        assert.ok(r.normal[i] >= -1e-9 && r.cellular[i] >= -1e-9 && r.fibrous[i] >= -1e-9);
        assert.ok(Number.isFinite(r.egfr[i]) && r.egfr[i] >= 0);
      }
    }
  }
});

test('crescent model: the later the treatment, the worse the outcome', () => {
  for (const id of ['goodpasture', 'gpa']) {
    const o = [3, 7, 14, 21, 35].map((tx) => m.crescentOutcome(id, { txDay: tx }).egfr);
    for (let i = 1; i < o.length; i++) assert.ok(o[i] < o[i - 1], `${id}: ${o}`);
    assert.ok(m.crescentOutcome(id, { txDay: null }).dialysis, 'untreated -> kidney failure');
  }
});

test('crescent model: anti-GBM progresses faster than ANCA, EGPA kidney involvement is milder', () => {
  const at = (id) => m.crescentAt(id, 14, { txDay: null }).egfr;
  assert.ok(at('goodpasture') < at('gpa'));
  assert.ok(at('gpa') < at('egpa'));
});

test('crescent model: treatment lets cellular crescents heal (eGFR recovers from its nadir)', () => {
  const r = m.crescentModel('gpa', { txDay: 14 });
  const nadir = Math.min(...r.egfr);
  assert.ok(r.egfr.at(-1) > nadir + 2);
  // fibrous crescents never heal
  for (let i = 1; i < r.day.length; i++) assert.ok(r.fibrous[i] >= r.fibrous[i - 1] - 1e-9);
});

test('compare marks the discriminating findings', () => {
  const c = m.compare('gnape', 'igan', { day: 14 }, { day: 2 });
  const row = (k) => c.labs.find((r) => r.key === k);
  assert.ok(row('c3').differs, 'C3 differs');
  assert.ok(row('aslo').differs, 'ASLO differs');
  assert.ok(row('iga').differs);
  assert.ok(!row('antigbm').differs);
  const f = (k) => c.features.find((r) => r.key === k);
  assert.ok(f('latency').differs && f('ifPattern').differs && f('pathway').differs);
  const same = m.compare('gpa', 'gpa');
  assert.ok(same.labs.every((r) => !r.differs));
});

test('every preset references valid entities and scenarios', () => {
  for (const [key, p] of Object.entries(m.PRESETS)) {
    assert.ok(['explore', 'compare', 'quiz'].includes(p.mode), key);
    if (p.mode === 'explore') assert.ok(m.ENTITIES[p.entity], key);
    if (p.mode === 'compare') assert.ok(m.ENTITIES[p.a] && m.ENTITIES[p.b], key);
    if (p.txDay != null) assert.ok(m.ENTITIES[p.entity].gnrp, `${key}: treatment only for GNRP`);
  }
});

test('preset behaviour', () => {
  const P = m.PRESETS;
  const lab = (k) => m.labsFor(P[k].entity, P[k]);
  assert.equal(m.status('c3', lab('faringitis-nino').c3), 'low');
  assert.ok(lab('faringitis-nino').hematuria > 50);
  assert.equal(m.status('aslo', lab('impetigo').aslo), 'normal', 'ASLO often normal after impetigo');
  assert.equal(m.status('c3', lab('c3-persistente').c3), 'low');
  assert.ok(lab('hematuria-sinfaringitica').hematuria > 70);
  const early = m.crescentOutcome('goodpasture', { txDay: P['hemoptisis-irpr'].txDay });
  const late = m.crescentOutcome('goodpasture', { txDay: P['goodpasture-tardio'].txDay });
  assert.ok(!early.dialysis && early.egfr > 60);
  assert.ok(late.dialysis);
});

test('model functions are pure', () => {
  const a = JSON.stringify(m.typicalLabs('lupus'));
  m.labsFor('lupus', { day: 3 });
  m.compare('lupus', 'mpgn');
  assert.equal(JSON.stringify(m.typicalLabs('lupus')), a);
  assert.deepEqual(m.crescentModel('gpa', { txDay: 7 }), m.crescentModel('gpa', { txDay: 7 }));
});

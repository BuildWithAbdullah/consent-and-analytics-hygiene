import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PAIRS } from '../tools/pairs.mjs';
import { PATTERNS_DIR, listDir, pairFiles } from '../tools/corpus.mjs';
import { auditFiles } from '../tools/audit-verdicts.mjs';
import { tokensOf } from '../src/findings.mjs';
import { KINDS, kindFor } from '../src/inputs.mjs';

function tokensFor(slug, role) {
  return tokensOf(auditFiles(pairFiles(slug, role)));
}

test('there are 21 pattern pairs', () => {
  assert.equal(PAIRS.length, 21);
});

test('the pairs between them exercise all five input kinds', () => {
  const seen = new Set(PAIRS.flatMap((pair) => pair.kinds));
  assert.deepEqual([...seen].sort(), [...KINDS].sort());
});

test('exactly one pair declares a residual finding', () => {
  // A residual field that is always empty is a field nothing tests. The one
  // pair that has one is a deliberate choice, and the suite requires the
  // finding to still be there.
  const withResidual = PAIRS.filter((pair) => pair.residual.length > 0);
  assert.equal(withResidual.length, 1);
  assert.equal(withResidual[0].slug, 'consent-passthrough-tradeoff');
});

for (const pair of PAIRS) {
  test(`${pair.slug}: the failing side produces exactly what it declares`, () => {
    // Exact, in both directions. An inclusion assertion hides every false
    // positive the corpus triggers, by construction.
    assert.deepStrictEqual(tokensFor(pair.slug, 'before'), [...pair.before].sort());
  });

  test(`${pair.slug}: the corrected side produces exactly its residual`, () => {
    assert.deepStrictEqual(tokensFor(pair.slug, 'after'), [...pair.residual].sort());
  });

  test(`${pair.slug}: both sides are on disk and of the declared kinds`, () => {
    const before = pairFiles(pair.slug, 'before');
    const after = pairFiles(pair.slug, 'after');
    assert.ok(before.length > 0, 'a failing side');
    assert.ok(after.length > 0, 'a corrected side');
    const kinds = new Set([...before, ...after].map((path) => kindFor(path)));
    assert.deepEqual([...kinds].sort(), [...pair.kinds].sort());
  });

  test(`${pair.slug}: the corrected side is not the failing side`, () => {
    const before = pairFiles(pair.slug, 'before').map((path) => readFileSync(path, 'utf8'));
    const after = pairFiles(pair.slug, 'after').map((path) => readFileSync(path, 'utf8'));
    assert.notDeepEqual(before, after);
  });

  test(`${pair.slug}: the pair says what it is about`, () => {
    assert.ok(pair.about.length > 30, 'the description says something');
    assert.ok(pair.about.endsWith('.'), 'the description is a sentence');
  });
}

test('the manifest and the directory hold the same pairs', () => {
  const onDisk = [...new Set(listDir(PATTERNS_DIR).map((name) => name.split('.')[0]))];
  assert.deepEqual(onDisk.sort(), PAIRS.map((pair) => pair.slug).sort());
});

test('every artefact in the directory is named slug.role.kind', () => {
  const roles = new Set(['before', 'after']);
  for (const name of listDir(PATTERNS_DIR)) {
    const parts = name.split('.');
    assert.ok(parts.length >= 3, `${name} has a slug, a role and a kind`);
    assert.ok(roles.has(parts[1]), `${name} names a role`);
    assert.ok(kindFor(name) !== null, `${name} names a kind`);
  }
});

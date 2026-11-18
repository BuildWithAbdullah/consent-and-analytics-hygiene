import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { FIXTURES } from '../tools/fixtures.mjs';
import { FIXTURES_DIR, fixtureFile, listDir } from '../tools/corpus.mjs';
import { auditFiles } from '../tools/audit-verdicts.mjs';
import { tokensOf } from '../src/findings.mjs';
import { CATALOGUE } from '../src/catalogue.mjs';
import { PAIRS } from '../tools/pairs.mjs';
import { kindFor } from '../src/inputs.mjs';

test('there are 19 fixtures', () => {
  assert.equal(FIXTURES.length, 19);
});

test('the fixtures exist for the reasons the pairs do not reach', () => {
  // Writing one fixture per remaining reason is the highest yielding rule on
  // this account. A pair is written around a realistic mistake and reaches
  // the findings that travel together; the reasons left over are the ones
  // nobody has ever exercised.
  const fromPairs = new Set(PAIRS.flatMap((pair) => [...pair.before, ...pair.residual]).map((token) => token.split('@')[0]));
  const fromFixtures = new Set(FIXTURES.flatMap((fixture) => fixture.tokens).map((token) => token.split('@')[0]));
  const overlap = [...fromFixtures].filter((id) => fromPairs.has(id)).sort();
  // Three fixtures exist to produce the second severity of a finding a pair
  // already reaches at its first, and those are the only overlaps allowed.
  assert.deepEqual(overlap, [
    'cmp-consent-lifetime-excessive',
    'consent-missing-v2-signals',
    'cookie-lifetime-excessive'
  ]);
});

test('the pairs and the fixtures together reach every catalogue entry', () => {
  const reached = new Set([
    ...PAIRS.flatMap((pair) => [...pair.before, ...pair.residual]),
    ...FIXTURES.flatMap((fixture) => fixture.tokens)
  ].map((token) => token.split('@')[0]));
  const missing = CATALOGUE.map((entry) => entry.id).filter((id) => !reached.has(id));
  assert.deepEqual(missing, []);
});

test('the manifest and the directory hold the same fixtures', () => {
  assert.deepEqual(listDir(FIXTURES_DIR).sort(), FIXTURES.map((fixture) => fixture.file).sort());
});

for (const fixture of FIXTURES) {
  test(`${fixture.file}: produces exactly its one declared token`, () => {
    assert.deepStrictEqual(tokensOf(auditFiles([fixtureFile(fixture.file)])), [...fixture.tokens].sort());
  });

  test(`${fixture.file}: exists, is named for a kind and says what it is`, () => {
    assert.ok(existsSync(fixtureFile(fixture.file)));
    assert.ok(kindFor(fixture.file) !== null);
    assert.ok(fixture.about.length > 10);
    assert.ok(readFileSync(fixtureFile(fixture.file), 'utf8').trim().length > 0);
  });
}

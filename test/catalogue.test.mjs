import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AREAS, CATALOGUE, CATALOGUE_BY_ID, entryFor, idsForArea } from '../src/catalogue.mjs';
import { SEVERITIES } from '../src/severity.mjs';

test('the catalogue holds 64 entries across 7 areas', () => {
  assert.equal(CATALOGUE.length, 64);
  assert.equal(Object.keys(AREAS).length, 7);
});

test('every id is unique', () => {
  const ids = CATALOGUE.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('the lookup map covers every entry', () => {
  assert.equal(CATALOGUE_BY_ID.size, CATALOGUE.length);
});

test('entryFor throws for an id nobody declared', () => {
  assert.throws(() => entryFor('not-a-finding'), /no catalogue entry/);
});

test('idsForArea partitions the catalogue exactly', () => {
  const counted = Object.keys(AREAS)
    .map((area) => idsForArea(area).length)
    .reduce((total, count) => total + count, 0);
  assert.equal(counted, CATALOGUE.length);
});

test('an id begins with a word from its own area, or names its subject plainly', () => {
  // A reader seeing a finding id in a report should be able to guess which
  // part of the subject it belongs to without opening the catalogue.
  const prefixes = {
    banner: ['banner'],
    'consent-mode': ['consent'],
    'tag-gating': ['tag', 'container', 'script'],
    cookies: ['cookie'],
    measurement: ['measurement'],
    storage: ['storage', 'prefetch', 'beacon', 'pixel', 'fingerprinting'],
    cmp: ['cmp']
  };
  for (const entry of CATALOGUE) {
    const allowed = prefixes[entry.area];
    assert.ok(
      allowed.some((prefix) => entry.id.startsWith(prefix)),
      `${entry.id} does not begin with one of ${allowed.join(', ')}`
    );
  }
});

for (const entry of CATALOGUE) {
  test(`${entry.id} is a complete catalogue entry`, () => {
    assert.equal(typeof entry.id, 'string');
    assert.ok(/^[a-z0-9-]+$/.test(entry.id), 'the id is lower case and hyphenated');
    assert.ok(Object.prototype.hasOwnProperty.call(AREAS, entry.area), 'the area is declared');
    assert.ok(Array.isArray(entry.severities) && entry.severities.length > 0, 'at least one severity');
    for (const severity of entry.severities) assert.ok(SEVERITIES.includes(severity), `${severity} is known`);
    assert.equal(new Set(entry.severities).size, entry.severities.length, 'no repeated severity');
    assert.ok(entry.title.length > 10, 'the title says something');
    assert.ok(!entry.title.endsWith('.'), 'the title is not a sentence');
    assert.ok(entry.reason.length > 60, 'the reason is a reason rather than a label');
    assert.ok(entry.remedy.length > 20, 'the fix is actionable');
    assert.ok(entry.remedy.endsWith('.'), 'the fix is a sentence');
  });
}

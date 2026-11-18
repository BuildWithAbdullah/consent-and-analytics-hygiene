import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LIMITS, LIMIT_KINDS } from '../tools/limits.mjs';
import { LIMITS_DIR, limitFiles, listDir } from '../tools/corpus.mjs';
import { auditFiles } from '../tools/audit-verdicts.mjs';
import { tokensOf } from '../src/findings.mjs';
import { kindFor } from '../src/inputs.mjs';

function tokensFor(slug, role) {
  return tokensOf(auditFiles(limitFiles(slug, role)));
}

test('there are 11 declared limits, 8 that hide and 3 that manufacture', () => {
  assert.equal(LIMITS.length, 11);
  assert.equal(LIMITS.filter((limit) => limit.kind === 'hides').length, 8);
  assert.equal(LIMITS.filter((limit) => limit.kind === 'manufactures').length, 3);
});

test('the two kinds are the documented set and both are used', () => {
  assert.deepEqual(LIMIT_KINDS, ['hides', 'manufactures']);
  for (const kind of LIMIT_KINDS) {
    assert.ok(LIMITS.some((limit) => limit.kind === kind), kind);
  }
});

test('a limit that hides a problem reports nothing on its blind artefact', () => {
  // The semantics of the kind, asserted rather than described. Without this,
  // a limit that has quietly started reporting something would still read as
  // a limit.
  for (const limit of LIMITS.filter((entry) => entry.kind === 'hides')) {
    assert.deepStrictEqual(limit.blind, [], limit.slug);
  }
});

test('a limit that manufactures a finding has a clean contrast artefact', () => {
  for (const limit of LIMITS.filter((entry) => entry.kind === 'manufactures')) {
    assert.deepStrictEqual(limit.contrast, [], limit.slug);
  }
});

test('a limit that hides a problem shows it on the contrast artefact', () => {
  // Otherwise the blind artefact reporting nothing would prove nothing: a
  // file with no problem in it also reports nothing.
  for (const limit of LIMITS.filter((entry) => entry.kind === 'hides')) {
    assert.ok(limit.contrast.length > 0, limit.slug);
  }
});

test('a limit that manufactures a finding shows it on the blind artefact', () => {
  for (const limit of LIMITS.filter((entry) => entry.kind === 'manufactures')) {
    assert.ok(limit.blind.length > 0, limit.slug);
  }
});

test('the manifest and the directory hold the same limits', () => {
  const onDisk = [...new Set(listDir(LIMITS_DIR).map((name) => name.split('.')[0]))];
  assert.deepEqual(onDisk.sort(), LIMITS.map((limit) => limit.slug).sort());
});

for (const limit of LIMITS) {
  test(`${limit.slug}: the blind artefact produces exactly what is declared`, () => {
    assert.deepStrictEqual(tokensFor(limit.slug, 'blind'), [...limit.blind].sort());
  });

  test(`${limit.slug}: the contrast artefact produces exactly what is declared`, () => {
    assert.deepStrictEqual(tokensFor(limit.slug, 'contrast'), [...limit.contrast].sort());
  });

  test(`${limit.slug}: the two artefacts differ`, () => {
    const blind = limitFiles(limit.slug, 'blind').map((path) => readFileSync(path, 'utf8'));
    const contrast = limitFiles(limit.slug, 'contrast').map((path) => readFileSync(path, 'utf8'));
    assert.ok(blind.length > 0 && contrast.length > 0);
    assert.notDeepEqual(blind, contrast);
  });

  test(`${limit.slug}: the artefacts are of the declared kinds`, () => {
    const kinds = new Set([...limitFiles(limit.slug, 'blind'), ...limitFiles(limit.slug, 'contrast')]
      .map((path) => kindFor(path)));
    assert.deepEqual([...kinds].sort(), [...limit.kinds].sort());
  });

  test(`${limit.slug}: the limit explains itself`, () => {
    assert.ok(limit.title.length > 20, 'a title');
    assert.ok(limit.detail.length > 120, 'a paragraph rather than a label');
    assert.ok(!limit.title.endsWith('.'), 'the title is not a sentence');
  });
}

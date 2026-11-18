// Finding the corpus on disk, in one place.
//
// The artefact directories are flat, with the pair and the role in the file
// name. A nested directory per pair would have made the upload of this
// repository thirty cycles instead of three, and a flat directory makes the
// naming convention itself assertable.

import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const PATTERNS_DIR = join(ROOT, 'patterns');
export const FIXTURES_DIR = join(ROOT, 'fixtures');
export const LIMITS_DIR = join(ROOT, 'limits');

export function listDir(directory) {
  return readdirSync(directory).filter((name) => !name.startsWith('.')).sort();
}

export function filesFor(directory, slug, role) {
  const prefix = `${slug}.${role}.`;
  return listDir(directory)
    .filter((name) => name.startsWith(prefix))
    .map((name) => join(directory, name));
}

export function pairFiles(slug, role) {
  return filesFor(PATTERNS_DIR, slug, role);
}

export function limitFiles(slug, role) {
  return filesFor(LIMITS_DIR, slug, role);
}

export function fixtureFile(name) {
  return join(FIXTURES_DIR, name);
}

// Every artefact in the repository, with what it is and what it should
// report. tools/exit-codes.mjs and tools/audit-verdicts.mjs both walk this,
// so neither of them keeps a list of its own.
export function allArtefacts(pairs, fixtures, limits) {
  const out = [];
  for (const pair of pairs) {
    out.push({ kind: 'pair', slug: pair.slug, role: 'before', files: pairFiles(pair.slug, 'before'), tokens: pair.before });
    out.push({ kind: 'pair', slug: pair.slug, role: 'after', files: pairFiles(pair.slug, 'after'), tokens: pair.residual });
  }
  for (const fixture of fixtures) {
    out.push({ kind: 'fixture', slug: fixture.file, role: 'fixture', files: [fixtureFile(fixture.file)], tokens: fixture.tokens });
  }
  for (const limit of limits) {
    out.push({ kind: 'limit', slug: limit.slug, role: 'blind', files: limitFiles(limit.slug, 'blind'), tokens: limit.blind });
    out.push({ kind: 'limit', slug: limit.slug, role: 'contrast', files: limitFiles(limit.slug, 'contrast'), tokens: limit.contrast });
  }
  return out;
}

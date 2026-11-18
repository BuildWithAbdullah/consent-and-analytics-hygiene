#!/usr/bin/env node
// Running the real binary over every artefact in the repository.
//
// A suite that imports the audit function and checks what it returns never
// exercises the binary, and the binary is where a repository can be broken
// in a way that no test notices: site-audit-cli on this account declared a
// bin which, through the symlink npm installs it as, printed nothing and
// exited 0 for the whole life of the package while fifty tests passed.
//
// The expected exit code is DERIVED, from the tokens the corpus manifest
// declares and the severity table in src/severity.mjs. Keeping a list of
// expected codes in this file would mean the tool and the corpus could
// disagree and the tool would win.
//
// Every artefact is run twice, once by path and once through a symlink to
// the binary, because resolving a path without following symlinks is the
// single most repeated defect on this account.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { EXIT_CODES, highestOf } from '../src/severity.mjs';
import { allArtefacts, ROOT } from './corpus.mjs';
import { PAIRS } from './pairs.mjs';
import { FIXTURES } from './fixtures.mjs';
import { LIMITS } from './limits.mjs';

export const BIN = resolve(ROOT, 'bin/consent-check.mjs');

export function expectedExitCode(tokens) {
  if (tokens.length === 0) return EXIT_CODES.clean;
  const highest = highestOf(tokens.map((token) => token.split('@')[1]));
  if (highest === 'error') return EXIT_CODES.error;
  if (highest === 'warning') return EXIT_CODES.warning;
  return EXIT_CODES.clean;
}

export function symlinkedBin() {
  const directory = mkdtempSync(join(tmpdir(), 'consent-check-bin-'));
  const link = join(directory, 'consent-check');
  symlinkSync(BIN, link);
  return link;
}

export function runBinary(binary, args) {
  const result = spawnSync(process.execPath, [binary, ...args], { encoding: 'utf8', cwd: ROOT });
  return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
}

export function checkExitCodes() {
  const artefacts = allArtefacts(PAIRS, FIXTURES, LIMITS);
  const link = symlinkedBin();
  const problems = [];
  let runs = 0;

  for (const artefact of artefacts) {
    const expected = expectedExitCode(artefact.tokens);
    for (const binary of [BIN, link]) {
      for (const extra of [[], ['--json']]) {
        const result = runBinary(binary, [...extra, ...artefact.files]);
        runs += 1;
        if (result.status !== expected) {
          problems.push(
            `${artefact.kind} ${artefact.slug} ${artefact.role} exited ${result.status}, expected ${expected}`
            + `${binary === link ? ' (through a symlink)' : ''}${extra.length ? ' (json mode)' : ''}`
          );
        }
        if (result.stdout.trim() === '') {
          problems.push(`${artefact.kind} ${artefact.slug} ${artefact.role} printed nothing`);
        }
      }
    }
  }

  return { runs, problems, artefacts: artefacts.length };
}

const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  try {
    return pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url;
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  const report = checkExitCodes();
  for (const problem of report.problems) process.stderr.write(`${problem}\n`);
  process.stdout.write(`${report.runs} runs of the real binary over ${report.artefacts} artefacts, ${report.problems.length} problems\n`);
  process.exitCode = report.problems.length === 0 ? 0 : 1;
}

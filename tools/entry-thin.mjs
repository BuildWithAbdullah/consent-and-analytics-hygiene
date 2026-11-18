#!/usr/bin/env node
// The entry point has to stay wiring.
//
// A file that is only syntax checked has no coverage at all, and the entry
// point is where that bites: it is the one file every user runs and the one
// file a suite that imports modules never touches. The answer is to move
// every decision into a module that takes its streams, its filesystem and
// its work function as arguments, and then to fail the build if a decision
// moves back.
//
// The budget has no headroom. It is set to the figure measured today, so a
// new decision fails immediately, and the line budget carries two lines of
// slack so that reformatting does not. test/repository.test.mjs asserts that
// the branch budget equals the measured figure, which is what stops somebody
// quietly raising it.

import { readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { maskSource } from '../src/scan/js.mjs';
import { ROOT } from './corpus.mjs';

export const ENTRY = 'bin/consent-check.mjs';
export const BRANCH_BUDGET = 3;
export const LINE_BUDGET = 22;

export const BRANCH_PATTERNS = [
  /\bif\s*\(/g,
  /\belse\b/g,
  /\bfor\s*\(/g,
  /\bwhile\s*\(/g,
  /\bswitch\s*\(/g,
  /\bcatch\b/g,
  /&&/g,
  /\|\|/g,
  /\?\?/g,
  /\?[^.]/g
];

// Comments are dropped before anything is counted. A scanner that reads its
// own prose is the most repeated trap in this repository's history, and the
// masker from the script scanner already does exactly this job.
export function measureEntry(root = ROOT, entry = ENTRY) {
  const source = readFileSync(join(root, entry), 'utf8');
  const masked = maskSource(source);
  let branches = 0;
  for (const pattern of BRANCH_PATTERNS) {
    pattern.lastIndex = 0;
    const matches = masked.match(pattern);
    branches += matches === null ? 0 : matches.length;
  }
  const lines = masked
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  return { branches, lines: lines.length, source };
}

export function checkEntry(root = ROOT) {
  const measured = measureEntry(root);
  const problems = [];
  if (measured.branches > BRANCH_BUDGET) {
    problems.push(`${ENTRY} has ${measured.branches} branches and the budget is ${BRANCH_BUDGET}`);
  }
  if (measured.lines > LINE_BUDGET) {
    problems.push(`${ENTRY} has ${measured.lines} lines of code and the budget is ${LINE_BUDGET}`);
  }
  if (!/runCli\(/.test(measured.source)) {
    problems.push(`${ENTRY} no longer calls runCli, so the decisions have moved`);
  }
  return { ...measured, problems };
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
  const report = checkEntry();
  for (const problem of report.problems) process.stderr.write(`${problem}\n`);
  process.stdout.write(`${ENTRY}: ${report.branches} branches of ${BRANCH_BUDGET}, ${report.lines} lines of ${LINE_BUDGET}\n`);
  process.exitCode = report.problems.length === 0 ? 0 : 1;
}

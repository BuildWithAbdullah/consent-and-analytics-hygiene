#!/usr/bin/env node
// Running the checkers themselves over every artefact, in both output modes.
//
// This is the companion to tools/exit-codes.mjs. That tool runs the binary
// and judges its exit code; this one runs the audit in process and compares
// what the two output modes say, because a tool with two modes has to make
// the same assertions in both. A mode that quietly reports less is the kind
// of defect a suite built around one mode never sees.

import { readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { audit } from '../src/audit.mjs';
import { buildInputs } from '../src/inputs.mjs';
import { tokensOf } from '../src/findings.mjs';
import { jsonReport, textReport } from '../src/report.mjs';
import { allArtefacts } from './corpus.mjs';
import { PAIRS } from './pairs.mjs';
import { FIXTURES } from './fixtures.mjs';
import { LIMITS } from './limits.mjs';

export function auditFiles(files) {
  const inputs = buildInputs(files.map((path) => ({ path, source: readFileSync(path, 'utf8') })));
  return audit(inputs);
}

export function tokensFromText(text) {
  const tokens = new Set();
  for (const line of text.split('\n')) {
    const match = line.match(/^(notice|warning|error): \S+:\d+: (\S+)$/);
    if (match) tokens.add(`${match[2]}@${match[1]}`);
  }
  return [...tokens].sort();
}

export function checkVerdicts() {
  const artefacts = allArtefacts(PAIRS, FIXTURES, LIMITS);
  const problems = [];
  let runs = 0;

  for (const artefact of artefacts) {
    const findings = auditFiles(artefact.files);
    const expected = [...artefact.tokens].sort();

    const direct = tokensOf(findings);
    const fromJson = JSON.parse(jsonReport(findings)).tokens;
    const fromText = tokensFromText(textReport(findings));
    runs += 3;

    const compare = (label, actual) => {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        problems.push(
          `${artefact.kind} ${artefact.slug} ${artefact.role} (${label}) produced `
          + `${JSON.stringify(actual)} and declares ${JSON.stringify(expected)}`
        );
      }
    };
    compare('audit', direct);
    compare('json', fromJson);
    compare('text', fromText);
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
  const report = checkVerdicts();
  for (const problem of report.problems) process.stderr.write(`${problem}\n`);
  process.stdout.write(`${report.runs} runs of the checkers over ${report.artefacts} artefacts in both output modes, ${report.problems.length} problems\n`);
  process.exitCode = report.problems.length === 0 ? 0 : 1;
}

// The two output modes.
//
// Both are built from one finding list, so they cannot disagree about what
// was found. test/report.test.mjs compares the token sets the two modes
// produce over every artefact in the corpus and fails if they differ.

import { CATALOGUE_BY_ID } from './catalogue.mjs';
import { exitCodeFor } from './severity.mjs';
import { tokensOf } from './findings.mjs';

export function textReport(findings) {
  if (findings.length === 0) return 'No findings.\n';
  const lines = [];
  for (const finding of findings) {
    const entry = CATALOGUE_BY_ID.get(finding.id);
    lines.push(`${finding.severity}: ${finding.path}:${finding.line}: ${finding.id}`);
    lines.push(`  ${finding.detail}`);
    lines.push(`  why: ${entry.reason}`);
    lines.push(`  fix: ${entry.remedy}`);
  }
  const counts = new Map();
  for (const finding of findings) counts.set(finding.severity, (counts.get(finding.severity) || 0) + 1);
  const summary = [...counts.entries()]
    .sort((left, right) => (left[0] < right[0] ? -1 : 1))
    .map(([severity, count]) => `${count} ${severity}`)
    .join(', ');
  lines.push('');
  lines.push(`${findings.length} findings: ${summary}`);
  return `${lines.join('\n')}\n`;
}

export function jsonReport(findings) {
  return `${JSON.stringify({
    findings: findings.map((finding) => ({
      id: finding.id,
      area: finding.area,
      severity: finding.severity,
      path: finding.path,
      line: finding.line,
      detail: finding.detail
    })),
    tokens: tokensOf(findings),
    exitCode: exitCodeFor(findings)
  }, null, 2)}\n`;
}

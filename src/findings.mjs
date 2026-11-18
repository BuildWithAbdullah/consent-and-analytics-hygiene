// The only way a finding is made.
//
// Every finding goes through here, which is what makes the severity
// declarations in the catalogue load bearing: a severity outside the
// declared set for an id throws rather than being reported, so a check
// cannot quietly widen its own contract.

import { CATALOGUE_BY_ID } from './catalogue.mjs';
import { isSeverity, rankOf } from './severity.mjs';

export function makeFinding(id, severity, where, detail) {
  const entry = CATALOGUE_BY_ID.get(id);
  if (!entry) throw new Error(`finding id is not in the catalogue: ${id}`);
  if (!isSeverity(severity)) throw new Error(`finding ${id} used an unknown severity: ${severity}`);
  if (!entry.severities.includes(severity)) {
    throw new Error(`finding ${id} is not declared at severity ${severity}`);
  }
  const path = where && where.path ? where.path : '<input>';
  const line = where && Number.isFinite(where.line) ? where.line : 1;
  return {
    id,
    area: entry.area,
    severity,
    path,
    line,
    detail: detail === undefined ? entry.title : detail
  };
}

// One finding per reason per place. A reason that is true twice in the same
// file for the same line is one finding, which is what stops a list and each
// of its rows being reported separately.
export function dedupe(findings) {
  const seen = new Set();
  const out = [];
  for (const finding of findings) {
    const key = `${finding.id}\u0000${finding.path}\u0000${finding.line}\u0000${finding.severity}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(finding);
  }
  return out;
}

export function sortFindings(findings) {
  return [...findings].sort((left, right) => {
    const bySeverity = rankOf(right.severity) - rankOf(left.severity);
    if (bySeverity !== 0) return bySeverity;
    if (left.path !== right.path) return left.path < right.path ? -1 : 1;
    if (left.line !== right.line) return left.line - right.line;
    if (left.id !== right.id) return left.id < right.id ? -1 : 1;
    return 0;
  });
}

// The token form the corpus manifests declare and the suite compares. It
// carries the severity, so a finding emitted at the wrong severity fails the
// comparison rather than passing on the id alone.
export function tokensOf(findings) {
  return [...new Set(findings.map((finding) => `${finding.id}@${finding.severity}`))].sort();
}

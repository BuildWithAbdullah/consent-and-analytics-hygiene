import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jsonReport, textReport } from '../src/report.mjs';
import { makeFinding, tokensOf } from '../src/findings.mjs';
import { CATALOGUE_BY_ID } from '../src/catalogue.mjs';
import { EXIT_CODES } from '../src/severity.mjs';
import { allArtefacts } from '../tools/corpus.mjs';
import { auditFiles, tokensFromText } from '../tools/audit-verdicts.mjs';
import { PAIRS } from '../tools/pairs.mjs';
import { FIXTURES } from '../tools/fixtures.mjs';
import { LIMITS } from '../tools/limits.mjs';

const WHERE = { path: 'page.html', line: 7 };
const SAMPLE = [
  makeFinding('banner-reject-absent', 'error', WHERE),
  makeFinding('cookie-no-samesite', 'warning', { path: 'c.http', line: 3 }),
  makeFinding('banner-autofocus-on-accept', 'notice', WHERE)
];

test('the text report names the severity, the place and the id', () => {
  const text = textReport(SAMPLE);
  assert.match(text, /^error: page\.html:7: banner-reject-absent$/m);
  assert.match(text, /^warning: c\.http:3: cookie-no-samesite$/m);
});

test('the text report carries the reason and the fix from the catalogue', () => {
  const text = textReport(SAMPLE);
  const entry = CATALOGUE_BY_ID.get('banner-reject-absent');
  assert.ok(text.includes(entry.reason));
  assert.ok(text.includes(entry.remedy));
});

test('the text report ends with a count by severity', () => {
  assert.match(textReport(SAMPLE), /3 findings: 1 error, 1 notice, 1 warning/);
});

test('a clean run says so rather than printing nothing', () => {
  // A tool that prints nothing when it finds nothing is indistinguishable
  // from a tool that is broken, which is how a binary on this account
  // printed nothing and exited zero for its whole life.
  assert.equal(textReport([]), 'No findings.\n');
  assert.ok(textReport([]).trim().length > 0);
});

test('the json report carries the findings, the tokens and the exit code', () => {
  const parsed = JSON.parse(jsonReport(SAMPLE));
  assert.equal(parsed.findings.length, 3);
  assert.deepEqual(parsed.tokens, tokensOf(SAMPLE));
  assert.equal(parsed.exitCode, EXIT_CODES.error);
});

test('a clean json report is still valid json', () => {
  const parsed = JSON.parse(jsonReport([]));
  assert.deepEqual(parsed.findings, []);
  assert.deepEqual(parsed.tokens, []);
  assert.equal(parsed.exitCode, EXIT_CODES.clean);
});

test('the json report names only the documented fields', () => {
  const parsed = JSON.parse(jsonReport(SAMPLE));
  assert.deepEqual(Object.keys(parsed).sort(), ['exitCode', 'findings', 'tokens']);
  assert.deepEqual(Object.keys(parsed.findings[0]).sort(),
    ['area', 'detail', 'id', 'line', 'path', 'severity']);
});

test('findings are reported worst first, then by place', () => {
  const parsed = JSON.parse(jsonReport(SAMPLE));
  assert.deepEqual(parsed.findings.map((finding) => finding.severity), ['error', 'warning', 'notice']);
});

test('the same reason in the same place is reported once', () => {
  const twice = [makeFinding('cookie-no-samesite', 'warning', WHERE), makeFinding('cookie-no-samesite', 'warning', WHERE)];
  assert.equal(tokensOf(twice).length, 1);
});

for (const artefact of allArtefacts(PAIRS, FIXTURES, LIMITS)) {
  test(`${artefact.kind} ${artefact.slug} ${artefact.role}: the two output modes agree`, () => {
    // A tool with two modes has to make the same assertions in both. A mode
    // that quietly reports less is the kind of defect a suite built around
    // one mode never sees.
    const findings = auditFiles(artefact.files);
    assert.deepStrictEqual(JSON.parse(jsonReport(findings)).tokens, tokensOf(findings));
    assert.deepStrictEqual(tokensFromText(textReport(findings)), tokensOf(findings));
  });
}

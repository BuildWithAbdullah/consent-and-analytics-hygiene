import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXIT_CODES, SEVERITIES, exitCodeFor, highestOf, isSeverity, rankOf } from '../src/severity.mjs';
import { CATALOGUE } from '../src/catalogue.mjs';
import { makeFinding } from '../src/findings.mjs';
import { PAIRS } from '../tools/pairs.mjs';
import { FIXTURES } from '../tools/fixtures.mjs';
import { LIMITS } from '../tools/limits.mjs';

const WHERE = { path: 'a.html', line: 1 };

function declaredTokens() {
  const out = new Set();
  for (const entry of CATALOGUE) for (const severity of entry.severities) out.add(`${entry.id}@${severity}`);
  return out;
}

function corpusTokens() {
  const out = new Set();
  const take = (tokens) => {
    for (const token of tokens) out.add(token);
  };
  for (const pair of PAIRS) {
    take(pair.before);
    take(pair.residual);
  }
  for (const fixture of FIXTURES) take(fixture.tokens);
  for (const limit of LIMITS) {
    take(limit.blind);
    take(limit.contrast);
  }
  return out;
}

test('there are exactly three severities, in order', () => {
  assert.deepEqual(SEVERITIES, ['notice', 'warning', 'error']);
  assert.ok(rankOf('error') > rankOf('warning'));
  assert.ok(rankOf('warning') > rankOf('notice'));
});

test('an unknown severity is rejected rather than ranked', () => {
  assert.equal(isSeverity('critical'), false);
  assert.throws(() => rankOf('critical'), /unknown severity/);
});

test('highestOf picks the worst, and nothing from nothing', () => {
  assert.equal(highestOf(['notice', 'error', 'warning']), 'error');
  assert.equal(highestOf(['notice', 'notice']), 'notice');
  assert.equal(highestOf([]), null);
});

test('the exit code follows the worst finding', () => {
  assert.equal(exitCodeFor([]), EXIT_CODES.clean);
  assert.equal(exitCodeFor([{ severity: 'notice' }]), EXIT_CODES.clean);
  assert.equal(exitCodeFor([{ severity: 'warning' }]), EXIT_CODES.warning);
  assert.equal(exitCodeFor([{ severity: 'notice' }, { severity: 'error' }]), EXIT_CODES.error);
});

test('the four exit codes are distinct', () => {
  const values = Object.values(EXIT_CODES);
  assert.equal(new Set(values).size, values.length);
});

test('a finding cannot be made at a severity its entry does not declare', () => {
  assert.throws(() => makeFinding('banner-reject-absent', 'notice', WHERE), /not declared at severity/);
});

test('a finding cannot be made at a severity that does not exist', () => {
  assert.throws(() => makeFinding('banner-reject-absent', 'critical', WHERE), /unknown severity/);
});

test('a finding cannot be made for an id outside the catalogue', () => {
  assert.throws(() => makeFinding('invented-finding', 'error', WHERE), /not in the catalogue/);
});

test('every severity the corpus produces is declared in the catalogue', () => {
  const declared = declaredTokens();
  const undeclared = [...corpusTokens()].filter((token) => !declared.has(token));
  assert.deepEqual(undeclared, []);
});

test('every severity the catalogue declares is produced by the corpus', () => {
  const produced = corpusTokens();
  const never = [...declaredTokens()].filter((token) => !produced.has(token));
  assert.deepEqual(never, []);
});

test('the second direction is not passing because the loop body never runs', () => {
  // The same comparison over an invented finding, which must fail. Without
  // this, a declared-but-never-produced check that silently iterated over an
  // empty list would look exactly like a passing one.
  const produced = corpusTokens();
  const declared = new Set([...declaredTokens(), 'invented-finding@error']);
  const never = [...declared].filter((token) => !produced.has(token));
  assert.deepEqual(never, ['invented-finding@error']);
});

test('three findings carry two severities and the rest carry one', () => {
  const twoValued = CATALOGUE.filter((entry) => entry.severities.length === 2).map((entry) => entry.id);
  assert.deepEqual(twoValued.sort(), [
    'cmp-consent-lifetime-excessive',
    'consent-missing-v2-signals',
    'cookie-lifetime-excessive'
  ]);
  assert.ok(CATALOGUE.every((entry) => entry.severities.length <= 2));
});

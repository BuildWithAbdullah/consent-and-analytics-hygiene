import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../tools/corpus.mjs';
import { isIgnored, parseIgnore, trackedFiles } from '../tools/tracked.mjs';
import { testFilesFromPackage } from '../tools/count-tests.mjs';
import { BRANCH_BUDGET, LINE_BUDGET, checkEntry, measureEntry } from '../tools/entry-thin.mjs';
import { expectedExitCode } from '../tools/exit-codes.mjs';
import { tokensFromText } from '../tools/audit-verdicts.mjs';
import { generate, staleDocuments } from '../tools/gen-docs.mjs';
import { EXIT_CODES } from '../src/severity.mjs';

function temporary() {
  return mkdtempSync(join(tmpdir(), 'consent-check-test-'));
}

test('ignore rules are parsed into their parts', () => {
  const rules = parseIgnore('node_modules/\n!keep.log\n/root-only\n# comment\n\n*.log');
  assert.equal(rules.length, 4);
  assert.deepEqual(rules[0], { pattern: 'node_modules', negated: false, directoryOnly: true, anchored: false });
  assert.equal(rules[1].negated, true);
  assert.equal(rules[2].anchored, true);
});

test('a pattern with no slash matches at any depth', () => {
  const rules = parseIgnore('*.log');
  assert.equal(isIgnored('a.log', false, rules), true);
  assert.equal(isIgnored('deep/inside/a.log', false, rules), true);
});

test('a leading slash anchors to the repository root', () => {
  const rules = parseIgnore('/a.log');
  assert.equal(isIgnored('a.log', false, rules), true);
  assert.equal(isIgnored('deep/a.log', false, rules), false);
});

test('a directory pattern does not match a file of the same name', () => {
  const rules = parseIgnore('build/');
  assert.equal(isIgnored('build', true, rules), true);
  assert.equal(isIgnored('build', false, rules), false);
});

test('the last matching rule wins', () => {
  const rules = parseIgnore('*.log\n!keep.log');
  assert.equal(isIgnored('a.log', false, rules), true);
  assert.equal(isIgnored('keep.log', false, rules), false);
  const reversed = parseIgnore('!keep.log\n*.log');
  assert.equal(isIgnored('keep.log', false, reversed), true);
});

test('the tracked list agrees with git over a purpose built tree', () => {
  // The rules that change the answer, checked against the thing they are
  // imitating rather than against my reading of the documentation.
  const root = temporary();
  mkdirSync(join(root, 'src'), { recursive: true });
  mkdirSync(join(root, 'build/nested'), { recursive: true });
  mkdirSync(join(root, 'logs'), { recursive: true });
  writeFileSync(join(root, '.gitignore'), [
    'build/',
    '*.log',
    '!logs/keep.log',
    '/only-at-root.txt',
    ''
  ].join('\n'));
  writeFileSync(join(root, 'src/a.mjs'), 'export const a = 1;\n');
  writeFileSync(join(root, 'src/a.log'), 'noise\n');
  writeFileSync(join(root, 'logs/keep.log'), 'kept\n');
  writeFileSync(join(root, 'logs/drop.log'), 'dropped\n');
  writeFileSync(join(root, 'build/nested/b.mjs'), 'export const b = 2;\n');
  writeFileSync(join(root, 'only-at-root.txt'), 'x\n');
  writeFileSync(join(root, 'src/only-at-root.txt'), 'y\n');

  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  const fromGit = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .sort();
  assert.deepEqual(trackedFiles(root), fromGit);
  rmSync(root, { recursive: true, force: true });
});

test('a negation inside an excluded directory cannot re-include anything', () => {
  // The walk never descends into an excluded directory, which is the
  // behaviour git has and the one a naive matcher gets wrong.
  const root = temporary();
  mkdirSync(join(root, 'build'), { recursive: true });
  writeFileSync(join(root, '.gitignore'), 'build/\n!build/keep.mjs\n');
  writeFileSync(join(root, 'build/keep.mjs'), 'export const a = 1;\n');
  writeFileSync(join(root, 'top.mjs'), 'export const b = 2;\n');
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  const fromGit = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
    .split('\n').filter(Boolean).sort();
  assert.deepEqual(trackedFiles(root), fromGit);
  assert.deepEqual(trackedFiles(root), ['.gitignore', 'top.mjs']);
  rmSync(root, { recursive: true, force: true });
});

test('this repository tracks what it says it does', () => {
  const tracked = trackedFiles(ROOT);
  assert.ok(tracked.includes('package.json'));
  assert.ok(tracked.includes('bin/consent-check.mjs'));
  assert.equal(tracked.includes('package-lock.json'), false);
  assert.equal(tracked.some((path) => path.startsWith('node_modules/')), false);
});

test('the test file list comes out of the test script', () => {
  const files = testFilesFromPackage(ROOT);
  assert.ok(files.length > 15);
  assert.ok(files.every((path) => path.startsWith('test/') && path.endsWith('.test.mjs')));
  assert.equal(new Set(files).size, files.length);
});

test('a package with no test script is an error rather than an empty list', () => {
  const root = temporary();
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'x' }));
  assert.throws(() => testFilesFromPackage(root), /no test script/);
  rmSync(root, { recursive: true, force: true });
});

test('the entry point is within budget and the budget has no headroom', () => {
  const measured = measureEntry(ROOT);
  assert.equal(measured.branches, BRANCH_BUDGET);
  assert.ok(measured.lines <= LINE_BUDGET);
  assert.ok(LINE_BUDGET - measured.lines <= 2, 'the line budget leaves room for reflowing and nothing more');
  assert.deepEqual(checkEntry(ROOT).problems, []);
});

test('a decision added to the entry point fails the budget', () => {
  const root = temporary();
  cpSync(join(ROOT, 'bin'), join(root, 'bin'), { recursive: true });
  const path = join(root, 'bin/consent-check.mjs');
  writeFileSync(path, `${readFileSync(path, 'utf8')}\nif (process.env.EXTRA) { process.exitCode = 3; }\n`);
  const problems = checkEntry(root).problems;
  assert.ok(problems.some((problem) => /branches/.test(problem)));
  rmSync(root, { recursive: true, force: true });
});

test('a comment added to the entry point does not fail the budget', () => {
  // Comments are dropped before anything is counted, which is the rule a
  // scanner on this account has broken more than once.
  const root = temporary();
  cpSync(join(ROOT, 'bin'), join(root, 'bin'), { recursive: true });
  const path = join(root, 'bin/consent-check.mjs');
  writeFileSync(path, `// if (a && b) { c(); } for (;;) {}\n${readFileSync(path, 'utf8')}`);
  assert.deepEqual(checkEntry(root).problems, []);
  rmSync(root, { recursive: true, force: true });
});

test('the expected exit code is derived from the declared tokens', () => {
  assert.equal(expectedExitCode([]), EXIT_CODES.clean);
  assert.equal(expectedExitCode(['a@notice']), EXIT_CODES.clean);
  assert.equal(expectedExitCode(['a@notice', 'b@warning']), EXIT_CODES.warning);
  assert.equal(expectedExitCode(['a@warning', 'b@error']), EXIT_CODES.error);
});

test('the text reader finds the tokens a text report carries', () => {
  const text = 'error: a.html:1: banner-reject-absent\n  detail\nwarning: c.http:2: cookie-no-samesite\n';
  assert.deepEqual(tokensFromText(text), ['banner-reject-absent@error', 'cookie-no-samesite@warning']);
});

test('the text reader is not fooled by prose that looks like a finding line', () => {
  assert.deepEqual(tokensFromText('  why: error: something happened\n'), []);
});

test('the generated documents are exactly what is on disk', () => {
  assert.deepEqual(staleDocuments(ROOT), []);
});

test('a generated document is compared against its builder, not regenerated', () => {
  // A verifier that runs the generator and then reads the file always
  // passes, whatever is in the file.
  const root = temporary();
  cpSync(ROOT, root, {
    recursive: true,
    // basename, not substring: `/.git` is inside `/.github` and
    // inside `/.gitignore`, so a substring filter silently drops the
    // workflow and the ignore file and four claims then fail on an
    // unchanged copy.
    filter: (source) => {
      const name = source.split('/').pop();
      return name !== 'node_modules' && name !== '.git';
    }
  });
  writeFileSync(join(root, 'docs/limits.md'), 'edited by hand\n');
  const stale = staleDocuments(root);
  assert.equal(stale.length, 1);
  assert.match(stale[0], /docs\/limits\.md differs/);
  rmSync(root, { recursive: true, force: true });
});

test('both documents carry the warning that they are generated', () => {
  for (const [path, content] of generate()) {
    assert.match(content, /Generated by tools\/gen-docs\.mjs/, path);
  }
});

test('the generated limits document states both kinds and their counts', () => {
  const limits = generate().get('docs/limits.md');
  assert.match(limits, /8 that hide a problem and 3 that manufacture a finding/);
  assert.match(limits, /reports nothing\./);
});

test('the guard on the pair suite compares sets exactly and tests no containment', () => {
  // The guard lives here rather than in the pair suite, because a scanner
  // written inside its own subject counts itself: the first version of this
  // reported its own needle as a match and then reported the line doing the
  // counting as a loose assertion.
  const exactNeedle = `${'deepStrict'}${'Equal(tokensFor'}`;
  const looseNeedle = `${'.inclu'}${'des('}`;
  const lines = readFileSync(join(ROOT, 'test/pairs.test.mjs'), 'utf8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'));
  assert.equal(lines.filter((line) => line.includes(exactNeedle)).length, 2);
  assert.deepEqual(lines.filter((line) => line.includes('tokensFor') && line.includes(looseNeedle)), []);
});

test('the limit suite compares both artefacts exactly as well', () => {
  const exactNeedle = `${'deepStrict'}${'Equal(tokensFor'}`;
  const lines = readFileSync(join(ROOT, 'test/limits.test.mjs'), 'utf8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'));
  assert.equal(lines.filter((line) => line.includes(exactNeedle)).length, 2);
});

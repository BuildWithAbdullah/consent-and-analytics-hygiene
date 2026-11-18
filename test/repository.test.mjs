// Every repository claim, one test each, plus the perturbations that prove
// each of the fragile ones is not vacuous.
//
// The verifier takes a context. That is what lets a verifier which runs the
// suite be called from inside the suite: on the command line it fills the
// test count by spawning the counter, and here the suite fills it from the
// README. The comparison that matters, the counted total against the stated
// one, happens in the verify job in CI, where the count is real.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ASSERTION_COUNT, CLAIMS, NODE_FLOOR, allowedHost, hostsIn, importsIn, statedOnOneLine, verify } from '../tools/verify.mjs';
import { ROOT } from '../tools/corpus.mjs';

const README = readFileSync(join(ROOT, 'README.md'), 'utf8');

function statedTestCount() {
  const matches = [...README.matchAll(/(\d+) tests/g)].map((match) => Number(match[1]));
  assert.equal(matches.length, 1, 'the README states a test count exactly once');
  return matches[0];
}

const CONTEXT = { root: ROOT, testCount: statedTestCount(), testsGreen: true };

function copyRepository() {
  const root = mkdtempSync(join(tmpdir(), 'consent-check-perturbed-'));
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
  return root;
}

function verifyCopy(root, change) {
  change(root);
  const report = verify({ ...CONTEXT, root });
  rmSync(root, { recursive: true, force: true });
  return report;
}

test('the claim list and the stated total agree', () => {
  assert.equal(CLAIMS.length, ASSERTION_COUNT);
});

test('every claim has a distinct name that reads as a statement', () => {
  const names = CLAIMS.map((claim) => claim.name);
  assert.equal(new Set(names).size, names.length);
  for (const name of names) {
    assert.ok(name.length > 15, name);
    assert.equal(name, name.toLowerCase().slice(0, 1) + name.slice(1));
  }
});

test('the whole claim list passes against this repository', () => {
  const report = verify(CONTEXT);
  assert.deepEqual(report.problems, []);
  assert.equal(report.claims, ASSERTION_COUNT);
});

for (const claim of CLAIMS) {
  test(`claim: ${claim.name}`, () => {
    assert.equal(claim.run(CONTEXT), null);
  });
}

test('a claim that is given no test count says so rather than passing', () => {
  const report = verify({ root: ROOT, testCount: null, testsGreen: null });
  assert.ok(report.problems.some((problem) => /no test count was given/.test(problem)));
});

test('a count from a suite that was not green is refused', () => {
  const report = verify({ ...CONTEXT, testsGreen: false });
  assert.ok(report.problems.some((problem) => /not green/.test(problem)));
});

test('statedOnOneLine fails on a number that is stated twice', () => {
  assert.equal(statedOnOneLine('a 5 tests b\nc 5 tests d', '5 tests'), false);
});

test('statedOnOneLine fails on a number that is not stated at all', () => {
  assert.equal(statedOnOneLine('nothing here', '5 tests'), false);
});

test('statedOnOneLine matches whole lines so a wrapped number fails', () => {
  // A number matched by a pattern rather than by a line passes when it has
  // wrapped onto two lines, and the README then states a figure no reader
  // can find.
  assert.equal(statedOnOneLine('the suite holds 5\ntests', '5 tests'), false);
  assert.equal(statedOnOneLine('the suite holds 5 tests today', '5 tests'), true);
});

test('hostsIn finds the hosts in a body of text', () => {
  assert.deepEqual(hostsIn('see https://example.com/a and http://Shop.Example.NET/b').sort(),
    ['example.com', 'shop.example.net']);
});

test('example domains, reserved names and documented trackers are allowed', () => {
  for (const host of ['example.com', 'shop.example.net', 'a.example.org', 'thing.test', 'localhost', 'www.google-analytics.com', 'github.com']) {
    assert.equal(allowedHost(host), true, host);
  }
});

test('somebody else’s site is not allowed', () => {
  // Assembled at run time. One of the claims this file is testing is that no
  // tracked file names anybody's real site, and a test that declares such a
  // name as a literal reports itself. That trap has now caught three
  // scanners in this repository.
  const hosts = [
    `${'a-real-'}${'shop.co.uk'}`,
    `${'client-'}${'site.com'}`,
    `${'analytics.'}${'somewhere.io'}`
  ];
  for (const host of hosts) {
    assert.equal(allowedHost(host), false, host);
  }
});

test('imports are read from the start of a line and not from inside a string', () => {
  // A pattern that matches anywhere finds an import written inside a string
  // literal in a test that builds fake modules, and then reports those
  // imaginary files as unresolvable.
  const source = [
    "import { a } from './a.mjs';",
    "const fake = \"import { b } from './b.mjs';\";",
    "export { c } from './c.mjs';",
    "  import './d.mjs';"
  ].join('\n');
  assert.deepEqual(importsIn(source), ['./a.mjs', './c.mjs', './d.mjs']);
});

test('the node floor is a single exact version', () => {
  assert.match(NODE_FLOOR, /^\d+\.\d+\.\d+$/);
});

test('perturbation: a file carrying an em dash fails the dash claim and nothing else', () => {
  const report = verifyCopy(copyRepository(), (root) => {
    writeFileSync(join(root, 'docs/extra.md'), `a ${String.fromCharCode(0x2014)} b\n`);
  });
  assert.equal(report.claims, ASSERTION_COUNT);
  assert.equal(report.problems.length, 1);
  assert.match(report.problems[0], /em dash/);
});

test('perturbation: a file carrying an en dash fails the dash claim', () => {
  const report = verifyCopy(copyRepository(), (root) => {
    writeFileSync(join(root, 'docs/extra.md'), `a ${String.fromCharCode(0x2013)} b\n`);
  });
  assert.ok(report.problems.some((problem) => /en dash/.test(problem)));
});

test('perturbation: a file importing something absent fails the import claim', () => {
  const report = verifyCopy(copyRepository(), (root) => {
    writeFileSync(join(root, 'tools/extra.mjs'), "import { nothing } from './absent.mjs';\n");
  });
  assert.ok(report.problems.some((problem) => /unresolvable imports/.test(problem)));
});

test('perturbation: a shipped file importing from an unshipped directory fails its own claim', () => {
  const report = verifyCopy(copyRepository(), (root) => {
    writeFileSync(join(root, 'src/extra.mjs'), "import { ROOT } from '../tools/corpus.mjs';\n\nexport const root = ROOT;\n");
  });
  assert.ok(report.problems.some((problem) => /reaching outside the package/.test(problem)));
});

test('perturbation: a stray lockfile fails the lockfile claim', () => {
  const report = verifyCopy(copyRepository(), (root) => {
    writeFileSync(join(root, 'package-lock.json'), '{}\n');
    writeFileSync(join(root, '.gitignore'), 'node_modules/\n*.log\n.DS_Store\n');
  });
  assert.ok(report.problems.some((problem) => /lockfile is tracked/.test(problem)));
});

test('perturbation: an engines floor with no patch component fails', () => {
  const report = verifyCopy(copyRepository(), (root) => {
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    manifest.engines.node = '>=20';
    writeFileSync(join(root, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  });
  assert.ok(report.problems.some((problem) => /engines\.node is >=20/.test(problem)));
});

test('perturbation: an engines floor with no operator fails too', () => {
  // An exact value with no operator is a pin rather than a floor.
  const report = verifyCopy(copyRepository(), (root) => {
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    manifest.engines.node = NODE_FLOOR;
    writeFileSync(join(root, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  });
  assert.ok(report.problems.some((problem) => /engines\.node is/.test(problem)));
});

test('perturbation: a test file nothing runs fails the test script claim', () => {
  const report = verifyCopy(copyRepository(), (root) => {
    writeFileSync(join(root, 'test/orphan.test.mjs'), "import { test } from 'node:test';\n\ntest('x', () => {});\n");
  });
  assert.ok(report.problems.some((problem) => /test files nothing runs/.test(problem)));
});

test('perturbation: a hand edited generated document fails the freshness claim', () => {
  const report = verifyCopy(copyRepository(), (root) => {
    writeFileSync(join(root, 'docs/findings.md'), 'edited\n');
  });
  assert.ok(report.problems.some((problem) => /docs\/findings\.md differs/.test(problem)));
});

test('perturbation: a decision moved into the entry point fails two claims', () => {
  const report = verifyCopy(copyRepository(), (root) => {
    const path = join(root, 'bin/consent-check.mjs');
    writeFileSync(path, `${readFileSync(path, 'utf8')}\nif (process.env.EXTRA) { process.exitCode = 3; }\n`);
  });
  assert.ok(report.problems.some((problem) => /branch and line budget/.test(problem)));
  assert.ok(report.problems.some((problem) => /no headroom/.test(problem)));
});

test('perturbation: a host that is somebody’s site fails the purity claim', () => {
  const report = verifyCopy(copyRepository(), (root) => {
    writeFileSync(join(root, 'docs/extra.md'), `see https://${`${'a-real-'}${'shop.co.uk'}`}/page\n`);
  });
  assert.ok(report.problems.some((problem) => /somebody's site/.test(problem)));
});

test('perturbation: a guard spelled differently fails the main module claim', () => {
  const report = verifyCopy(copyRepository(), (root) => {
    const path = join(root, 'tools/entry-thin.mjs');
    const source = readFileSync(path, 'utf8')
      .replace('pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url',
        'import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href');
    writeFileSync(path, source);
  });
  assert.ok(report.problems.some((problem) => /guard differs/.test(problem)));
});

test('perturbation: a changed README count fails only the count claim', () => {
  const report = verifyCopy(copyRepository(), (root) => {
    const readme = readFileSync(join(root, 'README.md'), 'utf8')
      .replace(`${CONTEXT.testCount} tests`, `${CONTEXT.testCount + 1} tests`);
    writeFileSync(join(root, 'README.md'), readme);
  });
  assert.equal(report.problems.length, 1);
  assert.match(report.problems[0], /does not state \d+ tests on exactly one line/);
});

test('perturbation: every one of those changes leaves the claim total alone', () => {
  // The total is the length of the claim list, so it must not move when a
  // claim fails. A figure that changed with the state of the repository
  // would be a count of problems rather than a count of claims.
  for (const change of [
    (root) => writeFileSync(join(root, 'docs/extra.md'), `${String.fromCharCode(0x2014)}\n`),
    (root) => writeFileSync(join(root, 'tools/extra.mjs'), "import { a } from './absent.mjs';\n"),
    (root) => writeFileSync(join(root, 'package-lock.json'), '{}\n')
  ]) {
    assert.equal(verifyCopy(copyRepository(), change).claims, ASSERTION_COUNT);
  }
});

test('the README has the sections a reader needs', () => {
  for (const heading of ['## What this is', '## Verifying', '## What it cannot see', '## Licence']) {
    assert.ok(README.includes(`\n${heading}\n`), heading);
  }
});

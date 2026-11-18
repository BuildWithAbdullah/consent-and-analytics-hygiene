#!/usr/bin/env node
// The repository verifier: a fixed list of named claims.
//
// Not a count of assertions made per file. An assertion made once inside a
// loop over forty files used to be reported as forty assertions, which made
// the number grow when a file was added and shrink when one was removed, and
// told a reader nothing about how much is actually checked. This is a list
// of named claims, and the number below is the length of that list,
// including the claim about the number itself.
//
// Because the figure is counted differently from the older repositories on
// this account, it is NOT comparable with theirs. The README says so.
//
// Every claim takes a context. That is what lets a verifier which runs the
// suite be called from inside the suite: the command line fills the test
// count by spawning the counter, and the suite fills it from the README, so
// the claim list is fully exercised by the suite without the suite running
// itself.

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AREAS, CATALOGUE } from '../src/catalogue.mjs';
import { SEVERITIES } from '../src/severity.mjs';
import { KINDS } from '../src/inputs.mjs';
import { TRACKER_HOSTS } from '../src/vocabulary.mjs';
import { looksLikeTelephone } from '../src/checks/measurement.mjs';
import { ROOT } from './corpus.mjs';
import { PAIRS } from './pairs.mjs';
import { FIXTURES } from './fixtures.mjs';
import { LIMITS, LIMIT_KINDS } from './limits.mjs';
import { pairFiles, limitFiles, fixtureFile } from './corpus.mjs';
import { trackedFiles } from './tracked.mjs';
import { BRANCH_BUDGET, checkEntry, measureEntry } from './entry-thin.mjs';
import { staleDocuments } from './gen-docs.mjs';

// The total is the length of the claim list, including this claim.
export const ASSERTION_COUNT = 54;

export const NODE_FLOOR = '20.18.1';
export const WORKFLOW = '.github/workflows/ci.yml';

const TEXT_EXTENSIONS = ['.mjs', '.js', '.json', '.md', '.html', '.http', '.yml', '.txt', ''];

function read(root, path) {
  return readFileSync(join(root, path), 'utf8');
}

function textFiles(root) {
  return trackedFiles(root).filter((path) => {
    const dot = path.lastIndexOf('.');
    const extension = dot === -1 ? '' : path.slice(dot);
    return TEXT_EXTENSIONS.includes(extension);
  });
}

// A line, not a pattern. A self checking number matched by a pattern passes
// when the number has wrapped onto two lines and passes again when it has
// been duplicated, so the match is made against whole lines and the count of
// matching lines has to be exactly one.
export function statedOnOneLine(text, sentence) {
  const matches = text.split('\n').filter((line) => line.includes(sentence));
  return matches.length === 1;
}

// Needles are assembled at run time so that no file on disk contains the
// thing being searched for. A purity check that declares its needle as a
// literal reports itself, which has happened on this account twice.
const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);

export const EXAMPLE_HOST_PATTERN = /(^|\.)(example\.(com|net|org)|test|localhost)$/;

// Hosts this repository is allowed to name because they are public
// infrastructure rather than anybody's site.
export const DOCUMENTED_HOSTS = [
  'github.com',
  'nodejs.org',
  'opensource.org',
  'www.npmjs.com',
  'docs.github.com'
];

export function hostsIn(text) {
  const out = new Set();
  const pattern = /https?:\/\/([A-Za-z0-9.-]+)/g;
  let match;
  while ((match = pattern.exec(text)) !== null) out.add(match[1].toLowerCase());
  return [...out];
}

export function allowedHost(host) {
  if (EXAMPLE_HOST_PATTERN.test(host)) return true;
  if (TRACKER_HOSTS.includes(host)) return true;
  return DOCUMENTED_HOSTS.includes(host);
}

// The guard, keyed on the comparison rather than on any variable name. Both
// sides must be resolved to a real path, because npm installs a bin as a
// symlink and Node resolves a module path to its realpath, and the URL is
// never built by concatenating a scheme onto a path, which is wrong on
// Windows.
export const GUARD_EXPRESSION = 'pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url';

function guardedFiles(root) {
  return trackedFiles(root).filter(
    (path) => path.endsWith('.mjs') && read(root, path).includes('realpathSync(process.argv[1])')
  );
}

// Imports are read from the start of a line. A pattern that matches anywhere
// finds an import written inside a string literal in a test that builds fake
// modules, and then reports those imaginary files as unresolvable.
export function importsIn(source) {
  const out = [];
  for (const line of source.split('\n')) {
    const match = line.match(/^\s*(?:import|export)[^'"]*from\s+['"]([^'"]+)['"]/);
    if (match) out.push(match[1]);
    const bare = line.match(/^\s*import\s+['"]([^'"]+)['"]/);
    if (bare) out.push(bare[1]);
  }
  return out;
}

export function workflowLines(root) {
  return read(root, WORKFLOW)
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'));
}

export const CLAIMS = [
  {
    name: 'every catalogue id is unique',
    run: () => {
      const ids = CATALOGUE.map((entry) => entry.id);
      return new Set(ids).size === ids.length ? null : 'duplicate catalogue ids';
    }
  },
  {
    name: 'every catalogue severity is one of the three',
    run: () => {
      const bad = CATALOGUE.filter((entry) =>
        entry.severities.length === 0 || entry.severities.some((severity) => !SEVERITIES.includes(severity)));
      return bad.length === 0 ? null : `bad severities on ${bad.map((entry) => entry.id).join(', ')}`;
    }
  },
  {
    name: 'every catalogue area is declared',
    run: () => {
      const bad = CATALOGUE.filter((entry) => !Object.prototype.hasOwnProperty.call(AREAS, entry.area));
      return bad.length === 0 ? null : `undeclared areas on ${bad.map((entry) => entry.id).join(', ')}`;
    }
  },
  {
    name: 'every declared area has at least one finding',
    run: () => {
      const empty = Object.keys(AREAS).filter((area) => !CATALOGUE.some((entry) => entry.area === area));
      return empty.length === 0 ? null : `areas with no findings: ${empty.join(', ')}`;
    }
  },
  {
    name: 'every catalogue entry states a reason and a fix',
    run: () => {
      const thin = CATALOGUE.filter((entry) =>
        !entry.title || entry.reason.length < 60 || entry.remedy.length < 20);
      return thin.length === 0 ? null : `thin prose on ${thin.map((entry) => entry.id).join(', ')}`;
    }
  },
  {
    name: 'every pair slug is unique',
    run: () => {
      const slugs = PAIRS.map((pair) => pair.slug);
      return new Set(slugs).size === slugs.length ? null : 'duplicate pair slugs';
    }
  },
  {
    name: 'every pair has a failing side and a corrected side on disk',
    run: () => {
      const bad = PAIRS.filter((pair) => pairFiles(pair.slug, 'before').length === 0
        || pairFiles(pair.slug, 'after').length === 0);
      return bad.length === 0 ? null : `incomplete pairs: ${bad.map((pair) => pair.slug).join(', ')}`;
    }
  },
  {
    name: 'every token a pair declares is in the catalogue at that severity',
    run: () => {
      const declared = new Set();
      for (const entry of CATALOGUE) for (const severity of entry.severities) declared.add(`${entry.id}@${severity}`);
      const bad = [];
      for (const pair of PAIRS) {
        for (const token of [...pair.before, ...pair.residual]) {
          if (!declared.has(token)) bad.push(`${pair.slug}: ${token}`);
        }
      }
      return bad.length === 0 ? null : `undeclared pair tokens: ${bad.join(', ')}`;
    }
  },
  {
    name: 'every pair names only known input kinds',
    run: () => {
      const bad = PAIRS.filter((pair) => pair.kinds.some((kind) => !KINDS.includes(kind)));
      return bad.length === 0 ? null : `unknown kinds on ${bad.map((pair) => pair.slug).join(', ')}`;
    }
  },
  {
    name: 'the pairs between them exercise all five input kinds',
    run: () => {
      const seen = new Set(PAIRS.flatMap((pair) => pair.kinds));
      const missing = KINDS.filter((kind) => !seen.has(kind));
      return missing.length === 0 ? null : `input kinds no pair exercises: ${missing.join(', ')}`;
    }
  },
  {
    name: 'every fixture file is on disk',
    run: () => {
      const missing = FIXTURES.filter((fixture) => !existsSync(fixtureFile(fixture.file)));
      return missing.length === 0 ? null : `missing fixtures: ${missing.map((fixture) => fixture.file).join(', ')}`;
    }
  },
  {
    name: 'every fixture file is named once',
    run: () => {
      const names = FIXTURES.map((fixture) => fixture.file);
      return new Set(names).size === names.length ? null : 'duplicate fixture names';
    }
  },
  {
    name: 'every token a fixture declares is in the catalogue at that severity',
    run: () => {
      const declared = new Set();
      for (const entry of CATALOGUE) for (const severity of entry.severities) declared.add(`${entry.id}@${severity}`);
      const bad = [];
      for (const fixture of FIXTURES) {
        for (const token of fixture.tokens) if (!declared.has(token)) bad.push(`${fixture.file}: ${token}`);
      }
      return bad.length === 0 ? null : `undeclared fixture tokens: ${bad.join(', ')}`;
    }
  },
  {
    name: 'every fixture exists for exactly one reason',
    run: () => {
      const bad = FIXTURES.filter((fixture) => fixture.tokens.length !== 1);
      return bad.length === 0 ? null : `fixtures with more than one token: ${bad.map((fixture) => fixture.file).join(', ')}`;
    }
  },
  {
    name: 'every limit slug is unique',
    run: () => {
      const slugs = LIMITS.map((limit) => limit.slug);
      return new Set(slugs).size === slugs.length ? null : 'duplicate limit slugs';
    }
  },
  {
    name: 'every limit declares one of the two kinds',
    run: () => {
      const bad = LIMITS.filter((limit) => !LIMIT_KINDS.includes(limit.kind));
      return bad.length === 0 ? null : `unknown limit kinds on ${bad.map((limit) => limit.slug).join(', ')}`;
    }
  },
  {
    name: 'every limit has a blind artefact and a contrast artefact on disk',
    run: () => {
      const bad = LIMITS.filter((limit) => limitFiles(limit.slug, 'blind').length === 0
        || limitFiles(limit.slug, 'contrast').length === 0);
      return bad.length === 0 ? null : `incomplete limits: ${bad.map((limit) => limit.slug).join(', ')}`;
    }
  },
  {
    name: 'a limit that hides a problem declares an empty blind set',
    run: () => {
      const bad = LIMITS.filter((limit) => limit.kind === 'hides' && limit.blind.length !== 0);
      return bad.length === 0 ? null
        : `hides limits whose blind artefact reports something: ${bad.map((limit) => limit.slug).join(', ')}`;
    }
  },
  {
    name: 'a limit that manufactures a finding declares an empty contrast set',
    run: () => {
      const bad = LIMITS.filter((limit) => limit.kind === 'manufactures' && limit.contrast.length !== 0);
      return bad.length === 0 ? null
        : `manufactures limits whose contrast artefact is not clean: ${bad.map((limit) => limit.slug).join(', ')}`;
    }
  },
  {
    name: 'every token a limit declares is in the catalogue at that severity',
    run: () => {
      const declared = new Set();
      for (const entry of CATALOGUE) for (const severity of entry.severities) declared.add(`${entry.id}@${severity}`);
      const bad = [];
      for (const limit of LIMITS) {
        for (const token of [...limit.blind, ...limit.contrast]) {
          if (!declared.has(token)) bad.push(`${limit.slug}: ${token}`);
        }
      }
      return bad.length === 0 ? null : `undeclared limit tokens: ${bad.join(', ')}`;
    }
  },
  {
    name: 'both kinds of limit are present',
    run: () => {
      const missing = LIMIT_KINDS.filter((kind) => !LIMITS.some((limit) => limit.kind === kind));
      return missing.length === 0 ? null : `limit kinds with no entry: ${missing.join(', ')}`;
    }
  },
  {
    name: 'every catalogue id is reached by at least one artefact',
    run: () => {
      const reached = new Set();
      const take = (tokens) => {
        for (const token of tokens) reached.add(token.split('@')[0]);
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
      const missing = CATALOGUE.map((entry) => entry.id).filter((id) => !reached.has(id));
      return missing.length === 0 ? null : `ids no artefact reaches: ${missing.join(', ')}`;
    }
  },
  {
    name: 'every declared severity of every finding is produced by at least one artefact',
    run: () => {
      const reached = new Set();
      const take = (tokens) => {
        for (const token of tokens) reached.add(token);
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
      const missing = [];
      for (const entry of CATALOGUE) {
        for (const severity of entry.severities) {
          if (!reached.has(`${entry.id}@${severity}`)) missing.push(`${entry.id}@${severity}`);
        }
      }
      return missing.length === 0 ? null : `severities nothing produces: ${missing.join(', ')}`;
    }
  },
  {
    name: 'no tracked file carries an em dash',
    run: (context) => {
      const bad = textFiles(context.root).filter((path) => read(context.root, path).includes(EM_DASH));
      return bad.length === 0 ? null : `files carrying an em dash: ${bad.join(', ')}`;
    }
  },
  {
    name: 'no tracked file carries an en dash',
    run: (context) => {
      const bad = textFiles(context.root).filter((path) => read(context.root, path).includes(EN_DASH));
      return bad.length === 0 ? null : `files carrying an en dash: ${bad.join(', ')}`;
    }
  },
  {
    name: 'every host named anywhere is an example domain, a reserved test name, a documented tracker or public infrastructure',
    run: (context) => {
      const bad = [];
      for (const path of textFiles(context.root)) {
        for (const host of hostsIn(read(context.root, path))) {
          if (!allowedHost(host)) bad.push(`${path}: ${host}`);
        }
      }
      return bad.length === 0 ? null : `hosts that are somebody's site: ${bad.join(', ')}`;
    }
  },
  {
    name: 'no tracked file carries a run of thirteen or more digits',
    run: (context) => {
      const bad = [];
      for (const path of textFiles(context.root)) {
        if (/\d{13,}/.test(read(context.root, path))) bad.push(path);
      }
      return bad.length === 0 ? null : `files carrying a long digit run: ${bad.join(', ')}`;
    }
  },
  {
    name: 'every telephone number in an artefact is in the fictional range',
    // The decision about what is a telephone number is the checker's own,
    // imported rather than written again here. A second detector would
    // disagree with the first, and the first is the one with the tests.
    run: (context) => {
      const pattern = /\+?\d[\d ().-]{7,}\d/g;
      const bad = [];
      for (const path of trackedFiles(context.root)) {
        if (!/^(patterns|fixtures|limits)\//.test(path)) continue;
        const source = read(context.root, path);
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(source)) !== null) {
          // A run of digits with no separators in an artefact is an age, a
          // size or an identifier, never a number anybody would call.
          if (/^\d+$/.test(match[0])) continue;
          if (!looksLikeTelephone(match[0])) continue;
          const digits = match[0].replace(/\D/g, '');
          if (!digits.includes('5550')) bad.push(`${path}: ${match[0].trim()}`);
        }
      }
      return bad.length === 0 ? null : `telephone numbers outside the fictional range: ${bad.join(', ')}`;
    }
  },
  {
    name: 'every tracked file has an extension the repository expects',
    run: (context) => {
      const allowed = ['.mjs', '.js', '.json', '.md', '.html', '.http', '.yml'];
      const bare = ['LICENSE', '.gitignore'];
      const bad = trackedFiles(context.root).filter((path) => {
        if (bare.includes(path)) return false;
        return !allowed.some((extension) => path.endsWith(extension));
      });
      return bad.length === 0 ? null : `unexpected files: ${bad.join(', ')}`;
    }
  },
  {
    name: 'every relative import resolves, read from the start of a line',
    run: (context) => {
      const bad = [];
      for (const path of trackedFiles(context.root)) {
        if (!path.endsWith('.mjs')) continue;
        for (const specifier of importsIn(read(context.root, path))) {
          if (!specifier.startsWith('.')) continue;
          const target = resolve(dirname(join(context.root, path)), specifier);
          if (!existsSync(target)) bad.push(`${path} imports ${specifier}`);
        }
      }
      return bad.length === 0 ? null : `unresolvable imports: ${bad.join(', ')}`;
    }
  },
  {
    name: 'nothing the package ships imports from a directory it does not ship',
    run: (context) => {
      const manifest = JSON.parse(read(context.root, 'package.json'));
      const shipped = manifest.files.map((entry) => entry.replace(/\/$/, ''));
      const isShipped = (path) => shipped.some((entry) => path === entry || path.startsWith(`${entry}/`));
      const bad = [];
      for (const path of trackedFiles(context.root)) {
        if (!path.endsWith('.mjs') || !isShipped(path)) continue;
        for (const specifier of importsIn(read(context.root, path))) {
          if (!specifier.startsWith('.')) continue;
          const target = resolve(dirname(join(context.root, path)), specifier);
          const relativeTarget = target.slice(context.root.length + 1).split('\\').join('/');
          if (!isShipped(relativeTarget)) bad.push(`${path} imports ${relativeTarget}`);
        }
      }
      return bad.length === 0 ? null : `shipped files reaching outside the package: ${bad.join(', ')}`;
    }
  },
  {
    name: 'the engines floor names an exact version and keeps its operator',
    run: (context) => {
      const manifest = JSON.parse(read(context.root, 'package.json'));
      const declared = manifest.engines && manifest.engines.node;
      if (declared !== `>=${NODE_FLOOR}`) {
        return `engines.node is ${String(declared)} and should be >=${NODE_FLOOR}`;
      }
      return null;
    }
  },
  {
    name: 'the workflow matrix names the floor with all three components',
    run: (context) => {
      const lines = workflowLines(context.root);
      const stated = lines.some((line) => line.includes(`'${NODE_FLOOR}'`));
      return stated ? null : `the workflow does not name ${NODE_FLOOR} exactly`;
    }
  },
  {
    name: 'the workflow has a job that proves the floor is refused below it',
    run: (context) => {
      const text = workflowLines(context.root).join('\n');
      return /engine-strict|engines-refusal/.test(text)
        ? null
        : 'the workflow has no job testing that an older runtime is refused';
    }
  },
  {
    name: 'no workflow step redirects the output of an npm run',
    run: (context) => {
      const bad = workflowLines(context.root).filter((line) => /npm run/.test(line) && />/.test(line));
      return bad.length === 0 ? null : `redirected npm run steps: ${bad.length}`;
    }
  },
  {
    name: 'every guarded file spells the main module guard identically',
    run: (context) => {
      const files = guardedFiles(context.root);
      if (files.length === 0) return 'no file carries a main module guard';
      const bad = files.filter((path) => !read(context.root, path).includes(GUARD_EXPRESSION));
      return bad.length === 0 ? null : `files whose guard differs: ${bad.join(', ')}`;
    }
  },
  {
    name: 'the entry point is within its branch and line budget',
    run: (context) => {
      const report = checkEntry(context.root);
      return report.problems.length === 0 ? null : report.problems.join('; ');
    }
  },
  {
    name: 'the entry branch budget equals the measured figure, with no headroom',
    run: (context) => {
      const measured = measureEntry(context.root);
      return measured.branches === BRANCH_BUDGET
        ? null
        : `the entry has ${measured.branches} branches and the budget is set to ${BRANCH_BUDGET}`;
    }
  },
  {
    name: 'the generated documents match what their generator produces',
    run: (context) => {
      const stale = staleDocuments(context.root);
      return stale.length === 0 ? null : stale.join('; ');
    }
  },
  {
    name: 'the test script names every test file on disk',
    run: (context) => {
      const manifest = JSON.parse(read(context.root, 'package.json'));
      const named = new Set(manifest.scripts.test.split(/\s+/).filter((token) => token.endsWith('.test.mjs')));
      const onDisk = trackedFiles(context.root).filter((path) => path.endsWith('.test.mjs'));
      const missing = onDisk.filter((path) => !named.has(path));
      const absent = [...named].filter((path) => !onDisk.includes(path));
      if (missing.length > 0) return `test files nothing runs: ${missing.join(', ')}`;
      if (absent.length > 0) return `test files named and not present: ${absent.join(', ')}`;
      return null;
    }
  },
  {
    name: 'the package ships no dependencies and tracks no lockfile',
    run: (context) => {
      const manifest = JSON.parse(read(context.root, 'package.json'));
      const counts = ['dependencies', 'devDependencies', 'peerDependencies']
        .map((key) => Object.keys(manifest[key] || {}).length)
        .reduce((total, count) => total + count, 0);
      if (counts !== 0) return `the package declares ${counts} dependencies`;
      if (trackedFiles(context.root).includes('package-lock.json')) {
        return 'a lockfile is tracked in a repository with no dependencies';
      }
      const ignore = read(context.root, '.gitignore');
      if (!ignore.split('\n').some((line) => line.trim() === 'package-lock.json')) {
        return 'the lockfile is neither tracked nor ignored';
      }
      return null;
    }
  },
  {
    name: 'the package ships everything the binary needs and nothing else',
    run: (context) => {
      const manifest = JSON.parse(read(context.root, 'package.json'));
      const shipped = manifest.files.map((entry) => entry.replace(/\/$/, '')).sort();
      const wanted = ['LICENSE', 'README.md', 'bin', 'docs', 'src'];
      return JSON.stringify(shipped) === JSON.stringify(wanted)
        ? null
        : `the files field is ${JSON.stringify(shipped)} and should be ${JSON.stringify(wanted)}`;
    }
  },
  {
    name: 'the README has a Verifying section',
    run: (context) => {
      const readme = read(context.root, 'README.md');
      return readme.includes('\n## Verifying\n') ? null : 'the README has no Verifying section';
    }
  },
  {
    name: 'the README states the test count on exactly one line',
    run: (context) => {
      if (context.testCount === null) return 'no test count was given to the verifier';
      const readme = read(context.root, 'README.md');
      return statedOnOneLine(readme, `${context.testCount} tests`)
        ? null
        : `the README does not state ${context.testCount} tests on exactly one line`;
    }
  },
  {
    name: 'the README states the finding count on exactly one line',
    run: (context) => {
      const readme = read(context.root, 'README.md');
      return statedOnOneLine(readme, `${CATALOGUE.length} catalogued findings`)
        ? null
        : `the README does not state ${CATALOGUE.length} catalogued findings on exactly one line`;
    }
  },
  {
    name: 'the README states the assertion count on exactly one line',
    run: (context) => {
      const readme = read(context.root, 'README.md');
      return statedOnOneLine(readme, `${ASSERTION_COUNT} repository assertions`)
        ? null
        : `the README does not state ${ASSERTION_COUNT} repository assertions on exactly one line`;
    }
  },
  {
    name: 'the README states the pair count on exactly one line',
    run: (context) => {
      const readme = read(context.root, 'README.md');
      return statedOnOneLine(readme, `${PAIRS.length} pattern pairs`)
        ? null
        : `the README does not state ${PAIRS.length} pattern pairs on exactly one line`;
    }
  },
  {
    name: 'the README states the fixture count on exactly one line',
    run: (context) => {
      const readme = read(context.root, 'README.md');
      return statedOnOneLine(readme, `${FIXTURES.length} fixtures`)
        ? null
        : `the README does not state ${FIXTURES.length} fixtures on exactly one line`;
    }
  },
  {
    name: 'the README states the limit count on exactly one line',
    run: (context) => {
      const readme = read(context.root, 'README.md');
      return statedOnOneLine(readme, `${LIMITS.length} declared limits`)
        ? null
        : `the README does not state ${LIMITS.length} declared limits on exactly one line`;
    }
  },
  {
    name: 'the README states the area count on exactly one line',
    run: (context) => {
      const readme = read(context.root, 'README.md');
      return statedOnOneLine(readme, `${Object.keys(AREAS).length} areas`)
        ? null
        : `the README does not state ${Object.keys(AREAS).length} areas on exactly one line`;
    }
  },
  {
    name: 'the test count quoted in the README came from a green run',
    run: (context) => {
      if (context.testCount === null) return 'no test count was given to the verifier';
      if (context.testsGreen !== true) return 'the suite was not green, so no count may be quoted';
      return null;
    }
  },
  {
    name: 'the README says the assertion total is not comparable between repositories',
    run: (context) => {
      const readme = read(context.root, 'README.md');
      return /not comparable/.test(readme)
        ? null
        : 'the README does not say the assertion total is not comparable with other repositories';
    }
  },
  {
    name: 'the licence is MIT and needs no attribution',
    run: (context) => {
      const licence = read(context.root, 'LICENSE');
      const manifest = JSON.parse(read(context.root, 'package.json'));
      if (manifest.license !== 'MIT') return `package.json declares the licence as ${manifest.license}`;
      return /MIT License/.test(licence) ? null : 'LICENSE is not the MIT text';
    }
  },
  {
    name: 'the assertion total equals the length of this claim list',
    run: () => (CLAIMS.length === ASSERTION_COUNT
      ? null
      : `the claim list holds ${CLAIMS.length} claims and the stated total is ${ASSERTION_COUNT}`)
  }
];

export function verify(context) {
  const settled = { root: ROOT, testCount: null, testsGreen: null, ...context };
  const problems = [];
  for (const claim of CLAIMS) {
    let result;
    try {
      result = claim.run(settled);
    } catch (error) {
      result = `threw: ${error.message}`;
    }
    if (result !== null) problems.push(`${claim.name}: ${result}`);
  }
  return { problems, claims: CLAIMS.length };
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
  const { countTests } = await import('./count-tests.mjs');
  const counted = countTests(ROOT);
  const report = verify({
    root: ROOT,
    testCount: counted.total,
    testsGreen: counted.failed === 0 && counted.status === 0
  });
  for (const problem of report.problems) process.stderr.write(`${problem}\n`);
  process.stdout.write(`${report.claims} repository assertions, ${report.problems.length} failing\n`);
  process.exitCode = report.problems.length === 0 ? 0 : 1;
}

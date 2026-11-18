import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { USAGE, parseArgv, runCli } from '../src/cli.mjs';
import { EXIT_CODES } from '../src/severity.mjs';
import { InputError } from '../src/inputs.mjs';
import { fixtureFile, pairFiles } from '../tools/corpus.mjs';

function capture() {
  const chunks = [];
  return { write: (text) => chunks.push(text), text: () => chunks.join('') };
}

function run(argv, files = {}) {
  const stdout = capture();
  const stderr = capture();
  const status = runCli({
    argv,
    stdout,
    stderr,
    readFile: (path) => {
      if (Object.prototype.hasOwnProperty.call(files, path)) return files[path];
      return readFileSync(path, 'utf8');
    }
  });
  return { status, out: stdout.text(), err: stderr.text() };
}

test('the argument list separates files from options', () => {
  const parsed = parseArgv(['--json', 'a.html', 'b.js']);
  assert.equal(parsed.json, true);
  assert.deepEqual(parsed.files.map((file) => file.path), ['a.html', 'b.js']);
});

test('an explicit kind applies to the files after it', () => {
  const parsed = parseArgv(['a.html', '--as', 'cmp', 'b.txt']);
  assert.equal(parsed.files[0].kind, null);
  assert.equal(parsed.files[1].kind, 'cmp');
});

test('an unknown kind is refused with the list of kinds', () => {
  assert.throws(() => parseArgv(['--as', 'invented']), InputError);
  assert.throws(() => parseArgv(['--as', 'invented']), /html, js, headers, container, cmp/);
});

test('an unknown option is refused rather than ignored', () => {
  assert.throws(() => parseArgv(['--quiet']), /unknown option --quiet/);
});

test('both help spellings print the usage and exit clean', () => {
  for (const flag of ['--help', '-h']) {
    const result = run([flag]);
    assert.equal(result.status, EXIT_CODES.clean, flag);
    assert.ok(result.out.includes('consent-check [options]'), flag);
  }
});

test('the usage text states every exit code', () => {
  for (const code of Object.values(EXIT_CODES)) {
    assert.ok(USAGE.includes(String(code)), String(code));
  }
});

test('no files at all is a usage error on the error stream', () => {
  const result = run([]);
  assert.equal(result.status, EXIT_CODES.usage);
  assert.ok(result.err.includes('consent-check [options]'));
  assert.equal(result.out, '');
});

test('an unknown option exits with the usage code', () => {
  const result = run(['--quiet', 'a.html']);
  assert.equal(result.status, EXIT_CODES.usage);
  assert.match(result.err, /unknown option/);
});

test('a file whose kind cannot be told is a usage error', () => {
  const result = run(['a.txt'], { 'a.txt': 'hello' });
  assert.equal(result.status, EXIT_CODES.usage);
  assert.match(result.err, /cannot tell what a\.txt is/);
});

test('an unreadable file is a usage error rather than a crash', () => {
  const result = run(['absent.html']);
  assert.equal(result.status, EXIT_CODES.usage);
  assert.ok(result.err.length > 0);
});

test('malformed json is a usage error naming the file', () => {
  const result = run(['broken.cmp.json'], { 'broken.cmp.json': '{' });
  assert.equal(result.status, EXIT_CODES.usage);
  assert.match(result.err, /broken\.cmp\.json is not valid JSON/);
});

test('a clean artefact exits zero and says there were no findings', () => {
  const result = run(pairFiles('banner-modal-markup', 'after'));
  assert.equal(result.status, EXIT_CODES.clean);
  assert.match(result.out, /No findings/);
});

test('an artefact whose worst finding is a warning exits one', () => {
  const result = run([fixtureFile('cookie-domain-wide.http')]);
  assert.equal(result.status, EXIT_CODES.warning);
});

test('an artefact with an error exits two', () => {
  const result = run([fixtureFile('banner-reject-absent.html')]);
  assert.equal(result.status, EXIT_CODES.error);
});

test('an artefact whose worst finding is a notice exits zero', () => {
  const result = run([fixtureFile('banner-autofocus-accept.html')]);
  assert.equal(result.status, EXIT_CODES.clean);
  assert.match(result.out, /banner-autofocus-on-accept/);
});

test('the json mode prints json and keeps the same exit code', () => {
  const plain = run([fixtureFile('banner-reject-absent.html')]);
  const json = run(['--json', fixtureFile('banner-reject-absent.html')]);
  assert.equal(json.status, plain.status);
  const parsed = JSON.parse(json.out);
  assert.deepEqual(parsed.tokens, ['banner-reject-absent@error']);
});

test('an explicit kind makes an oddly named file readable', () => {
  const result = run(['--as', 'cmp', 'settings.txt'], { 'settings.txt': '{"version":"1","actions":{"rejectAll":true}}' });
  assert.notEqual(result.status, EXIT_CODES.usage);
});

test('files of several kinds are read in one run', () => {
  const result = run([...pairFiles('banner-focus-trap', 'before')]);
  assert.equal(result.status, EXIT_CODES.error);
  assert.match(result.out, /banner-not-focus-trapped/);
});

test('every run prints something on one stream or the other', () => {
  for (const argv of [[], ['--help'], ['--quiet'], ['absent.html'], [fixtureFile('banner-reject-absent.html')]]) {
    const result = run(argv);
    assert.ok(`${result.out}${result.err}`.trim().length > 0, JSON.stringify(argv));
  }
});

#!/usr/bin/env node
// The test counter, as one file.
//
// The default export is a reporter; running the file spawns node --test with
// this same file as the reporter and prints the count. Two files were the
// older shape and this is tidier: the reporter and the thing that drives it
// cannot drift apart.
//
// Why a reporter at all: the printed output of node --test is version
// dependent (`# tests 264` on one version, `info tests 264` on another), and
// so is the event stream given to run(), which forwards one test:pass per
// whole file on some versions and sets details.type to 'suite' or to nothing
// on others. Inside a custom reporter every per test event is present on
// every version, and selecting the events whose type is not 'suite' is the
// one rule that holds everywhere.
//
// A file that fails to load counts as one test. That is safe, because the
// failure count is then non-zero and the build is red, but it is why nothing
// may quote a count from a run that is not green: tools/verify.mjs refuses
// to compare the README count against a suite that failed.

import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

export default async function* reporter(source) {
  let passed = 0;
  let failed = 0;
  for await (const event of source) {
    if (event.type === 'test:pass' || event.type === 'test:fail') {
      const details = event.data && event.data.details;
      if (details && details.type === 'suite') continue;
      if (event.type === 'test:pass') passed += 1;
      else failed += 1;
    }
  }
  yield `${JSON.stringify({ passed, failed, total: passed + failed })}\n`;
}

// The test file list comes out of package.json rather than from a glob, so
// the command the suite actually runs is the command that is counted.
export function testFilesFromPackage(root = ROOT) {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const script = manifest.scripts && manifest.scripts.test;
  if (!script) throw new Error('package.json declares no test script');
  return script
    .split(/\s+/)
    .filter((token) => token.endsWith('.test.mjs'));
}

export function countTests(root = ROOT) {
  const files = testFilesFromPackage(root);
  const self = fileURLToPath(import.meta.url);
  const result = spawnSync(
    process.execPath,
    ['--test', `--test-reporter=${pathToFileURL(self).href}`, ...files],
    { cwd: root, encoding: 'utf8' }
  );
  const text = `${result.stdout || ''}`.trim();
  const lastLine = text.split('\n').filter(Boolean).pop() || '{}';
  let parsed;
  try {
    parsed = JSON.parse(lastLine);
  } catch {
    throw new Error(`the reporter produced no count. stderr: ${(result.stderr || '').slice(0, 400)}`);
  }
  return { ...parsed, status: result.status, files: files.length };
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
  const counted = countTests();
  process.stdout.write(`${JSON.stringify(counted)}\n`);
  process.exitCode = counted.failed === 0 && counted.status === 0 ? 0 : 1;
}

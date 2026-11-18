#!/usr/bin/env node
// Wiring only. Every decision is in src/cli.mjs, and tools/entry-thin.mjs
// fails the build if one moves back here.

import { readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { runCli } from '../src/cli.mjs';

const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  try {
    return pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url;
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  process.exitCode = runCli({
    argv: process.argv.slice(2),
    stdout: process.stdout,
    stderr: process.stderr,
    readFile: (path) => readFileSync(path, 'utf8')
  });
}

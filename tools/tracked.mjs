// Which files this repository actually ships.
//
// Several checks count or scan the tracked files, and a checker that walks
// the tree without reading .gitignore counts whatever happens to be lying
// around. The rules implemented here are the ones that change the answer:
//
//   - a pattern with no slash matches at any depth
//   - a pattern ending in a slash matches directories only
//   - a leading slash anchors to the repository root
//   - a negation re-includes, and the LAST matching rule wins
//   - a negation CANNOT re-include a file inside an excluded directory,
//     because the walk never descends into it
//
// test/repository.test.mjs builds a real repository in a temporary
// directory, runs git ls-files against it, and requires this to agree,
// including the case where a negation is written inside an excluded
// directory and must not take effect.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix, relative, resolve } from 'node:path';

export function parseIgnore(text) {
  const rules = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    let pattern = line;
    let negated = false;
    if (pattern.startsWith('!')) {
      negated = true;
      pattern = pattern.slice(1);
    }
    let directoryOnly = false;
    if (pattern.endsWith('/')) {
      directoryOnly = true;
      pattern = pattern.slice(0, -1);
    }
    let anchored = false;
    if (pattern.startsWith('/')) {
      anchored = true;
      pattern = pattern.slice(1);
    }
    if (pattern.includes('/')) anchored = true;
    rules.push({ pattern, negated, directoryOnly, anchored });
  }
  return rules;
}

function segmentToRegExp(segment) {
  let out = '';
  for (const char of segment) {
    if (char === '*') out += '[^/]*';
    else if (char === '?') out += '[^/]';
    else out += char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return out;
}

function patternToRegExp(pattern, anchored) {
  const body = pattern.split('/').map(segmentToRegExp).join('/');
  return new RegExp(anchored ? `^${body}$` : `(^|/)${body}$`);
}

export function isIgnored(relativePath, isDirectory, rules) {
  let ignored = false;
  for (const rule of rules) {
    if (rule.directoryOnly && !isDirectory) continue;
    if (patternToRegExp(rule.pattern, rule.anchored).test(relativePath)) {
      ignored = !rule.negated;
    }
  }
  return ignored;
}

export function trackedFiles(root, ignoreText) {
  const base = resolve(root);
  const text = ignoreText === undefined ? readIgnore(base) : ignoreText;
  const rules = parseIgnore(text);
  const out = [];

  const walk = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      if (name === '.git') continue;
      const full = join(directory, name);
      const relativePath = posix.join(...relative(base, full).split(/[\\/]/));
      const stats = statSync(full);
      if (stats.isDirectory()) {
        // The walk does not descend into an excluded directory, which is
        // exactly why a negation written inside one cannot re-include
        // anything.
        if (isIgnored(relativePath, true, rules)) continue;
        walk(full);
      } else if (stats.isFile()) {
        if (isIgnored(relativePath, false, rules)) continue;
        out.push(relativePath);
      }
    }
  };

  walk(base);
  return out.sort();
}

function readIgnore(base) {
  try {
    return readFileSync(join(base, '.gitignore'), 'utf8');
  } catch {
    return '';
  }
}

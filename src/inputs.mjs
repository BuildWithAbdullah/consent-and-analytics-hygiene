// Classifying an input by its name, and turning it into the shape the checks
// read. The classification is part of the contract: docs/inputs.md states it
// and test/inputs.test.mjs holds it.

import { parseHtml } from './scan/elements.mjs';
import { parseHeaderCapture } from './scan/headers.mjs';

export const KINDS = ['html', 'js', 'headers', 'container', 'cmp'];

export function kindFor(path) {
  const lowered = path.toLowerCase();
  if (lowered.endsWith('.container.json')) return 'container';
  if (lowered.endsWith('.cmp.json')) return 'cmp';
  if (lowered.endsWith('.html') || lowered.endsWith('.htm')) return 'html';
  if (lowered.endsWith('.js') || lowered.endsWith('.mjs')) return 'js';
  if (lowered.endsWith('.http') || lowered.endsWith('.headers')) return 'headers';
  return null;
}

export class InputError extends Error {}

export function buildInputs(files) {
  const inputs = { html: [], js: [], headers: [], container: [], cmp: [] };
  for (const file of files) {
    const kind = file.kind || kindFor(file.path);
    if (!kind) {
      throw new InputError(
        `cannot tell what ${file.path} is. Name it with one of the documented suffixes, or pass --as`
      );
    }
    if (!KINDS.includes(kind)) throw new InputError(`unknown input kind: ${kind}`);
    if (kind === 'html') {
      inputs.html.push({ path: file.path, source: file.source, parsed: parseHtml(file.source, file.path) });
    } else if (kind === 'js') {
      inputs.js.push({ path: file.path, source: file.source });
    } else if (kind === 'headers') {
      inputs.headers.push({
        path: file.path,
        source: file.source,
        capture: parseHeaderCapture(file.source, file.path)
      });
    } else {
      let data;
      try {
        data = JSON.parse(file.source);
      } catch (error) {
        throw new InputError(`${file.path} is not valid JSON: ${error.message}`);
      }
      inputs[kind].push({ path: file.path, source: file.source, data });
    }
  }
  return inputs;
}

// Script bodies written into a document are script, so they are read as
// script with the document path and the right line numbers. A check that
// only read standalone files would miss the most common place a consent
// default is written.
export function jsSources(inputs) {
  const out = inputs.js.map((file) => ({ path: file.path, source: file.source, lineOffset: 0 }));
  for (const document of inputs.html) {
    for (const element of document.parsed.elements) {
      if (element.tag !== 'script') continue;
      if (element.attrs.has('src')) continue;
      const type = (element.attrs.get('type') || '').toLowerCase();
      if (type !== '' && type !== 'text/javascript' && type !== 'module' && type !== 'application/javascript') {
        continue;
      }
      const raw = element.raw || '';
      if (raw.trim() === '') continue;
      out.push({ path: document.path, source: raw, lineOffset: element.line, inline: true });
    }
  }
  return out;
}

export function at(file, line) {
  return { path: file.path, line: (file.lineOffset || 0) + line };
}

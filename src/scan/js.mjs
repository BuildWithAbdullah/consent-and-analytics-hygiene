// A dependency free call scanner for scripts.
//
// The approach is a masked copy of the source: every comment body and every
// string body is replaced by spaces of the same length, so indexes line up
// with the original. Brackets and commas are then counted in the masked copy,
// which means a bracket inside a string never changes the shape of a call,
// and the argument text is sliced out of the original.
//
// This is not an evaluator and it does not resolve variables. docs/limits.md
// states both, with an artefact for each.

export function maskSource(source) {
  const chars = source.split('');
  const masked = chars.slice();
  let index = 0;
  const blank = (from, to) => {
    for (let i = from; i < to && i < masked.length; i += 1) {
      masked[i] = masked[i] === '\n' ? '\n' : ' ';
    }
  };
  while (index < chars.length) {
    const char = chars[index];
    const nextChar = chars[index + 1];
    if (char === '/' && nextChar === '/') {
      let end = index + 2;
      while (end < chars.length && chars[end] !== '\n') end += 1;
      blank(index, end);
      index = end;
      continue;
    }
    if (char === '/' && nextChar === '*') {
      const end = source.indexOf('*/', index + 2);
      const stop = end === -1 ? chars.length : end + 2;
      blank(index, stop);
      index = stop;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      let end = index + 1;
      while (end < chars.length) {
        if (chars[end] === '\\') {
          end += 2;
          continue;
        }
        if (chars[end] === char) break;
        end += 1;
      }
      blank(index + 1, Math.min(end, chars.length));
      index = Math.min(end + 1, chars.length);
      continue;
    }
    index += 1;
  }
  return masked.join('');
}

export function lineOf(source, index) {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i += 1) {
    if (source[i] === '\n') line += 1;
  }
  return line;
}

function matchBracket(masked, openIndex) {
  const pairs = { '(': ')', '[': ']', '{': '}' };
  const open = masked[openIndex];
  const close = pairs[open];
  let depth = 0;
  for (let i = openIndex; i < masked.length; i += 1) {
    const char = masked[i];
    if (char === '(' || char === '[' || char === '{') depth += 1;
    else if (char === ')' || char === ']' || char === '}') {
      depth -= 1;
      if (depth === 0) return char === close ? i : -1;
    }
  }
  return -1;
}

function splitTopLevel(masked, source, from, to) {
  const parts = [];
  let depth = 0;
  let start = from;
  for (let i = from; i < to; i += 1) {
    const char = masked[i];
    if (char === '(' || char === '[' || char === '{') depth += 1;
    else if (char === ')' || char === ']' || char === '}') depth -= 1;
    else if (char === ',' && depth === 0) {
      parts.push({ from: start, to: i, text: source.slice(start, i) });
      start = i + 1;
    }
  }
  if (to > start) parts.push({ from: start, to, text: source.slice(start, to) });
  return parts.filter((part) => part.text.trim() !== '');
}

const CALLEE_PATTERN = /[A-Za-z_$][A-Za-z0-9_$]*(?:\s*\.\s*[A-Za-z_$][A-Za-z0-9_$]*)*$/;

export function findCalls(source) {
  const masked = maskSource(source);
  const calls = [];
  for (let i = 0; i < masked.length; i += 1) {
    if (masked[i] !== '(') continue;
    const before = masked.slice(Math.max(0, i - 120), i);
    const match = before.match(CALLEE_PATTERN);
    if (!match) continue;
    const callee = match[0].replace(/\s+/g, '');
    if (['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof'].includes(callee)) continue;
    const close = matchBracket(masked, i);
    if (close === -1) continue;
    const calleeStart = i - match[0].length;
    // The text of the statement the call sits in, so a chained call such as
    // a query selector followed by an event listener can still be inspected.
    // The callee pattern cannot reach across the closing bracket of an
    // earlier call in the chain, so without this the chain would be invisible.
    let statementStart = 0;
    let depth = 0;
    for (let back = calleeStart - 1; back >= 0; back -= 1) {
      const char = masked[back];
      if (char === ')' || char === ']' || char === '}') depth += 1;
      else if (char === '(' || char === '[' || char === '{') {
        if (depth === 0) {
          statementStart = back + 1;
          break;
        }
        depth -= 1;
      } else if (depth === 0 && (char === ';' || char === '\n')) {
        statementStart = back + 1;
        break;
      }
    }
    calls.push({
      callee,
      statementText: source.slice(statementStart, close + 1),
      index: calleeStart,
      argsFrom: i + 1,
      argsTo: close,
      line: lineOf(source, calleeStart),
      args: splitTopLevel(masked, source, i + 1, close).map((part) => part.text.trim()),
      argRanges: splitTopLevel(masked, source, i + 1, close)
    });
  }
  return calls;
}

export const UNRESOLVED = Symbol('unresolved');

// Reads a literal expression. Anything that is not a literal comes back as
// UNRESOLVED rather than as a guess, because a guess that looks specific is
// worse than a refusal.
export function readLiteral(text) {
  const trimmed = text.trim();
  if (trimmed === '') return UNRESOLVED;
  if (/^'(?:[^'\\]|\\.)*'$/.test(trimmed) || /^"(?:[^"\\]|\\.)*"$/.test(trimmed)) {
    return trimmed.slice(1, -1).replace(/\\(['"\\nrt])/g, (whole, which) => {
      if (which === 'n') return '\n';
      if (which === 'r') return '\r';
      if (which === 't') return '\t';
      return which;
    });
  }
  if (/^`[^`$]*`$/.test(trimmed)) return trimmed.slice(1, -1);
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (trimmed.startsWith('{')) return readObject(trimmed);
  if (trimmed.startsWith('[')) return readArray(trimmed);
  return UNRESOLVED;
}

export function readObject(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{')) return UNRESOLVED;
  const masked = maskSource(trimmed);
  const close = matchBracket(masked, 0);
  if (close === -1) return UNRESOLVED;
  const entries = splitTopLevel(masked, trimmed, 1, close);
  const out = new Map();
  for (const entry of entries) {
    const entryMasked = maskSource(entry.text);
    const colon = (() => {
      let depth = 0;
      for (let i = 0; i < entryMasked.length; i += 1) {
        const char = entryMasked[i];
        if (char === '(' || char === '[' || char === '{') depth += 1;
        else if (char === ')' || char === ']' || char === '}') depth -= 1;
        else if (char === ':' && depth === 0) return i;
      }
      return -1;
    })();
    if (colon === -1) continue;
    const rawKey = entry.text.slice(0, colon).trim();
    const key = /^['"`]/.test(rawKey) ? rawKey.slice(1, -1) : rawKey;
    out.set(key, readLiteral(entry.text.slice(colon + 1)));
  }
  return out;
}

export function readArray(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith('[')) return UNRESOLVED;
  const masked = maskSource(trimmed);
  const close = matchBracket(masked, 0);
  if (close === -1) return UNRESOLVED;
  return splitTopLevel(masked, trimmed, 1, close).map((part) => readLiteral(part.text));
}

export function stringLiterals(source) {
  const masked = maskSource(source);
  const out = [];
  for (let i = 0; i < masked.length; i += 1) {
    const char = source[i];
    if ((char === '"' || char === "'" || char === '`') && masked[i] === char) {
      let end = i + 1;
      while (end < source.length) {
        if (source[end] === '\\') {
          end += 2;
          continue;
        }
        if (source[end] === char) break;
        end += 1;
      }
      out.push({ value: source.slice(i + 1, end), index: i, line: lineOf(source, i) });
      i = end;
    }
  }
  return out;
}

// How deeply braced a position is, counted in the masked copy so a brace
// inside a string does not change the answer. Used to tell a call written at
// the top level of a script from one written inside a handler.
export function braceDepthAt(source, index) {
  const masked = maskSource(source);
  let depth = 0;
  for (let i = 0; i < index && i < masked.length; i += 1) {
    if (masked[i] === '{') depth += 1;
    else if (masked[i] === '}') depth -= 1;
  }
  return depth;
}

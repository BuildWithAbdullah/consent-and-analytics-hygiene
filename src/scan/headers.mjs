// A reader for a captured response header file.
//
// The format is documented in docs/inputs.md. In short: a file is a sequence
// of phases, each introduced by a line of the form
//
//   --- phase: pre-consent
//
// and each phase holds one or more responses, each starting with a status
// line beginning HTTP/ and followed by header lines until a blank line.
//
// Phase matters because several cookie findings are about when a cookie was
// set rather than about its attributes, and a capture that does not say when
// it was taken cannot answer that. A file with no phase line is read as a
// single phase named unknown, and the timing checks do not run against it.

export const PHASES = ['pre-consent', 'post-consent', 'unknown'];

export function parseHeaderCapture(source, path = '<input>') {
  const lines = source.split(/\r?\n/);
  const responses = [];
  let phase = 'unknown';
  let current = null;
  const problems = [];

  let host = null;

  lines.forEach((raw, offset) => {
    const line = raw.trim();
    const lineNumber = offset + 1;
    const hostMatch = line.match(/^---\s*host:\s*(\S+)\s*$/);
    if (hostMatch) {
      host = hostMatch[1].toLowerCase();
      return;
    }
    const phaseMatch = line.match(/^---\s*phase:\s*(\S+)\s*$/);
    if (phaseMatch) {
      const name = phaseMatch[1];
      if (!PHASES.includes(name)) {
        problems.push({ line: lineNumber, detail: `unknown phase name ${name}` });
      }
      phase = PHASES.includes(name) ? name : 'unknown';
      current = null;
      return;
    }
    if (line === '') {
      current = null;
      return;
    }
    if (/^HTTP\//i.test(line)) {
      const statusMatch = line.match(/^HTTP\/\S+\s+(\d{3})/i);
      current = {
        phase,
        host,
        status: statusMatch ? Number(statusMatch[1]) : null,
        line: lineNumber,
        headers: [],
        path
      };
      responses.push(current);
      return;
    }
    const headerMatch = line.match(/^([A-Za-z0-9!#$%&'*+.^_`|~-]+)\s*:\s*(.*)$/);
    if (!headerMatch) {
      problems.push({ line: lineNumber, detail: 'line is neither a status line nor a header' });
      return;
    }
    if (!current) {
      current = { phase, host, status: null, line: lineNumber, headers: [], path };
      responses.push(current);
    }
    current.headers.push({
      name: headerMatch[1].toLowerCase(),
      value: headerMatch[2],
      line: lineNumber
    });
  });

  return { responses, problems, path, host };
}

// Set-Cookie attribute parsing. Attribute names are compared case
// insensitively with collapsed whitespace, because two spellings of the same
// attribute are the same attribute, and comparing the raw bytes of a header
// value is how a duplicate check reports a difference that is not one.
export function parseSetCookie(value, line, response) {
  const parts = value.split(';');
  const first = parts.shift() || '';
  const equals = first.indexOf('=');
  const name = (equals === -1 ? first : first.slice(0, equals)).trim();
  const cookieValue = equals === -1 ? '' : first.slice(equals + 1).trim();
  const attributes = new Map();
  for (const part of parts) {
    const text = part.trim();
    if (text === '') continue;
    const at = text.indexOf('=');
    const attrName = (at === -1 ? text : text.slice(0, at)).trim().toLowerCase();
    const attrValue = at === -1 ? true : text.slice(at + 1).trim();
    if (!attributes.has(attrName)) attributes.set(attrName, attrValue);
  }
  return {
    name,
    value: cookieValue,
    attributes,
    line,
    phase: response ? response.phase : 'unknown',
    host: response ? response.host : null,
    status: response ? response.status : null,
    path: response ? response.path : '<input>',
    raw: value
  };
}

export function cookiesIn(capture) {
  const out = [];
  for (const response of capture.responses) {
    for (const header of response.headers) {
      if (header.name !== 'set-cookie') continue;
      out.push(parseSetCookie(header.value, header.line, response));
    }
  }
  return out;
}

export function headerValues(capture, name) {
  const wanted = name.toLowerCase();
  const out = [];
  for (const response of capture.responses) {
    for (const header of response.headers) {
      if (header.name === wanted) out.push({ ...header, phase: response.phase });
    }
  }
  return out;
}

export function normaliseAttributeValue(value) {
  if (value === true) return true;
  return String(value).trim().toLowerCase().replace(/\s+/g, ' ');
}

// Seconds a cookie survives, or null when the capture does not say.
export function lifetimeSeconds(cookie, now = Date.parse('2026-01-01T00:00:00Z')) {
  if (cookie.attributes.has('max-age')) {
    const parsed = Number.parseInt(String(cookie.attributes.get('max-age')), 10);
    if (Number.isFinite(parsed)) return parsed;
    return null;
  }
  if (cookie.attributes.has('expires')) {
    const parsed = Date.parse(String(cookie.attributes.get('expires')));
    if (Number.isFinite(parsed)) return Math.round((parsed - now) / 1000);
    return null;
  }
  return null;
}

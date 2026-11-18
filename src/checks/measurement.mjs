// What the measurement calls actually carry.
//
// The findings here are split evenly between privacy and arithmetic, which
// is the honest shape of the subject: a page view counted twice and an
// address sent as an event parameter are both defects in the same file, and
// the second one is usually found by someone outside the team.

import { braceDepthAt, findCalls, readLiteral, UNRESOLVED } from '../scan/js.mjs';
import { makeFinding } from '../findings.mjs';
import { at, jsSources } from '../inputs.mjs';
import { PLACEHOLDER_MEASUREMENT_IDS } from '../vocabulary.mjs';

// Query keys that carry a direct identifier when they appear in a reported
// location. A closed list, like the rest of this repository.
export const IDENTIFIER_QUERY_KEYS = ['email', 'e', 'mail', 'phone', 'tel', 'msisdn', 'uid', 'user', 'userid', 'customer'];

export const ADDRESS_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z0-9.-]+/;
export const TELEPHONE_PATTERN = /\+?\d[\d ().-]{7,}\d/g;

// Digest lengths that are never telephone numbers. A hex digest holds long
// runs of digits, so a bare digit run pattern reads one as a number and the
// finding then lands on exactly the value somebody hashed in order to be
// careful.
export const DIGEST_LENGTHS = [32, 40, 64];

// What may sit either side of a telephone number. Everything else means the
// digits are part of a longer token.
//
// Checking only for an adjacent letter is not enough, because the separator
// characters a telephone number is allowed to contain are the same ones that
// delimit a reference: in an order reference such as the one in the test
// beside this, the digits are bounded by hyphens, the hyphens are inside the
// pattern, and the letters are two characters further out.
export const BOUNDARY_PATTERN = /^[\s,;:"'<>()[\]{}=]$/;

function boundedOnBothSides(value, match) {
  const before = match.index === 0 ? '' : value[match.index - 1];
  const afterIndex = match.index + match[0].length;
  const after = afterIndex >= value.length ? '' : value[afterIndex];
  const acceptable = (char) => char === '' || BOUNDARY_PATTERN.test(char);
  return acceptable(before) && acceptable(after);
}

// A telephone number in the international format carries at most fifteen
// digits, and at least seven is the shortest run worth looking at. The upper
// bound is what separates a number from a long reference made of digits and
// separators, which the boundary rule alone cannot do.
export const DIGITS_MIN = 7;
export const DIGITS_MAX = 15;

// Shapes that are dates rather than numbers somebody dialled. A date written
// with hyphens or slashes has eight digits and separators that are all
// inside the telephone pattern, so it stands alone exactly as a number does
// and neither the boundary rule nor the digit count can tell them apart.
export const DATE_PATTERNS = [
  /^\d{4}-\d{2}-\d{2}([T ].*)?$/,
  /^\d{2}[/-]\d{2}[/-]\d{4}$/,
  /^\d{4}\/\d{2}\/\d{2}$/
];

export function looksLikeDate(value) {
  const trimmed = String(value).trim();
  return DATE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function looksLikeTelephone(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (DIGEST_LENGTHS.includes(trimmed.length) && /^[0-9a-f]+$/i.test(trimmed)) return false;
  if (looksLikeDate(trimmed)) return false;
  TELEPHONE_PATTERN.lastIndex = 0;
  let match;
  while ((match = TELEPHONE_PATTERN.exec(value)) !== null) {
    if (!boundedOnBothSides(value, match)) continue;
    const digits = match[0].replace(/\D/g, '').length;
    if (digits < DIGITS_MIN || digits > DIGITS_MAX) continue;
    return true;
  }
  return false;
}
export const HASH_CLAIM_PATTERN = /(hashed|_sha|sha256|sha_256|digest)/i;
export const HEX_64 = /^[0-9a-f]{64}$/i;

function flatten(value, prefix = '') {
  const out = [];
  if (value instanceof Map) {
    for (const [key, inner] of value) {
      const path = prefix === '' ? key : `${prefix}.${key}`;
      out.push({ key, path, value: inner });
      out.push(...flatten(inner, path));
    }
  }
  return out;
}

function looksLikeDirectIdentifier(value) {
  if (typeof value !== 'string') return null;
  if (ADDRESS_PATTERN.test(value)) return 'an address';
  if (looksLikeTelephone(value)) return 'a telephone number';
  return null;
}

export function checkMeasurement(inputs) {
  const findings = [];
  const scripts = jsSources(inputs);

  let manualPageView = false;
  const configCalls = [];

  for (const script of scripts) {
    const calls = findCalls(script.source);
    const byId = new Map();

    for (const call of calls) {
      const isGtag = call.callee === 'gtag' || call.callee.endsWith('.gtag');
      // Only the measurement queue, not every object with a push method. A
      // looser match reads an ordinary array append as a measurement call.
      const isPush = call.callee === 'dataLayer.push' || call.callee.endsWith('.dataLayer.push');
      if (!isGtag && !isPush) continue;

      const first = readLiteral(call.args[0] || '');
      const where = at(script, call.line);

      if (isGtag && first === 'config') {
        const id = readLiteral(call.args[1] || '');
        const options = call.args[2] === undefined ? UNRESOLVED : readLiteral(call.args[2]);
        configCalls.push({ script, call, id, options });
        if (typeof id === 'string') {
          if (PLACEHOLDER_MEASUREMENT_IDS.includes(id) || /X{4,}/.test(id)) {
            findings.push(makeFinding('measurement-id-placeholder', 'error', where,
              `the configuration call still carries the placeholder ${id}`));
          }
          const seen = byId.get(id) || 0;
          byId.set(id, seen + 1);
          if (seen + 1 === 2) {
            findings.push(makeFinding('measurement-duplicate-config-call', 'warning', where,
              `${id} is configured twice in this file`));
          }
        }
      }

      if (isGtag && first === 'event' && readLiteral(call.args[1] || '') === 'page_view') {
        manualPageView = true;
      }

      const payload = isGtag
        ? (call.args[2] === undefined ? readLiteral(call.args[1] || '') : readLiteral(call.args[2]))
        : readLiteral(call.args[0] || '');
      if (!(payload instanceof Map)) continue;

      for (const entry of flatten(payload)) {
        const kind = looksLikeDirectIdentifier(entry.value);
        const isLocation = ['page_path', 'page_location', 'page_referrer'].includes(entry.key);

        if (isLocation && typeof entry.value === 'string') {
          const query = entry.value.includes('?') ? entry.value.slice(entry.value.indexOf('?') + 1) : '';
          const keys = query.split('&').map((pair) => pair.split('=')[0].toLowerCase()).filter(Boolean);
          const identifying = keys.filter((key) => IDENTIFIER_QUERY_KEYS.includes(key));
          if (identifying.length > 0 || kind !== null) {
            findings.push(makeFinding('measurement-pii-in-page-path', 'error', where,
              `${entry.key} reports a location carrying ${identifying.length > 0 ? identifying.join(', ') : kind}`));
            continue;
          }
        }

        if (kind !== null && !isLocation) {
          findings.push(makeFinding('measurement-pii-in-parameter', 'error', where,
            `the parameter ${entry.path} carries ${kind}`));
        }

        if (HASH_CLAIM_PATTERN.test(entry.key) && typeof entry.value === 'string' && !HEX_64.test(entry.value)) {
          findings.push(makeFinding('measurement-raw-value-sent-as-hashed', 'error', where,
            `the parameter ${entry.path} is named as hashed and carries a plain literal`));
        }

        if (entry.key === 'debug_mode' && entry.value === true) {
          findings.push(makeFinding('measurement-debug-mode-enabled', 'warning', where,
            'debug mode is on, so these events stay out of the reports'));
        }

        if (entry.key === 'user_id' && braceDepthAt(script.source, call.index) === 0) {
          findings.push(makeFinding('measurement-user-id-without-basis', 'warning', where,
            'a user id is set at the top level of the script, outside any consent branch'));
        }
      }
    }
  }

  if (manualPageView) {
    for (const config of configCalls) {
      const options = config.options;
      const suppressed = options instanceof Map && options.get('send_page_view') === false;
      if (!suppressed) {
        findings.push(makeFinding('measurement-page-view-double-counted', 'warning',
          at(config.script, config.call.line),
          'the configuration call sends a page view and a manual page view is sent as well'));
      }
    }
  }

  return findings;
}

export const __internal = { flatten, looksLikeDirectIdentifier };

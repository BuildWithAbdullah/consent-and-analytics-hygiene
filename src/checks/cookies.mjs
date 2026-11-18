// Set-Cookie attributes, and the timing of the cookies themselves.
//
// Several of these are not about privacy at all: a cookie that breaks the
// host prefix rules is not stored, so the code that reads it sees an absent
// value rather than an error, and that failure looks exactly like a consent
// problem from the outside.

import { cookiesIn, headerValues, lifetimeSeconds, normaliseAttributeValue } from '../scan/headers.mjs';
import { makeFinding } from '../findings.mjs';
import { CAPS, isAnalyticsCookieName, isConsentCookieName } from '../vocabulary.mjs';

// Names, as substrings, that mark a cookie as carrying a session or an
// authenticated identity.
export const SESSION_COOKIE_WORDS = ['sess', 'sid', 'auth', 'login', 'token', 'remember'];

function isSessionCookieName(name) {
  const lowered = name.toLowerCase();
  if (isAnalyticsCookieName(name)) return false;
  return SESSION_COOKIE_WORDS.some((word) => lowered.includes(word));
}

// Two spellings of the same attribute are the same attribute. Comparing the
// raw header text instead is how a duplicate check reports a difference that
// is only whitespace or letter case.
function attributeSignature(cookie) {
  return [...cookie.attributes.entries()]
    .map(([name, value]) => `${name}=${normaliseAttributeValue(value)}`)
    .sort()
    .join('; ');
}

export function checkCookies(inputs) {
  const findings = [];

  for (const file of inputs.headers) {
    const capture = file.capture;
    const cookies = cookiesIn(capture);
    const phases = new Set(capture.responses.map((response) => response.phase));

    for (const cookie of cookies) {
      const where = { path: cookie.path, line: cookie.line };
      const hasSecure = cookie.attributes.has('secure');
      const sameSite = cookie.attributes.has('samesite')
        ? String(normaliseAttributeValue(cookie.attributes.get('samesite')))
        : null;

      if (sameSite === null) {
        findings.push(makeFinding('cookie-no-samesite', 'warning', where,
          `${cookie.name} is set with no SameSite attribute`));
      } else if (sameSite === 'none' && !hasSecure) {
        findings.push(makeFinding('cookie-samesite-none-without-secure', 'error', where,
          `${cookie.name} asks to be sent cross site and is not Secure, so it is rejected`));
      }

      if (isSessionCookieName(cookie.name) && !cookie.attributes.has('httponly')) {
        findings.push(makeFinding('cookie-session-not-httponly', 'error', where,
          `${cookie.name} looks like a session cookie and is readable from script`));
      }

      if (cookie.name.startsWith('__Host-')) {
        const path = cookie.attributes.has('path') ? String(cookie.attributes.get('path')) : null;
        const broken = [];
        if (!hasSecure) broken.push('it is not Secure');
        if (cookie.attributes.has('domain')) broken.push('it carries a Domain attribute');
        if (path !== '/') broken.push(`its Path is ${path === null ? 'absent' : path}`);
        if (broken.length > 0) {
          findings.push(makeFinding('cookie-host-prefix-violation', 'error', where,
            `${cookie.name} is not stored because ${broken.join(' and ')}`));
        }
      } else if (cookie.name.startsWith('__Secure-') && !hasSecure) {
        findings.push(makeFinding('cookie-secure-prefix-violation', 'error', where,
          `${cookie.name} carries the secure prefix and is not Secure, so it is rejected`));
      }

      const lifetime = lifetimeSeconds(cookie);
      if (lifetime !== null && lifetime > CAPS.cookieHardSeconds) {
        findings.push(makeFinding('cookie-lifetime-excessive', 'error', where,
          `${cookie.name} lives ${Math.round(lifetime / 86400)} days, beyond the hard cap of ${Math.round(CAPS.cookieHardSeconds / 86400)}`));
      } else if (lifetime !== null && lifetime > CAPS.cookieSoftSeconds) {
        findings.push(makeFinding('cookie-lifetime-excessive', 'warning', where,
          `${cookie.name} lives ${Math.round(lifetime / 86400)} days, beyond the cap of ${Math.round(CAPS.cookieSoftSeconds / 86400)}`));
      }

      if (cookie.phase === 'pre-consent' && isAnalyticsCookieName(cookie.name)) {
        findings.push(makeFinding('cookie-analytics-set-before-consent', 'error', where,
          `${cookie.name} is set in a response captured before the decision`));
      }

      if (cookie.attributes.has('domain')) {
        const domain = String(normaliseAttributeValue(cookie.attributes.get('domain')));
        const bare = domain.replace(/^\./, '');
        const wider = domain.startsWith('.') || (cookie.host !== null && cookie.host !== bare);
        if (wider) {
          findings.push(makeFinding('cookie-domain-wider-than-host', 'warning', where,
            `${cookie.name} is scoped to ${domain}, which is wider than the host that set it`));
        }
      }
    }

    if (phases.has('post-consent')) {
      const recorded = cookies.some(
        (cookie) => cookie.phase === 'post-consent' && isConsentCookieName(cookie.name)
      );
      const headerRecord = headerValues(capture, 'x-consent-state').some(
        (header) => header.phase === 'post-consent'
      );
      if (!recorded && !headerRecord) {
        const response = capture.responses.find((candidate) => candidate.phase === 'post-consent');
        findings.push(makeFinding('cookie-consent-record-not-persisted', 'error',
          { path: file.path, line: response ? response.line : 1 },
          'the post decision response carries no cookie or header holding the decision'));
      }
    }

    const byPhaseAndName = new Map();
    for (const cookie of cookies) {
      const key = `${cookie.phase}\u0000${cookie.name}`;
      const list = byPhaseAndName.get(key) || [];
      list.push(cookie);
      byPhaseAndName.set(key, list);
    }
    for (const [, list] of byPhaseAndName) {
      if (list.length < 2) continue;
      const signatures = new Set(list.map((cookie) => attributeSignature(cookie)));
      if (signatures.size > 1) {
        findings.push(makeFinding('cookie-duplicate-name-conflicting-attributes', 'warning',
          { path: list[1].path, line: list[1].line },
          `${list[0].name} is set ${list.length} times with attributes that differ`));
      }
    }
  }

  return findings;
}

export const __internal = { attributeSignature, isSessionCookieName };

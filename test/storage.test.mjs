import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONSENT_KEY_WORDS, FINGERPRINTING_CALLS, FINGERPRINTING_READS, IDENTIFIER_KEY_WORDS,
  PREFETCH_RELS, gateIndex, __internal
} from '../src/checks/storage.mjs';
import { NOTICE, PAGE_SHELL, html, js, only, tokens } from './helpers.mjs';

const GATE = `function onAccept() {
  gtag('consent', 'update', {
    ad_storage: 'granted',
    ad_user_data: 'granted',
    ad_personalization: 'granted',
    analytics_storage: 'granted'
  });
}
`;
const DENIED = `gtag('consent', 'default', {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: 'denied',
  wait_for_update: 500
});
gtag('set', 'ads_data_redaction', true);
gtag('set', 'url_passthrough', true);
`;

test('the gate is the first consent update in the file', () => {
  const source = `var a = 1;\n${GATE}`;
  assert.ok(gateIndex(source) > source.indexOf('var a'));
  assert.ok(Number.isFinite(gateIndex(source)));
});

test('a file with no gate at all has no gate position', () => {
  assert.equal(gateIndex('var a = 1;'), Number.POSITIVE_INFINITY);
});

test('a named consent helper counts as a gate', () => {
  for (const name of ['hasConsent', 'getConsent', 'readAnalyticsConsent', 'checkConsent']) {
    assert.ok(Number.isFinite(gateIndex(`${name}('analytics');`)), name);
  }
});

test('a condition mentioning consent counts as a gate', () => {
  assert.ok(Number.isFinite(gateIndex("if (state.consentGiven) { send(); }")));
});

test('an identifier written to storage above the gate is reported', () => {
  const source = `${DENIED}\nlocalStorage.setItem('visitor_id', 'x');\n${GATE}`;
  const found = only([js(source)], 'storage-identifier-before-consent');
  assert.equal(found.length, 1);
});

test('the same write below the gate is not reported', () => {
  const source = `${DENIED}\nfunction onAccept() {\n  gtag('consent', 'update', { ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted', analytics_storage: 'granted' });\n  localStorage.setItem('visitor_id', 'x');\n}\n`;
  assert.deepEqual(only([js(source)], 'storage-identifier-before-consent'), []);
});

test('each identifier word marks a storage key', () => {
  for (const word of IDENTIFIER_KEY_WORDS) {
    assert.equal(__internal.mentionsIdentifier(`a_${word}_b`), true, word);
  }
});

test('an identifier word inside a longer word does not count', () => {
  // Matching a bare substring turns every key with those letters in it into
  // an identifier, and the most common of them is three letters long.
  assert.equal(__internal.mentionsIdentifier('idea'), false);
  assert.equal(__internal.mentionsIdentifier('hidden'), false);
  assert.equal(__internal.mentionsIdentifier('sidebar'), false);
});

test('a consent key is never read as an identifier', () => {
  for (const word of CONSENT_KEY_WORDS) {
    assert.equal(__internal.mentionsIdentifier(`${word}_id`), false, word);
    assert.equal(__internal.mentionsConsent(`${word}_id`), true, word);
  }
});

test('sessionStorage is read as well as localStorage', () => {
  const source = `${DENIED}\nsessionStorage.setItem('device_id', 'x');\n${GATE}`;
  assert.equal(only([js(source)], 'storage-identifier-before-consent').length, 1);
});

test('a beacon to a tracker above the gate is reported', () => {
  const source = `${DENIED}\nnavigator.sendBeacon('https://api.segment.io/v1/t', 'x');\n${GATE}`;
  assert.equal(only([js(source)], 'beacon-before-consent').length, 1);
});

test('a fetch to a tracker above the gate is reported', () => {
  const source = `${DENIED}\nfetch('https://www.google-analytics.com/collect');\n${GATE}`;
  assert.equal(only([js(source)], 'beacon-before-consent').length, 1);
});

test('a request opened through XMLHttpRequest is reported', () => {
  const source = `${DENIED}\nvar request = new XMLHttpRequest();\nrequest.open('POST', 'https://api.segment.io/v1/t');\n${GATE}`;
  assert.equal(only([js(source)], 'beacon-before-consent').length, 1);
});

test('a request to the site itself is not reported', () => {
  const source = `${DENIED}\nfetch('https://shop.example.com/api/cart');\n${GATE}`;
  assert.deepEqual(only([js(source)], 'beacon-before-consent'), []);
});

test('a target assembled at runtime is not reported rather than guessed at', () => {
  const source = `${DENIED}\nvar endpoint = atob('aGVsbG8=');\nnavigator.sendBeacon(endpoint, 'x');\n${GATE}`;
  assert.deepEqual(only([js(source)], 'beacon-before-consent'), []);
});

test('each fingerprinting call above the gate is reported', () => {
  for (const name of FINGERPRINTING_CALLS) {
    const source = `${DENIED}\nvar surface = thing.${name}();\n${GATE}`;
    assert.equal(only([js(source)], 'fingerprinting-surface-before-consent').length, 1, name);
  }
});

test('each fingerprinting read above the gate is reported', () => {
  for (const read of FINGERPRINTING_READS) {
    const source = `${DENIED}\nvar surface = ${read};\n${GATE}`;
    assert.ok(only([js(source)], 'fingerprinting-surface-before-consent').length >= 1, read);
  }
});

test('a fingerprinting call below the gate is not reported', () => {
  const source = `${DENIED}\nfunction onAccept() {\n  gtag('consent', 'update', { ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted', analytics_storage: 'granted' });\n  var surface = canvas.toDataURL();\n}\n`;
  assert.deepEqual(only([js(source)], 'fingerprinting-surface-before-consent'), []);
});

test('a decision kept only in client storage is a notice', () => {
  const source = "function record() { localStorage.setItem('cookie_consent', 'all'); }";
  const found = only([js(source)], 'storage-consent-state-client-only');
  assert.deepEqual(found.map((finding) => finding.severity), ['notice']);
});

test('a decision mirrored into a cookie is not reported', () => {
  const source = "function record() {\n  localStorage.setItem('cookie_consent', 'all');\n  document.cookie = 'cookie_consent=all; Path=/; Secure';\n}";
  assert.deepEqual(only([js(source)], 'storage-consent-state-client-only'), []);
});

test('each prefetch relation to a tracker is reported', () => {
  for (const rel of PREFETCH_RELS) {
    const page = PAGE_SHELL(NOTICE).replace('</head>', `<link rel="${rel}" href="https://www.google-analytics.com">\n</head>`);
    assert.deepEqual(tokens([html(page)]), ['prefetch-to-tracker-before-consent@warning'], rel);
  }
});

test('a stylesheet link is not a prefetch', () => {
  const page = PAGE_SHELL(NOTICE).replace('</head>', '<link rel="stylesheet" href="https://cdn.example.com/a.css">\n</head>');
  assert.deepEqual(tokens([html(page)]), []);
});

test('a prefetch to a host outside the documented list is not reported', () => {
  const page = PAGE_SHELL(NOTICE).replace('</head>', '<link rel="preconnect" href="https://cdn.example.com">\n</head>');
  assert.deepEqual(tokens([html(page)]), []);
});

test('a tracking pixel in a noscript element is reported', () => {
  // The contents of a noscript element are read as elements here, because a
  // static reader has no scripting state to switch on. A browser with
  // scripting enabled treats them as text, which is exactly why a consent
  // gate written in script cannot reach them.
  const page = PAGE_SHELL(`${NOTICE}\n<noscript><img src="https://www.facebook.com/tr?id=1" alt=""></noscript>`);
  assert.deepEqual(tokens([html(page)]), ['pixel-in-noscript-ungated@error']);
});

test('a frame in a noscript element is reported too', () => {
  const page = PAGE_SHELL(`${NOTICE}\n<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-EXAMPLE1"></iframe></noscript>`);
  assert.deepEqual(tokens([html(page)]), ['pixel-in-noscript-ungated@error']);
});

test('an ordinary image in a noscript element is not reported', () => {
  const page = PAGE_SHELL(`${NOTICE}\n<noscript><img src="https://cdn.example.com/logo.png" alt="Example store"></noscript>`);
  assert.deepEqual(tokens([html(page)]), []);
});

test('a tracker image outside a noscript element is not this finding', () => {
  const page = PAGE_SHELL(`${NOTICE}\n<img src="https://www.facebook.com/tr?id=1" alt="">`);
  assert.deepEqual(only([html(page)], 'pixel-in-noscript-ungated'), []);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DIGEST_LENGTHS, HEX_64, IDENTIFIER_QUERY_KEYS, looksLikeTelephone, __internal
} from '../src/checks/measurement.mjs';
import { PLACEHOLDER_MEASUREMENT_IDS } from '../src/vocabulary.mjs';
import { js, only, tokens } from './helpers.mjs';

const DIGEST = '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8';

test('an ordinary event reports nothing', () => {
  assert.deepEqual(tokens([js("gtag('event', 'add_to_cart', { value: 19.99, currency: 'GBP' });")]), []);
});

test('an address in a parameter is reported', () => {
  const found = only([js("gtag('event', 'sign_up', { email: 'buyer@example.com' });")], 'measurement-pii-in-parameter');
  assert.equal(found.length, 1);
  assert.match(found[0].detail, /an address/);
});

test('a telephone number in a parameter is reported', () => {
  const found = only([js("gtag('event', 'sign_up', { contact: '+1 555 0142' });")], 'measurement-pii-in-parameter');
  assert.equal(found.length, 1);
  assert.match(found[0].detail, /telephone/);
});

test('a nested parameter is reported with its path', () => {
  const found = only([js("gtag('event', 'purchase', { customer: { email: 'buyer@example.com' } });")], 'measurement-pii-in-parameter');
  assert.equal(found.length, 1);
  assert.match(found[0].detail, /customer\.email/);
});

test('a hex digest is not a telephone number', () => {
  // A digest holds long runs of digits, so a bare digit run pattern reads
  // one as a number and the finding then lands on exactly the value somebody
  // hashed in order to be careful.
  assert.equal(looksLikeTelephone(DIGEST), false);
  assert.deepEqual(tokens([js(`gtag('event', 'sign_up', { phone_hashed: '${DIGEST}' });`)]), []);
});

test('the three digest lengths are the documented set', () => {
  assert.deepEqual(DIGEST_LENGTHS, [32, 40, 64]);
  for (const length of DIGEST_LENGTHS) {
    assert.equal(looksLikeTelephone(DIGEST.slice(0, length)), false, String(length));
  }
});

test('a digit run inside a longer token is not a number', () => {
  // Checking only for an adjacent letter misses this: the digits here are
  // bounded by hyphens, which are inside the telephone pattern, and the
  // letters are two characters further out.
  assert.equal(looksLikeTelephone('order-1234567890-eu'), false);
  assert.equal(looksLikeTelephone('v1234567890'), false);
  assert.equal(looksLikeTelephone('build-20261118-1234567890'), false);
  assert.equal(looksLikeTelephone('1234567890.1234567890'), false);
});

test('a run longer than an international number is not a number', () => {
  // The boundary rule cannot separate a number from a long reference made of
  // digits and separators, because both stand alone. The upper bound on the
  // digit count can.
  // Assembled at run time, because the repository asserts that no tracked
  // file carries a run of thirteen or more digits, and a test that declares
  // its own needle as a literal reports itself.
  const fifteen = `${'12345'}${'67890'}${'12345'}`;
  assert.equal(looksLikeTelephone(fifteen), true);
  assert.equal(looksLikeTelephone(`${fifteen}6`), false);
});

test('a digit run standing alone is still a number', () => {
  assert.equal(looksLikeTelephone('1234567890'), true);
  assert.equal(looksLikeTelephone('call 555 0142 7788 now'), true);
});

test('a short number is not a telephone number', () => {
  assert.equal(looksLikeTelephone('12345'), false);
  assert.equal(looksLikeTelephone('u-4821'), false);
});

test('a non string value is never an identifier', () => {
  assert.equal(looksLikeTelephone(42), false);
  assert.equal(__internal.looksLikeDirectIdentifier(42), null);
  assert.equal(__internal.looksLikeDirectIdentifier(true), null);
});

test('each identifier query key in a reported location is found', () => {
  for (const key of IDENTIFIER_QUERY_KEYS) {
    const found = tokens([js(`gtag('event', 'page_view', { page_path: '/thanks?${key}=x' });`)]);
    assert.deepEqual(found, ['measurement-pii-in-page-path@error'], key);
  }
});

test('an address in a reported location is the location finding and not the parameter one', () => {
  const found = tokens([js("gtag('event', 'page_view', { page_location: 'https://shop.example.com/t?u=buyer@example.com' });")]);
  assert.deepEqual(found, ['measurement-pii-in-page-path@error']);
});

test('an ordinary query string in a reported location is accepted', () => {
  assert.deepEqual(tokens([js("gtag('event', 'page_view', { page_path: '/search?q=boots&page=2' });")]), []);
});

test('a user id set at the top level is reported', () => {
  const found = only([js("gtag('config', 'G-EXAMPLE1', { user_id: 'u-4821' });")], 'measurement-user-id-without-basis');
  assert.equal(found.length, 1);
});

test('a user id set inside a branch is not reported', () => {
  const source = "if (hasConsent('analytics')) {\n  gtag('config', 'G-EXAMPLE1', { user_id: 'u-4821' });\n}";
  assert.deepEqual(only([js(source)], 'measurement-user-id-without-basis'), []);
});

test('debug mode on is reported', () => {
  const found = only([js("gtag('config', 'G-EXAMPLE1', { debug_mode: true });")], 'measurement-debug-mode-enabled');
  assert.equal(found.length, 1);
});

test('debug mode off is not reported', () => {
  assert.deepEqual(tokens([js("gtag('config', 'G-EXAMPLE1', { debug_mode: false });")]), []);
});

test('each documented placeholder id is reported', () => {
  for (const id of PLACEHOLDER_MEASUREMENT_IDS) {
    const found = tokens([js(`gtag('config', '${id}');`)]);
    assert.deepEqual(found, ['measurement-id-placeholder@error'], id);
  }
});

test('an id made of four or more capital X characters is reported', () => {
  assert.deepEqual(tokens([js("gtag('config', 'G-XXXX1');")]), ['measurement-id-placeholder@error']);
});

test('a real looking id is accepted', () => {
  assert.deepEqual(tokens([js("gtag('config', 'G-EXAMPLE1');")]), []);
});

test('one destination configured twice is reported once', () => {
  const found = only([js("gtag('config', 'G-EXAMPLE1');\ngtag('config', 'G-EXAMPLE1');")], 'measurement-duplicate-config-call');
  assert.equal(found.length, 1);
});

test('three configuration calls for one destination are still reported once', () => {
  const found = only([js("gtag('config', 'G-X1');\ngtag('config', 'G-X1');\ngtag('config', 'G-X1');")], 'measurement-duplicate-config-call');
  assert.equal(found.length, 1);
});

test('two destinations configured once each are accepted', () => {
  assert.deepEqual(tokens([js("gtag('config', 'G-EXAMPLE1');\ngtag('config', 'G-EXAMPLE2');")]), []);
});

test('a parameter named as hashed carrying a plain value is reported', () => {
  for (const key of ['email_hashed', 'hashed_email', 'email_sha256', 'phone_digest']) {
    const found = tokens([js(`gtag('event', 'sign_up', { ${key}: 'plain' });`)]);
    assert.deepEqual(found, ['measurement-raw-value-sent-as-hashed@error'], key);
  }
});

test('a parameter named as hashed carrying a digest is accepted', () => {
  assert.ok(HEX_64.test(DIGEST));
  assert.deepEqual(tokens([js(`gtag('event', 'sign_up', { email_hashed: '${DIGEST}' });`)]), []);
});

test('a manual page view beside the automatic one is reported', () => {
  const found = only([js("gtag('config', 'G-EXAMPLE1');\ngtag('event', 'page_view', {});")], 'measurement-page-view-double-counted');
  assert.equal(found.length, 1);
});

test('a manual page view with the automatic one suppressed is accepted', () => {
  const source = "gtag('config', 'G-EXAMPLE1', { send_page_view: false });\ngtag('event', 'page_view', {});";
  assert.deepEqual(tokens([js(source)]), []);
});

test('a manual page view with no configuration call at all is not reported', () => {
  assert.deepEqual(only([js("gtag('event', 'page_view', {});")], 'measurement-page-view-double-counted'), []);
});

test('the measurement queue is read and an ordinary array append is not', () => {
  // A looser match on push reads any array append as a measurement call,
  // which turns every list of addresses in an application into a finding.
  const queue = only([js("dataLayer.push({ event: 'sign_up', email: 'buyer@example.com' });")], 'measurement-pii-in-parameter');
  assert.equal(queue.length, 1);
  const ordinary = only([js("var recipients = [];\nrecipients.push({ email: 'buyer@example.com' });")], 'measurement-pii-in-parameter');
  assert.deepEqual(ordinary, []);
});

test('the queue is also read through window', () => {
  const found = only([js("window.dataLayer.push({ email: 'buyer@example.com' });")], 'measurement-pii-in-parameter');
  assert.equal(found.length, 1);
});

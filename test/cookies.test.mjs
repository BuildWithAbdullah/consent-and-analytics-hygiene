import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SESSION_COOKIE_WORDS } from '../src/checks/cookies.mjs';
import { CAPS } from '../src/vocabulary.mjs';
import { headers, only, tokens } from './helpers.mjs';

function capture(lines, { host = 'shop.example.com', phase = null } = {}) {
  const head = [`--- host: ${host}`];
  if (phase) head.push(`--- phase: ${phase}`);
  return headers([...head, 'HTTP/1.1 200 OK', 'Content-Type: text/html', ...lines].join('\n'));
}

const CLEAN = 'Set-Cookie: pref=dark; Path=/; Secure; SameSite=Lax';

test('a clean cookie reports nothing', () => {
  assert.deepEqual(tokens([capture([CLEAN])]), []);
});

test('a cookie with no SameSite is reported', () => {
  const found = only([capture(['Set-Cookie: pref=dark; Path=/; Secure'])], 'cookie-no-samesite');
  assert.equal(found.length, 1);
  assert.match(found[0].detail, /pref/);
});

test('SameSite=None without Secure is reported and the missing attribute finding is not', () => {
  const found = tokens([capture(['Set-Cookie: pref=dark; Path=/; SameSite=None'])]);
  assert.deepEqual(found, ['cookie-samesite-none-without-secure@error']);
});

test('SameSite=None with Secure is accepted', () => {
  assert.deepEqual(tokens([capture(['Set-Cookie: pref=dark; Path=/; Secure; SameSite=None'])]), []);
});

test('the SameSite value is read case insensitively', () => {
  assert.deepEqual(tokens([capture(['Set-Cookie: pref=dark; Path=/; Secure; samesite=none'])]), []);
});

test('each session word marks a cookie as needing HttpOnly', () => {
  for (const word of SESSION_COOKIE_WORDS) {
    const found = tokens([capture([`Set-Cookie: my_${word}_x=1; Path=/; Secure; SameSite=Lax`])]);
    assert.deepEqual(found, ['cookie-session-not-httponly@error'], word);
  }
});

test('a session cookie with HttpOnly is accepted', () => {
  assert.deepEqual(tokens([capture(['Set-Cookie: sessionid=1; Path=/; Secure; HttpOnly; SameSite=Lax'])]), []);
});

test('a measurement cookie is not judged as a session cookie', () => {
  // A measurement cookie is read from script on purpose, so asking for
  // HttpOnly on it would be a finding that cannot be acted on.
  assert.deepEqual(tokens([capture(['Set-Cookie: _gid=1; Path=/; Secure; SameSite=Lax'])]), []);
});

test('each host prefix rule is reported with the reason it broke', () => {
  const cases = [
    ['Set-Cookie: __Host-a=1; Path=/; SameSite=Lax', /not Secure/],
    ['Set-Cookie: __Host-a=1; Path=/; Secure; SameSite=Lax; Domain=example.com', /Domain attribute/],
    ['Set-Cookie: __Host-a=1; Path=/account; Secure; SameSite=Lax', /Path is \/account/],
    ['Set-Cookie: __Host-a=1; Secure; SameSite=Lax', /Path is absent/]
  ];
  for (const [line, expected] of cases) {
    const found = only([capture([line])], 'cookie-host-prefix-violation');
    assert.equal(found.length, 1, line);
    assert.match(found[0].detail, expected);
  }
});

test('a correct host prefixed cookie is accepted', () => {
  assert.deepEqual(tokens([capture(['Set-Cookie: __Host-a=1; Path=/; Secure; SameSite=Lax'])]), []);
});

test('a secure prefixed cookie without Secure is reported', () => {
  const found = only([capture(['Set-Cookie: __Secure-a=1; Path=/; SameSite=Lax'])], 'cookie-secure-prefix-violation');
  assert.equal(found.length, 1);
});

test('the two prefix findings are never both reported for one cookie', () => {
  const found = tokens([capture(['Set-Cookie: __Host-a=1; Path=/; SameSite=Lax'])]);
  assert.equal(found.filter((token) => token.includes('prefix-violation')).length, 1);
});

test('a lifetime past the cap is a warning and past the hard cap an error', () => {
  const soft = only([capture([`Set-Cookie: pref=1; Path=/; Secure; SameSite=Lax; Max-Age=${CAPS.cookieSoftSeconds + 1}`])], 'cookie-lifetime-excessive');
  assert.deepEqual(soft.map((finding) => finding.severity), ['warning']);
  const hard = only([capture([`Set-Cookie: pref=1; Path=/; Secure; SameSite=Lax; Max-Age=${CAPS.cookieHardSeconds + 1}`])], 'cookie-lifetime-excessive');
  assert.deepEqual(hard.map((finding) => finding.severity), ['error']);
});

test('a lifetime exactly at the cap is accepted', () => {
  assert.deepEqual(tokens([capture([`Set-Cookie: pref=1; Path=/; Secure; SameSite=Lax; Max-Age=${CAPS.cookieSoftSeconds}`])]), []);
});

test('a session cookie with no lifetime is not reported for its lifetime', () => {
  assert.deepEqual(only([capture([CLEAN])], 'cookie-lifetime-excessive'), []);
});

test('a measurement cookie in the pre consent phase is reported', () => {
  const found = only([capture(['Set-Cookie: _ga=1; Path=/; Secure; SameSite=Lax'], { phase: 'pre-consent' })], 'cookie-analytics-set-before-consent');
  assert.equal(found.length, 1);
});

test('the same cookie in the post consent phase is not reported', () => {
  const file = headers([
    '--- host: shop.example.com',
    '--- phase: post-consent',
    'HTTP/1.1 200 OK',
    'Set-Cookie: cookie_consent=all; Path=/; Secure; SameSite=Lax',
    'Set-Cookie: _ga=1; Path=/; Secure; SameSite=Lax'
  ].join('\n'));
  assert.deepEqual(tokens([file]), []);
});

test('a capture with no phase does not run the timing findings at all', () => {
  // A capture that does not say when it was taken cannot answer a question
  // about when a cookie was set, and guessing would be worse than silence.
  assert.deepEqual(tokens([capture(['Set-Cookie: _ga=1; Path=/; Secure; SameSite=Lax'])]), []);
});

test('a Domain naming a parent of the host is reported', () => {
  const found = only([capture(['Set-Cookie: pref=1; Path=/; Secure; SameSite=Lax; Domain=example.com'])], 'cookie-domain-wider-than-host');
  assert.equal(found.length, 1);
});

test('a Domain with a leading dot is reported even with no host line', () => {
  const file = headers('HTTP/1.1 200 OK\nSet-Cookie: pref=1; Path=/; Secure; SameSite=Lax; Domain=.example.com');
  assert.equal(only([file], 'cookie-domain-wider-than-host').length, 1);
});

test('a Domain equal to the host is not reported', () => {
  assert.deepEqual(tokens([capture(['Set-Cookie: pref=1; Path=/; Secure; SameSite=Lax; Domain=shop.example.com'])]), []);
});

test('no record of the decision after it was taken is reported', () => {
  const file = headers([
    '--- host: shop.example.com',
    '--- phase: post-consent',
    'HTTP/1.1 200 OK',
    'Set-Cookie: pref=dark; Path=/; Secure; SameSite=Lax'
  ].join('\n'));
  assert.deepEqual(tokens([file]), ['cookie-consent-record-not-persisted@error']);
});

test('a record carried in a header rather than a cookie is accepted', () => {
  const file = headers([
    '--- host: shop.example.com',
    '--- phase: post-consent',
    'HTTP/1.1 200 OK',
    'X-Consent-State: analytics',
    'Set-Cookie: pref=dark; Path=/; Secure; SameSite=Lax'
  ].join('\n'));
  assert.deepEqual(tokens([file]), []);
});

test('a capture with no post consent phase is not asked for a record', () => {
  assert.deepEqual(only([capture([CLEAN], { phase: 'pre-consent' })], 'cookie-consent-record-not-persisted'), []);
});

test('one name set twice with different attributes is reported', () => {
  const found = only([capture([
    'Set-Cookie: pref=dark; Path=/; Secure; SameSite=Lax',
    'Set-Cookie: pref=dark; Path=/; Secure; SameSite=Strict'
  ])], 'cookie-duplicate-name-conflicting-attributes');
  assert.equal(found.length, 1);
});

test('one name set twice with the same attributes spelled differently is not reported', () => {
  // Comparing the raw header text would call this a conflict. It is the same
  // cookie twice, and this class of false positive has been shipped twice on
  // this account in other domains.
  assert.deepEqual(tokens([capture([
    'Set-Cookie: pref=dark; Path=/; Secure; SameSite=Lax',
    'Set-Cookie: pref=dark;  path=/;  SECURE; samesite=LAX'
  ])]), []);
});

test('two different names are not compared with each other', () => {
  assert.deepEqual(tokens([capture([
    'Set-Cookie: pref=dark; Path=/; Secure; SameSite=Lax',
    'Set-Cookie: theme=dark; Path=/; Secure; SameSite=Strict'
  ])]), []);
});

test('the same name in two different phases is not a conflict', () => {
  const file = headers([
    '--- host: shop.example.com',
    '--- phase: pre-consent',
    'HTTP/1.1 200 OK',
    'Set-Cookie: pref=dark; Path=/; Secure; SameSite=Lax',
    '',
    '--- phase: post-consent',
    'HTTP/1.1 200 OK',
    'Set-Cookie: cookie_consent=all; Path=/; Secure; SameSite=Lax',
    'Set-Cookie: pref=dark; Path=/; Secure; SameSite=Strict'
  ].join('\n'));
  assert.deepEqual(tokens([file]), []);
});

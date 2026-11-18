import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PHASES, cookiesIn, headerValues, lifetimeSeconds, normaliseAttributeValue,
  parseHeaderCapture, parseSetCookie
} from '../src/scan/headers.mjs';

const CAPTURE = [
  '--- host: shop.example.com',
  '--- phase: pre-consent',
  'HTTP/1.1 200 OK',
  'Content-Type: text/html',
  'Set-Cookie: a=1; Path=/; Secure',
  '',
  '--- phase: post-consent',
  'HTTP/1.1 302 Found',
  'Set-Cookie: cookie_consent=all; Path=/',
  'X-Consent-State: analytics'
].join('\n');

test('the three phase names are the documented set', () => {
  assert.deepEqual(PHASES, ['pre-consent', 'post-consent', 'unknown']);
});

test('responses carry their phase, their host and their status', () => {
  const capture = parseHeaderCapture(CAPTURE, 'c.http');
  assert.equal(capture.responses.length, 2);
  assert.deepEqual(capture.responses.map((response) => response.phase), ['pre-consent', 'post-consent']);
  assert.deepEqual(capture.responses.map((response) => response.status), [200, 302]);
  assert.equal(capture.host, 'shop.example.com');
  assert.equal(capture.responses[0].host, 'shop.example.com');
});

test('a file with no phase line reads as one unknown phase', () => {
  const capture = parseHeaderCapture('HTTP/1.1 200 OK\nSet-Cookie: a=1');
  assert.equal(capture.responses[0].phase, 'unknown');
});

test('an unrecognised phase name is reported and read as unknown', () => {
  const capture = parseHeaderCapture('--- phase: midway\nHTTP/1.1 200 OK');
  assert.equal(capture.responses[0].phase, 'unknown');
  assert.equal(capture.problems.length, 1);
  assert.match(capture.problems[0].detail, /unknown phase name/);
});

test('a line that is neither a status line nor a header is reported', () => {
  const capture = parseHeaderCapture('HTTP/1.1 200 OK\nthis is prose');
  assert.equal(capture.problems.length, 1);
  assert.match(capture.problems[0].detail, /neither a status line nor a header/);
});

test('header names are lowered and values are kept whole', () => {
  const capture = parseHeaderCapture('HTTP/1.1 200 OK\nContent-Type: text/html; charset=utf-8');
  assert.equal(capture.responses[0].headers[0].name, 'content-type');
  assert.equal(capture.responses[0].headers[0].value, 'text/html; charset=utf-8');
});

test('headerValues finds a header across phases', () => {
  const capture = parseHeaderCapture(CAPTURE);
  const found = headerValues(capture, 'X-Consent-State');
  assert.equal(found.length, 1);
  assert.equal(found[0].phase, 'post-consent');
});

test('a header line before any status line still belongs to a response', () => {
  const capture = parseHeaderCapture('--- phase: pre-consent\nSet-Cookie: a=1');
  assert.equal(capture.responses.length, 1);
  assert.equal(capture.responses[0].phase, 'pre-consent');
});

test('cookiesIn reads the name, the value and the attributes', () => {
  const cookies = cookiesIn(parseHeaderCapture(CAPTURE));
  assert.deepEqual(cookies.map((cookie) => cookie.name), ['a', 'cookie_consent']);
  assert.equal(cookies[0].value, '1');
  assert.equal(cookies[0].attributes.get('secure'), true);
  assert.equal(cookies[0].attributes.get('path'), '/');
});

test('an attribute name is read case insensitively', () => {
  const cookie = parseSetCookie('a=1; secure; SAMESITE=Lax; httponly', 1, null);
  assert.equal(cookie.attributes.has('secure'), true);
  assert.equal(cookie.attributes.has('samesite'), true);
  assert.equal(cookie.attributes.has('httponly'), true);
});

test('a repeated attribute keeps the first spelling', () => {
  const cookie = parseSetCookie('a=1; SameSite=Lax; SameSite=Strict', 1, null);
  assert.equal(cookie.attributes.get('samesite'), 'Lax');
});

test('a cookie with no value still has a name', () => {
  const cookie = parseSetCookie('a; Path=/', 1, null);
  assert.equal(cookie.name, 'a');
  assert.equal(cookie.value, '');
});

test('attribute values are compared with case and whitespace collapsed', () => {
  // Comparing the raw bytes of a header value is how a duplicate check
  // reports a difference that is only formatting.
  assert.equal(normaliseAttributeValue(' LAX '), 'lax');
  assert.equal(normaliseAttributeValue('a  b'), 'a b');
  assert.equal(normaliseAttributeValue(true), true);
});

test('a lifetime is read from Max-Age', () => {
  const cookie = parseSetCookie('a=1; Max-Age=600', 1, null);
  assert.equal(lifetimeSeconds(cookie), 600);
});

test('a lifetime is read from Expires against a given now', () => {
  const cookie = parseSetCookie('a=1; Expires=Thu, 02 Jan 2026 00:00:00 GMT', 1, null);
  assert.equal(lifetimeSeconds(cookie, Date.parse('2026-01-01T00:00:00Z')), 86400);
});

test('a session cookie has no lifetime rather than a lifetime of zero', () => {
  const cookie = parseSetCookie('a=1; Path=/', 1, null);
  assert.equal(lifetimeSeconds(cookie), null);
});

test('an unreadable Max-Age is null rather than a guess', () => {
  const cookie = parseSetCookie('a=1; Max-Age=forever', 1, null);
  assert.equal(lifetimeSeconds(cookie), null);
});

test('an unreadable Expires is null rather than a guess', () => {
  const cookie = parseSetCookie('a=1; Expires=soon', 1, null);
  assert.equal(lifetimeSeconds(cookie), null);
});

test('Max-Age wins over Expires when both are present', () => {
  const cookie = parseSetCookie('a=1; Max-Age=60; Expires=Thu, 02 Jan 2026 00:00:00 GMT', 1, null);
  assert.equal(lifetimeSeconds(cookie, Date.parse('2026-01-01T00:00:00Z')), 60);
});

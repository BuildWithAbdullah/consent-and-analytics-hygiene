import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REQUIRED_RECORD_FIELDS } from '../src/checks/cmp.mjs';
import { CAPS } from '../src/vocabulary.mjs';
import { cmp, only, tokens } from './helpers.mjs';

const GOOD = {
  version: '2026-03-01',
  lifetimeDays: 180,
  actions: { acceptAll: true, rejectAll: true, save: true },
  withdrawal: { selector: '#privacy-choices' },
  record: { store: 'cookie', fields: ['timestamp', 'purposes', 'version'] },
  categories: [
    { id: 'necessary', essential: true, defaultEnabled: true },
    { id: 'analytics', essential: false, defaultEnabled: false }
  ]
};

function config(changes) {
  return cmp({ ...GOOD, ...changes });
}

test('a complete configuration reports nothing', () => {
  assert.deepEqual(tokens([config({})]), []);
});

test('the required record fields are the documented pair', () => {
  assert.deepEqual(REQUIRED_RECORD_FIELDS, ['timestamp', 'purposes']);
});

test('no reject action is reported', () => {
  const found = only([config({ actions: { acceptAll: true, save: true } })], 'cmp-no-reject-all');
  assert.equal(found.length, 1);
});

test('a reject action set to something other than true does not count', () => {
  const found = only([config({ actions: { acceptAll: true, rejectAll: 'maybe' } })], 'cmp-no-reject-all');
  assert.equal(found.length, 1);
});

test('no actions object at all is reported', () => {
  const found = only([config({ actions: undefined })], 'cmp-no-reject-all');
  assert.equal(found.length, 1);
});

test('a non essential category starting enabled is reported', () => {
  const found = only([config({
    categories: [
      { id: 'necessary', essential: true, defaultEnabled: true },
      { id: 'analytics', essential: false, defaultEnabled: true }
    ]
  })], 'cmp-categories-pre-enabled');
  assert.equal(found.length, 1);
  assert.match(found[0].detail, /analytics/);
});

test('the essential category may start enabled', () => {
  assert.deepEqual(only([config({})], 'cmp-categories-pre-enabled'), []);
});

test('a category with no id is still reported, by position', () => {
  const found = only([config({
    categories: [{ essential: false, defaultEnabled: true }]
  })], 'cmp-categories-pre-enabled');
  assert.equal(found.length, 1);
  assert.match(found[0].detail, /with no id/);
});

test('a lifetime past the cap is a warning and past the hard cap an error', () => {
  const soft = only([config({ lifetimeDays: CAPS.consentSoftDays + 1 })], 'cmp-consent-lifetime-excessive');
  assert.deepEqual(soft.map((finding) => finding.severity), ['warning']);
  const hard = only([config({ lifetimeDays: CAPS.consentHardDays + 1 })], 'cmp-consent-lifetime-excessive');
  assert.deepEqual(hard.map((finding) => finding.severity), ['error']);
});

test('a lifetime exactly at the cap is accepted', () => {
  assert.deepEqual(tokens([config({ lifetimeDays: CAPS.consentSoftDays })]), []);
});

test('a lifetime that is not a number is not reported rather than guessed at', () => {
  assert.deepEqual(only([config({ lifetimeDays: 'six months' })], 'cmp-consent-lifetime-excessive'), []);
});

test('no withdrawal entry point is reported', () => {
  assert.equal(only([config({ withdrawal: undefined })], 'cmp-no-withdrawal-mechanism').length, 1);
});

test('an empty withdrawal object is reported', () => {
  assert.equal(only([config({ withdrawal: {} })], 'cmp-no-withdrawal-mechanism').length, 1);
});

test('a withdrawal selector that is only whitespace is reported', () => {
  assert.equal(only([config({ withdrawal: { selector: '   ' } })], 'cmp-no-withdrawal-mechanism').length, 1);
});

test('a withdrawal declared any other way is accepted', () => {
  assert.deepEqual(only([config({ withdrawal: { url: '/privacy#choices' } })], 'cmp-no-withdrawal-mechanism'), []);
});

test('no record at all is reported', () => {
  const found = only([config({ record: undefined })], 'cmp-no-consent-record');
  assert.equal(found.length, 1);
  assert.match(found[0].detail, /stores no record/);
});

test('a record missing a required field names the field', () => {
  const found = only([config({ record: { store: 'cookie', fields: ['purposes', 'version'] } })], 'cmp-no-consent-record');
  assert.equal(found.length, 1);
  assert.match(found[0].detail, /timestamp/);
});

test('a record missing both required fields names both', () => {
  const found = only([config({ record: { store: 'cookie', fields: ['version'] } })], 'cmp-no-consent-record');
  assert.match(found[0].detail, /timestamp and purposes/);
});

test('an objection toggle starting in the non objecting position is reported', () => {
  const found = only([config({
    legitimateInterest: [{ purposeId: 'measurement', defaultEnabled: true }]
  })], 'cmp-legitimate-interest-pre-enabled');
  assert.equal(found.length, 1);
  assert.match(found[0].detail, /measurement/);
});

test('an objection toggle for an essential purpose is not reported', () => {
  assert.deepEqual(only([config({
    legitimateInterest: [{ purposeId: 'security', essential: true, defaultEnabled: true }]
  })], 'cmp-legitimate-interest-pre-enabled'), []);
});

test('an unversioned configuration is reported', () => {
  const found = only([config({ version: undefined })], 'cmp-version-not-tracked');
  assert.equal(found.length, 1);
  assert.match(found[0].detail, /carries no version/);
});

test('a versioned configuration whose record drops the version is reported', () => {
  const found = only([config({ record: { store: 'cookie', fields: ['timestamp', 'purposes'] } })], 'cmp-version-not-tracked');
  assert.equal(found.length, 1);
  assert.match(found[0].detail, /does not keep the version/);
});

test('a vendor list given only by address is a notice', () => {
  const found = only([config({ vendors: { listUrl: 'https://vendors.example.com/list.json' } })], 'cmp-vendor-list-not-enumerated');
  assert.deepEqual(found.map((finding) => finding.severity), ['notice']);
});

test('a pinned vendor list version is accepted', () => {
  assert.deepEqual(tokens([config({
    vendors: { listUrl: 'https://vendors.example.com/list.json', listVersion: '2026.03' }
  })]), []);
});

test('an inline vendor list is accepted', () => {
  assert.deepEqual(tokens([config({
    vendors: { listUrl: 'https://vendors.example.com/list.json', inline: [{ id: 'one' }] }
  })]), []);
});

test('no vendors section at all is not reported', () => {
  assert.deepEqual(only([config({})], 'cmp-vendor-list-not-enumerated'), []);
});

test('a configuration that is not an object is skipped rather than throwing', () => {
  const found = tokens([cmp([])]);
  assert.ok(Array.isArray(found));
});

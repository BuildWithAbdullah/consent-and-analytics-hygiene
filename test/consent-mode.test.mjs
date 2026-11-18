import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readConsentCalls } from '../src/checks/consent-mode.mjs';
import { jsSources, buildInputs } from '../src/inputs.mjs';
import { CONSENT_TYPES, ESSENTIAL_TYPES } from '../src/vocabulary.mjs';
import { CLEAN_CONSENT, html, js, only, tokens } from './helpers.mjs';

function scripts(source) {
  return jsSources(buildInputs([{ path: 'app.js', source }]));
}

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

test('the consent types are the documented set', () => {
  assert.deepEqual(CONSENT_TYPES, [
    'ad_storage', 'analytics_storage', 'ad_user_data', 'ad_personalization',
    'functionality_storage', 'personalization_storage', 'security_storage'
  ]);
});

test('defaults, updates, configs and sets are read apart from each other', () => {
  const read = readConsentCalls(scripts(`${DENIED}\ngtag('config', 'G-EXAMPLE1');\n${CLEAN_CONSENT}`));
  assert.equal(read.defaults.length, 2);
  assert.equal(read.updates.length, 1);
  assert.equal(read.configs.length, 1);
  assert.equal(read.sets.length, 4);
});

test('a clean consent block reports nothing', () => {
  assert.deepEqual(tokens([js(CLEAN_CONSENT)]), []);
});

test('an update with no default anywhere is reported', () => {
  const found = only([js("function f() { gtag('consent', 'update', { analytics_storage: 'granted' }); }")], 'consent-default-missing');
  assert.equal(found.length, 1);
});

test('a default in the page and an update in a script together are not reported', () => {
  const page = `<!doctype html><html><body><script>\n${DENIED}</script></body></html>`;
  const script = "function f() { gtag('consent', 'update', { ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted', analytics_storage: 'granted' }); }";
  assert.deepEqual(only([html(page), js(script)], 'consent-default-missing'), []);
});

test('a granted default is reported for each granted type on the line', () => {
  const found = only([js("gtag('consent', 'default', { ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted', analytics_storage: 'granted', wait_for_update: 500 });")], 'consent-default-granted');
  assert.equal(found.length, 1);
});

test('security storage may default to granted', () => {
  assert.deepEqual(ESSENTIAL_TYPES, ['security_storage']);
  const found = only([js("gtag('consent', 'default', { security_storage: 'granted', wait_for_update: 500 });")], 'consent-default-granted');
  assert.deepEqual(found, []);
});

test('a default under the configuration call it governs is reported', () => {
  const found = only([js(`gtag('config', 'G-EXAMPLE1');\n${DENIED}`)], 'consent-default-after-config');
  assert.equal(found.length, 1);
});

test('a default above the configuration call is not reported', () => {
  assert.deepEqual(only([js(`${DENIED}\ngtag('config', 'G-EXAMPLE1');`)], 'consent-default-after-config'), []);
});

test('order is only judged within one script', () => {
  // Two files have no defined order, so comparing across them would be a
  // guess dressed up as a finding.
  const page = `<!doctype html><html><body><script>\ngtag('config', 'G-EXAMPLE1');\n</script></body></html>`;
  assert.deepEqual(only([html(page), js(DENIED)], 'consent-default-after-config'), []);
});

test('both use signals missing is an error and one missing is a warning', () => {
  const both = only([js("gtag('consent', 'default', { ad_storage: 'denied', analytics_storage: 'denied', wait_for_update: 500 });\ngtag('set', 'ads_data_redaction', true);\ngtag('set', 'url_passthrough', true);")], 'consent-missing-v2-signals');
  assert.deepEqual(both.map((finding) => finding.severity), ['error']);
  const one = only([js("gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', analytics_storage: 'denied', wait_for_update: 500 });\ngtag('set', 'ads_data_redaction', true);\ngtag('set', 'url_passthrough', true);")], 'consent-missing-v2-signals');
  assert.deepEqual(one.map((finding) => finding.severity), ['warning']);
});

test('the use signals are only asked for when storage is declared', () => {
  const found = only([js("gtag('consent', 'default', { analytics_storage: 'denied', wait_for_update: 500 });\ngtag('set', 'url_passthrough', true);")], 'consent-missing-v2-signals');
  assert.deepEqual(found, []);
});

test('a default with no wait period is reported', () => {
  const found = only([js("gtag('consent', 'default', { analytics_storage: 'denied' });\ngtag('set', 'url_passthrough', true);")], 'consent-no-wait-for-update');
  assert.equal(found.length, 1);
});

test('a wait period of zero is the same as none', () => {
  const found = only([js("gtag('consent', 'default', { analytics_storage: 'denied', wait_for_update: 0 });\ngtag('set', 'url_passthrough', true);")], 'consent-no-wait-for-update');
  assert.equal(found.length, 1);
});

test('ad storage denied without redaction is reported', () => {
  const found = only([js("gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', wait_for_update: 500 });")], 'consent-ads-data-redaction-absent');
  assert.equal(found.length, 1);
});

test('redaction set to something other than true does not count', () => {
  const found = only([js("gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', wait_for_update: 500 });\ngtag('set', 'ads_data_redaction', false);")], 'consent-ads-data-redaction-absent');
  assert.equal(found.length, 1);
});

test('analytics denied without passthrough is a notice', () => {
  const found = only([js("gtag('consent', 'default', { analytics_storage: 'denied', wait_for_update: 500 });")], 'consent-url-passthrough-absent');
  assert.deepEqual(found.map((finding) => finding.severity), ['notice']);
});

test('a default scoped to regions with nothing behind it is reported', () => {
  const found = only([js("gtag('consent', 'default', { region: ['ES'], analytics_storage: 'denied', wait_for_update: 500 });\ngtag('set', 'url_passthrough', true);")], 'consent-region-default-without-global');
  assert.equal(found.length, 1);
});

test('an unscoped default beside a region scoped one is not reported', () => {
  const source = `${DENIED}\ngtag('consent', 'default', { region: ['ES'], analytics_storage: 'denied', wait_for_update: 1000 });`;
  assert.deepEqual(only([js(source)], 'consent-region-default-without-global'), []);
});

test('an update at the top level of a script is reported', () => {
  const found = only([js(`${DENIED}\ngtag('consent', 'update', { ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted', analytics_storage: 'granted' });`)], 'consent-update-without-user-action');
  assert.equal(found.length, 1);
});

test('an update inside a handler is not reported', () => {
  assert.deepEqual(only([js(CLEAN_CONSENT)], 'consent-update-without-user-action'), []);
});

test('an unrecognised consent key is reported in a default and in an update', () => {
  const inDefault = only([js("gtag('consent', 'default', { analytics_storages: 'denied', wait_for_update: 500 });")], 'consent-storage-key-unknown');
  assert.equal(inDefault.length, 1);
  const inUpdate = only([js(`${DENIED}\nfunction f() { gtag('consent', 'update', { analytics_storages: 'granted' }); }`)], 'consent-storage-key-unknown');
  assert.equal(inUpdate.length, 1);
});

test('the control keys are not reported as unknown', () => {
  const source = "gtag('consent', 'default', { region: ['ES'], wait_for_update: 500, ads_data_redaction: true, url_passthrough: true, analytics_storage: 'denied' });";
  assert.deepEqual(only([js(source)], 'consent-storage-key-unknown'), []);
});

test('an update covering fewer types than the default is reported', () => {
  const found = only([js(`${DENIED}\nfunction f() { gtag('consent', 'update', { analytics_storage: 'granted' }); }`)], 'consent-update-partial');
  assert.equal(found.length, 1);
  assert.match(found[0].detail, /ad_personalization/);
});

test('an update covering every declared type is not reported', () => {
  assert.deepEqual(only([js(CLEAN_CONSENT)], 'consent-update-partial'), []);
});

test('a payload held in a variable is skipped rather than guessed at', () => {
  const source = "var defaults = { ad_storage: 'granted' };\ngtag('consent', 'default', defaults);";
  assert.deepEqual(tokens([js(source)]), []);
});

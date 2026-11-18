import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONSENT_STATUSES, GATE_ATTRIBUTES, NON_EXECUTABLE_SCRIPT_TYPES,
  PRE_DECISION_TRIGGER_TYPES
} from '../src/checks/tag-gating.mjs';
import { NOTICE, PAGE_SHELL, container, html, only, tokens } from './helpers.mjs';

const INIT = { triggerId: '1', name: 'Consent Initialization', type: 'CONSENT_INIT' };
const PAGES = { triggerId: '2', name: 'All Pages', type: 'PAGEVIEW' };
const INIT_TAG = {
  tagId: '9',
  name: 'Consent Mode Defaults',
  type: 'html',
  priority: 100,
  firingTriggerId: ['1'],
  consentSettings: { consentStatus: 'NEEDED', consentType: [{ value: 'security_storage' }] },
  parameter: [{ key: 'html', value: 'defaults declared here' }]
};

function exportOf(tags, triggers = [INIT, PAGES]) {
  return container({ containerVersion: { containerId: 'GTM-EXAMPLE1', tag: tags, trigger: triggers } });
}

const GOOD_CONFIG = {
  tagId: '10',
  name: 'GA4 Configuration',
  type: 'gaawc',
  priority: 0,
  firingTriggerId: ['2'],
  consentSettings: { consentStatus: 'NEEDED', consentType: [{ value: 'analytics_storage' }] },
  parameter: [{ key: 'measurementId', value: 'G-EXAMPLE1' }]
};

test('the three consent statuses are the documented set', () => {
  assert.deepEqual(CONSENT_STATUSES, ['NOT_SET', 'NOT_NEEDED', 'NEEDED']);
});

test('the pre decision trigger types are the documented set', () => {
  assert.deepEqual(PRE_DECISION_TRIGGER_TYPES, ['INIT', 'PAGEVIEW', 'DOM_READY', 'WINDOW_LOADED']);
});

test('a container with consent initialisation and configured tags reports nothing', () => {
  assert.deepEqual(tokens([exportOf([INIT_TAG, GOOD_CONFIG])]), []);
});

test('a container with no consent initialisation trigger is reported', () => {
  const found = only([exportOf([GOOD_CONFIG], [PAGES])], 'container-default-consent-not-declared');
  assert.equal(found.length, 1);
});

test('a consent initialisation trigger with no tag on it is still reported', () => {
  const found = only([exportOf([GOOD_CONFIG], [INIT, PAGES])], 'container-default-consent-not-declared');
  assert.equal(found.length, 1);
});

test('a tag nobody configured is reported', () => {
  const unconfigured = { ...GOOD_CONFIG, consentSettings: undefined };
  const found = only([exportOf([INIT_TAG, unconfigured])], 'tag-consent-settings-not-configured');
  assert.equal(found.length, 1);
});

test('an unknown consent status reads as never configured', () => {
  const odd = { ...GOOD_CONFIG, consentSettings: { consentStatus: 'MAYBE' } };
  const found = only([exportOf([INIT_TAG, odd])], 'tag-consent-settings-not-configured');
  assert.equal(found.length, 1);
});

test('a measurement tag that waives consent and fires early is reported', () => {
  const waived = { ...GOOD_CONFIG, consentSettings: { consentStatus: 'NOT_NEEDED' } };
  const found = only([exportOf([INIT_TAG, waived])], 'tag-fires-on-pageview-without-consent');
  assert.equal(found.length, 1);
});

test('a waiver and an unconfigured setting are never both reported for one tag', () => {
  const waived = { ...GOOD_CONFIG, consentSettings: { consentStatus: 'NOT_NEEDED' } };
  const found = tokens([exportOf([INIT_TAG, waived])]);
  assert.deepEqual(found, ['tag-fires-on-pageview-without-consent@error']);
});

test('a custom HTML tag is judged on its own reason and not also on the generic one', () => {
  // Custom HTML runs whatever it contains, so the sharper finding is the one
  // that should be reported, and reporting both would be two findings for
  // one mistake.
  const custom = {
    tagId: '20', name: 'Loader', type: 'html', priority: 0, firingTriggerId: ['2'],
    parameter: [{ key: 'html', value: 'load()' }]
  };
  assert.deepEqual(tokens([exportOf([INIT_TAG, custom])]), ['tag-custom-html-unchecked@error']);
});

test('a custom HTML tag that declares its consent is not reported', () => {
  const custom = {
    tagId: '20', name: 'Loader', type: 'html', priority: 0, firingTriggerId: ['2'],
    consentSettings: { consentStatus: 'NEEDED', consentType: [{ value: 'functionality_storage' }] },
    parameter: [{ key: 'html', value: 'load()' }]
  };
  assert.deepEqual(tokens([exportOf([INIT_TAG, custom])]), []);
});

test('a custom HTML tag marked as needing consent with no types named is still reported', () => {
  const custom = {
    tagId: '20', name: 'Loader', type: 'html', priority: 0, firingTriggerId: ['2'],
    consentSettings: { consentStatus: 'NEEDED', consentType: [] },
    parameter: [{ key: 'html', value: 'load()' }]
  };
  assert.deepEqual(tokens([exportOf([INIT_TAG, custom])]), ['tag-custom-html-unchecked@error']);
});

test('an advertising tag that asks only for analytics consent is reported', () => {
  const conversion = {
    tagId: '21', name: 'Conversion', type: 'awct', priority: 0, firingTriggerId: ['2'],
    consentSettings: { consentStatus: 'NEEDED', consentType: [{ value: 'analytics_storage' }] },
    parameter: [{ key: 'conversionId', value: 'AW-111111111' }]
  };
  const found = only([exportOf([INIT_TAG, conversion])], 'tag-additional-consent-missing-for-marketing');
  assert.equal(found.length, 1);
});

test('a tag is read as advertising from a destination in its parameters too', () => {
  const pixel = {
    tagId: '22', name: 'Pixel', type: 'gaawe', priority: 0, firingTriggerId: ['2'],
    consentSettings: { consentStatus: 'NEEDED', consentType: [{ value: 'analytics_storage' }] },
    parameter: [{ key: 'url', value: 'https://connect.facebook.net/en_US/fbevents.js' }]
  };
  const found = only([exportOf([INIT_TAG, pixel])], 'tag-additional-consent-missing-for-marketing');
  assert.equal(found.length, 1);
});

test('an advertising tag that asks for ad storage is not reported', () => {
  const conversion = {
    tagId: '21', name: 'Conversion', type: 'awct', priority: 0, firingTriggerId: ['2'],
    consentSettings: { consentStatus: 'NEEDED', consentType: [{ value: 'ad_storage' }, { value: 'ad_user_data' }] },
    parameter: [{ key: 'conversionId', value: 'AW-111111111' }]
  };
  assert.deepEqual(tokens([exportOf([INIT_TAG, conversion])]), []);
});

test('a tag ordered above consent initialisation is reported', () => {
  const eager = { ...GOOD_CONFIG, priority: 200 };
  const found = only([exportOf([INIT_TAG, eager])], 'tag-trigger-before-consent-initialization');
  assert.equal(found.length, 1);
  assert.match(found[0].detail, /priority 200/);
});

test('a tag with no priority reads as zero', () => {
  const noPriority = { ...GOOD_CONFIG, priority: undefined };
  assert.deepEqual(only([exportOf([INIT_TAG, noPriority])], 'tag-trigger-before-consent-initialization'), []);
});

test('the consent initialisation tag is not compared against itself', () => {
  assert.deepEqual(only([exportOf([INIT_TAG, GOOD_CONFIG])], 'tag-trigger-before-consent-initialization'), []);
});

test('two configuration tags for one destination are reported once', () => {
  const copy = { ...GOOD_CONFIG, tagId: '11', name: 'GA4 Configuration copy' };
  const found = only([exportOf([INIT_TAG, GOOD_CONFIG, copy])], 'tag-duplicate-measurement-config');
  assert.equal(found.length, 1);
  assert.match(found[0].detail, /2 configuration tags/);
});

test('two configuration tags for different destinations are not reported', () => {
  const other = { ...GOOD_CONFIG, tagId: '11', parameter: [{ key: 'measurementId', value: 'G-EXAMPLE2' }] };
  assert.deepEqual(only([exportOf([INIT_TAG, GOOD_CONFIG, other])], 'tag-duplicate-measurement-config'), []);
});

test('an export with no container version is skipped rather than throwing', () => {
  assert.deepEqual(tokens([container({ note: 'not an export' })]), []);
});

test('a tracker script element with no gate is reported', () => {
  const page = PAGE_SHELL(`${NOTICE}\n<script src="https://www.google-analytics.com/analytics.js"></script>`);
  assert.deepEqual(tokens([html(page)]), ['script-tag-unconditional-third-party@error']);
});

test('a script from a host outside the documented list is not reported', () => {
  const page = PAGE_SHELL(`${NOTICE}\n<script src="https://metrics.example.net/collect.js"></script>`);
  assert.deepEqual(tokens([html(page)]), []);
});

test('each documented gate attribute suppresses the unconditional finding', () => {
  for (const attribute of GATE_ATTRIBUTES) {
    const page = PAGE_SHELL(`${NOTICE}\n<script ${attribute}="analytics" src="https://www.google-analytics.com/analytics.js"></script>`);
    assert.deepEqual(tokens([html(page)]), [], attribute);
  }
});

test('a consent word in the class of a script suppresses the unconditional finding', () => {
  const page = PAGE_SHELL(`${NOTICE}\n<script class="cmp-blocked" src="https://www.google-analytics.com/analytics.js"></script>`);
  assert.deepEqual(tokens([html(page)]), []);
});

test('each non executable type parks a script rather than loading it', () => {
  for (const type of NON_EXECUTABLE_SCRIPT_TYPES) {
    const page = PAGE_SHELL(`${NOTICE}\n<script type="${type}" class="cmp-blocked" src="https://www.google-analytics.com/analytics.js"></script>`);
    assert.deepEqual(tokens([html(page)]), ['script-tag-type-gate-without-activation@warning'], type);
  }
});

test('a parked script that something converts back is not reported', () => {
  const page = PAGE_SHELL(
    `${NOTICE}\n<script type="text/plain" class="cmp-blocked" src="https://www.google-analytics.com/analytics.js"></script>`,
    "var parked = document.querySelectorAll('script[type=\"text/plain\"]');\nparked[0].type = 'text/javascript';\n"
  );
  assert.deepEqual(tokens([html(page)]), []);
});

test('removing the type attribute also counts as activation', () => {
  const page = PAGE_SHELL(
    `${NOTICE}\n<script type="text/plain" class="cmp-blocked" src="https://www.google-analytics.com/analytics.js"></script>`,
    "document.querySelector('.cmp-blocked').removeAttribute('type');\n"
  );
  assert.deepEqual(tokens([html(page)]), []);
});

test('a parked script with no gate marker at all is left alone', () => {
  const page = PAGE_SHELL(`${NOTICE}\n<script type="text/template" id="row-template">x</script>`);
  assert.deepEqual(tokens([html(page)]), []);
});

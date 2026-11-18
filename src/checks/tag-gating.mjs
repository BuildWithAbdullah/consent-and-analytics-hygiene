// Tag containers and script elements.
//
// The container export is where the consent model of a site is actually
// decided, and it is the one artefact nobody reads. Reading it answers
// questions the page cannot: whether a tag was judged not to need consent or
// was simply never looked at, and whether the defaults are declared at all.
//
// The export shape this reads is documented in docs/inputs.md.

import { attr, classesOf, hasAttr } from '../scan/elements.mjs';
import { findCalls, readLiteral } from '../scan/js.mjs';
import { makeFinding } from '../findings.mjs';
import { jsSources } from '../inputs.mjs';
import { hostOf, isAdvertisingHost, isTrackerHost } from '../vocabulary.mjs';

export const CONSENT_STATUSES = ['NOT_SET', 'NOT_NEEDED', 'NEEDED'];

// Tag types that send measurement or advertising data, as a closed list.
export const MEASUREMENT_TAG_TYPES = ['gaawc', 'gaawe', 'googtag', 'ua', 'awct', 'sp', 'flc', 'fls'];
export const ADVERTISING_TAG_TYPES = ['awct', 'sp', 'flc', 'fls'];
export const CONFIG_TAG_TYPES = ['gaawc', 'googtag', 'ua'];
export const CUSTOM_HTML_TYPES = ['html'];

// Trigger types that happen before any decision can have been taken.
export const PRE_DECISION_TRIGGER_TYPES = ['INIT', 'PAGEVIEW', 'DOM_READY', 'WINDOW_LOADED'];

export const NON_EXECUTABLE_SCRIPT_TYPES = ['text/plain', 'text/template', 'javascript/blocked'];

export const GATE_ATTRIBUTES = ['data-consent', 'data-cookieconsent', 'data-consent-category', 'data-cmp'];

function containerOf(file) {
  const version = file.data && file.data.containerVersion;
  if (!version) return null;
  return {
    tags: Array.isArray(version.tag) ? version.tag : [],
    triggers: Array.isArray(version.trigger) ? version.trigger : []
  };
}

function parameterValue(tag, key) {
  const list = Array.isArray(tag.parameter) ? tag.parameter : [];
  const found = list.find((entry) => entry && entry.key === key);
  return found ? found.value : null;
}

function consentStatusOf(tag) {
  const settings = tag.consentSettings || {};
  const status = settings.consentStatus;
  return CONSENT_STATUSES.includes(status) ? status : 'NOT_SET';
}

function requiredConsentTypes(tag) {
  const settings = tag.consentSettings || {};
  const list = Array.isArray(settings.consentType) ? settings.consentType : [];
  return list.map((entry) => (entry && entry.value ? entry.value : null)).filter(Boolean);
}

function isAdvertisingTag(tag) {
  if (ADVERTISING_TAG_TYPES.includes(tag.type)) return true;
  const list = Array.isArray(tag.parameter) ? tag.parameter : [];
  return list.some((entry) => {
    const host = hostOf(entry && entry.value);
    return isAdvertisingHost(host);
  });
}

function triggersFor(container, tag) {
  const ids = Array.isArray(tag.firingTriggerId) ? tag.firingTriggerId : [];
  return ids
    .map((id) => container.triggers.find((trigger) => trigger && trigger.triggerId === id))
    .filter(Boolean);
}

export function checkTagGating(inputs) {
  const findings = [];

  for (const file of inputs.container) {
    const container = containerOf(file);
    if (!container) continue;
    const where = { path: file.path, line: 1 };

    const consentInitTriggers = container.triggers.filter((trigger) => trigger && trigger.type === 'CONSENT_INIT');
    const consentInitTags = container.tags.filter((tag) =>
      triggersFor(container, tag).some((trigger) => trigger.type === 'CONSENT_INIT'));
    if (consentInitTriggers.length === 0 || consentInitTags.length === 0) {
      findings.push(makeFinding('container-default-consent-not-declared', 'error', where,
        'no tag fires on a consent initialisation trigger, so the defaults are never declared'));
    }

    const initPriority = consentInitTags.reduce(
      (highest, tag) => Math.max(highest, Number.isFinite(tag.priority) ? tag.priority : 0),
      Number.NEGATIVE_INFINITY
    );

    const configIds = new Map();

    for (const tag of container.tags) {
      const status = consentStatusOf(tag);
      const isCustomHtml = CUSTOM_HTML_TYPES.includes(tag.type);
      const isMeasurement = MEASUREMENT_TAG_TYPES.includes(tag.type);
      const triggers = triggersFor(container, tag);
      const firesEarly = triggers.some((trigger) => PRE_DECISION_TRIGGER_TYPES.includes(trigger.type));
      const required = requiredConsentTypes(tag);

      if (isCustomHtml) {
        // Custom HTML is judged on its own reason: it runs whatever it
        // contains, so an unconfigured or waived consent setting on a custom
        // tag is the sharper finding and the generic one is not also raised.
        if (status !== 'NEEDED' || required.length === 0) {
          findings.push(makeFinding('tag-custom-html-unchecked', 'error', where,
            `the custom HTML tag ${tag.name || tag.tagId} declares no required consent`));
        }
      } else if (status === 'NOT_SET') {
        findings.push(makeFinding('tag-consent-settings-not-configured', 'error', where,
          `the tag ${tag.name || tag.tagId} has consent settings that were never configured`));
      } else if (status === 'NOT_NEEDED' && isMeasurement && firesEarly) {
        findings.push(makeFinding('tag-fires-on-pageview-without-consent', 'error', where,
          `the tag ${tag.name || tag.tagId} fires before any decision and declares that it needs no consent`));
      }

      if (isAdvertisingTag(tag) && !isCustomHtml && status === 'NEEDED' && !required.includes('ad_storage')) {
        findings.push(makeFinding('tag-additional-consent-missing-for-marketing', 'error', where,
          `the tag ${tag.name || tag.tagId} sends to an advertising destination and does not require ad_storage`));
      }

      if (consentInitTags.length > 0 && !consentInitTags.includes(tag)) {
        const priority = Number.isFinite(tag.priority) ? tag.priority : 0;
        if (priority > initPriority) {
          findings.push(makeFinding('tag-trigger-before-consent-initialization', 'warning', where,
            `the tag ${tag.name || tag.tagId} has priority ${priority}, above the consent initialisation priority ${initPriority}`));
        }
      }

      if (CONFIG_TAG_TYPES.includes(tag.type)) {
        const id = parameterValue(tag, 'measurementId') || parameterValue(tag, 'trackingId') || parameterValue(tag, 'tagId');
        if (id) {
          const seen = configIds.get(id) || [];
          seen.push(tag.name || tag.tagId);
          configIds.set(id, seen);
        }
      }
    }

    for (const [id, names] of configIds) {
      if (names.length > 1) {
        findings.push(makeFinding('tag-duplicate-measurement-config', 'warning', where,
          `${names.length} configuration tags send to ${id}`));
      }
    }
  }

  const scripts = jsSources(inputs);
  const activatesParkedScripts = scripts.some((script) => {
    if (/\.type\s*=\s*(['"`])(text\/javascript|application\/javascript)\1/.test(script.source)) return true;
    if (/removeAttribute\(\s*(['"`])type\1\s*\)/.test(script.source)) return true;
    return findCalls(script.source).some((call) => {
      if (!/querySelectorAll|querySelector/.test(call.callee)) return false;
      const selector = readLiteral(call.args[0] || '');
      return typeof selector === 'string' && selector.includes('type=');
    });
  });

  for (const document of inputs.html) {
    for (const element of document.parsed.elements) {
      if (element.tag !== 'script') continue;
      const src = attr(element, 'src');
      const type = (attr(element, 'type') || '').toLowerCase();
      const parked = NON_EXECUTABLE_SCRIPT_TYPES.includes(type);
      const gated = GATE_ATTRIBUTES.some((name) => hasAttr(element, name))
        || classesOf(element).some((token) => /consent|cmp|cookie/i.test(token));
      const where = { path: document.path, line: element.line };

      if (src && isTrackerHost(hostOf(src)) && !parked && !gated) {
        findings.push(makeFinding('script-tag-unconditional-third-party', 'error', where,
          `a script element loads ${hostOf(src)} as the document parses`));
      }

      if (parked && gated && !activatesParkedScripts) {
        findings.push(makeFinding('script-tag-type-gate-without-activation', 'warning', where,
          'the script is parked behind a non executable type and nothing in the inputs converts it back'));
      }
    }
  }

  return findings;
}

export const __internal = { consentStatusOf, requiredConsentTypes, parameterValue, triggersFor };

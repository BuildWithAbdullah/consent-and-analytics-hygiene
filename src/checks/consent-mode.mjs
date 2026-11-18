// Consent mode defaults and updates.
//
// Almost every mistake here is a mistake about order. A default declared
// after the thing it is meant to govern, an update issued before the user
// has answered, a region scoped default with nothing behind it: all of them
// read correctly line by line and are wrong as a sequence.

import { braceDepthAt, findCalls, readLiteral, UNRESOLVED } from '../scan/js.mjs';
import { makeFinding } from '../findings.mjs';
import { at, jsSources } from '../inputs.mjs';
import { CAPS, CONSENT_CONTROL_KEYS, CONSENT_TYPES, ESSENTIAL_TYPES } from '../vocabulary.mjs';

function gtagCalls(source) {
  return findCalls(source).filter((call) => call.callee === 'gtag' || call.callee.endsWith('.gtag'));
}

export function readConsentCalls(scripts) {
  const defaults = [];
  const updates = [];
  const configs = [];
  const sets = [];
  for (const script of scripts) {
    for (const call of gtagCalls(script.source)) {
      const first = readLiteral(call.args[0] || '');
      if (first === 'consent') {
        const mode = readLiteral(call.args[1] || '');
        const payload = call.args[2] === undefined ? UNRESOLVED : readLiteral(call.args[2]);
        const record = { script, call, payload, index: call.index, line: call.line };
        if (mode === 'default') defaults.push(record);
        else if (mode === 'update') updates.push(record);
      } else if (first === 'config') {
        configs.push({ script, call, id: readLiteral(call.args[1] || ''), index: call.index, line: call.line });
      } else if (first === 'set') {
        sets.push({
          script,
          call,
          key: readLiteral(call.args[1] || ''),
          value: call.args.length > 2 ? readLiteral(call.args[2]) : readLiteral(call.args[1] || ''),
          line: call.line
        });
      }
    }
  }
  return { defaults, updates, configs, sets };
}

function typesIn(payload) {
  if (!(payload instanceof Map)) return [];
  return [...payload.keys()].filter((key) => CONSENT_TYPES.includes(key));
}

function setFlag(sets, key) {
  return sets.some((entry) => entry.key === key && entry.value === true);
}

export function checkConsentMode(inputs) {
  const findings = [];
  const scripts = jsSources(inputs);
  const { defaults, updates, configs, sets } = readConsentCalls(scripts);

  if (updates.length > 0 && defaults.length === 0) {
    const first = updates[0];
    findings.push(makeFinding('consent-default-missing', 'error', at(first.script, first.line),
      'an update is issued and no default is declared anywhere in the inputs'));
  }

  for (const entry of defaults) {
    const where = at(entry.script, entry.line);
    const payload = entry.payload;

    if (payload instanceof Map) {
      for (const [key, value] of payload) {
        if (!CONSENT_TYPES.includes(key) && !CONSENT_CONTROL_KEYS.includes(key)) {
          findings.push(makeFinding('consent-storage-key-unknown', 'warning', where,
            `the key ${key} is not one of the documented consent type or control names`));
          continue;
        }
        if (CONSENT_TYPES.includes(key) && value === 'granted' && !ESSENTIAL_TYPES.includes(key)) {
          findings.push(makeFinding('consent-default-granted', 'error', where,
            `the default grants ${key}`));
        }
      }

      const declared = typesIn(payload);
      if (declared.includes('ad_storage')) {
        const missing = ['ad_user_data', 'ad_personalization'].filter((key) => !payload.has(key));
        if (missing.length === 2) {
          findings.push(makeFinding('consent-missing-v2-signals', 'error', where,
            'the default declares storage types and neither of the two use signals'));
        } else if (missing.length === 1) {
          findings.push(makeFinding('consent-missing-v2-signals', 'warning', where,
            `the default omits ${missing[0]}`));
        }
      }

      const wait = payload.get('wait_for_update');
      if (!payload.has('wait_for_update') || wait === 0) {
        findings.push(makeFinding('consent-no-wait-for-update', 'warning', where,
          `no wait period, so a decision restored from storage arrives after the first requests (${CAPS.waitForUpdateMs}ms is the usual floor)`));
      }

      if (payload.get('ad_storage') === 'denied' && !setFlag(sets, 'ads_data_redaction')) {
        findings.push(makeFinding('consent-ads-data-redaction-absent', 'warning', where,
          'ad storage is denied and ads_data_redaction is not set'));
      }
      if (payload.get('analytics_storage') === 'denied' && !setFlag(sets, 'url_passthrough')) {
        findings.push(makeFinding('consent-url-passthrough-absent', 'notice', where,
          'analytics storage is denied and url_passthrough is not set'));
      }
    }

    const firstConfigInSameScript = configs.find((config) => config.script === entry.script);
    if (firstConfigInSameScript && firstConfigInSameScript.index < entry.index) {
      findings.push(makeFinding('consent-default-after-config', 'error', where,
        'the default is declared after the configuration call in the same script'));
    }
  }

  const scoped = defaults.filter((entry) => entry.payload instanceof Map && entry.payload.has('region'));
  if (defaults.length > 0 && scoped.length === defaults.length) {
    const first = defaults[0];
    findings.push(makeFinding('consent-region-default-without-global', 'error', at(first.script, first.line),
      'every default is scoped to a region list, so a visitor outside those regions has no default at all'));
  }

  for (const entry of updates) {
    if (braceDepthAt(entry.script.source, entry.index) === 0) {
      findings.push(makeFinding('consent-update-without-user-action', 'error', at(entry.script, entry.line),
        'the update runs at the top level of the script rather than from the handler that records the decision'));
    }
    if (entry.payload instanceof Map) {
      for (const key of entry.payload.keys()) {
        if (!CONSENT_TYPES.includes(key) && !CONSENT_CONTROL_KEYS.includes(key)) {
          findings.push(makeFinding('consent-storage-key-unknown', 'warning', at(entry.script, entry.line),
            `the key ${key} is not one of the documented consent type or control names`));
        }
      }
    }
  }

  if (updates.length > 0 && defaults.length > 0) {
    const declaredTypes = new Set();
    for (const entry of defaults) for (const key of typesIn(entry.payload)) declaredTypes.add(key);
    const updatedTypes = new Set();
    for (const entry of updates) for (const key of typesIn(entry.payload)) updatedTypes.add(key);
    const missing = [...declaredTypes].filter((key) => !updatedTypes.has(key)).sort();
    if (declaredTypes.size > 0 && updatedTypes.size > 0 && missing.length > 0) {
      const first = updates[0];
      findings.push(makeFinding('consent-update-partial', 'warning', at(first.script, first.line),
        `the default declared ${[...declaredTypes].sort().join(', ')} and the update covers ${[...updatedTypes].sort().join(', ')}`));
    }
  }

  return findings;
}

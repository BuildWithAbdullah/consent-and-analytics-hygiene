// The consent platform configuration.
//
// Everything in this area is a decision somebody made in a settings screen,
// which is why the configuration is worth reading on its own: a pre enabled
// category is not visible in the banner markup and is not visible in the
// network capture either. It is only visible here.
//
// The configuration shape is documented in docs/inputs.md.

import { makeFinding } from '../findings.mjs';
import { CAPS } from '../vocabulary.mjs';

export const REQUIRED_RECORD_FIELDS = ['timestamp', 'purposes'];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function checkCmp(inputs) {
  const findings = [];

  for (const file of inputs.cmp) {
    const config = file.data && typeof file.data === 'object' ? file.data : {};
    const where = { path: file.path, line: 1 };
    const actions = config.actions && typeof config.actions === 'object' ? config.actions : {};

    if (actions.rejectAll !== true) {
      findings.push(makeFinding('cmp-no-reject-all', 'error', where,
        'the configuration declares no reject all action on the first layer'));
    }

    for (const category of asArray(config.categories)) {
      if (!category || typeof category !== 'object') continue;
      if (category.essential === true) continue;
      if (category.defaultEnabled === true) {
        findings.push(makeFinding('cmp-categories-pre-enabled', 'error', where,
          `the category ${category.id || 'with no id'} is not essential and starts enabled`));
      }
    }

    const lifetime = Number.isFinite(config.lifetimeDays) ? config.lifetimeDays : null;
    if (lifetime !== null && lifetime > CAPS.consentHardDays) {
      findings.push(makeFinding('cmp-consent-lifetime-excessive', 'error', where,
        `the decision is kept for ${lifetime} days, beyond the hard cap of ${CAPS.consentHardDays}`));
    } else if (lifetime !== null && lifetime > CAPS.consentSoftDays) {
      findings.push(makeFinding('cmp-consent-lifetime-excessive', 'warning', where,
        `the decision is kept for ${lifetime} days, beyond the cap of ${CAPS.consentSoftDays}`));
    }

    const withdrawal = config.withdrawal && typeof config.withdrawal === 'object' ? config.withdrawal : null;
    const hasWithdrawal = withdrawal !== null
      && Object.values(withdrawal).some((value) => typeof value === 'string' && value.trim() !== '');
    if (!hasWithdrawal) {
      findings.push(makeFinding('cmp-no-withdrawal-mechanism', 'error', where,
        'no persistent control is configured that reopens the dialog'));
    }

    const record = config.record && typeof config.record === 'object' ? config.record : null;
    const fields = record ? asArray(record.fields) : [];
    const missingRequired = REQUIRED_RECORD_FIELDS.filter((field) => !fields.includes(field));
    if (record === null || missingRequired.length > 0) {
      findings.push(makeFinding('cmp-no-consent-record', 'error', where,
        record === null
          ? 'the configuration stores no record of the decision'
          : `the record omits ${missingRequired.join(' and ')}`));
    }

    for (const entry of asArray(config.legitimateInterest)) {
      if (!entry || typeof entry !== 'object') continue;
      if (entry.essential === true) continue;
      if (entry.defaultEnabled === true) {
        findings.push(makeFinding('cmp-legitimate-interest-pre-enabled', 'warning', where,
          `the objection toggle for ${entry.purposeId || 'an unnamed purpose'} starts in the non objecting position`));
      }
    }

    const hasVersion = typeof config.version === 'string' && config.version.trim() !== '';
    if (!hasVersion || (record !== null && !fields.includes('version'))) {
      findings.push(makeFinding('cmp-version-not-tracked', 'warning', where,
        hasVersion
          ? 'the configuration is versioned and the record does not keep the version'
          : 'the configuration carries no version'));
    }

    const vendors = config.vendors && typeof config.vendors === 'object' ? config.vendors : null;
    if (vendors) {
      const inline = asArray(vendors.inline);
      const pinned = typeof vendors.listVersion === 'string' && vendors.listVersion.trim() !== '';
      if (typeof vendors.listUrl === 'string' && vendors.listUrl.trim() !== '' && inline.length === 0 && !pinned) {
        findings.push(makeFinding('cmp-vendor-list-not-enumerated', 'notice', where,
          'the vendor list is referenced by address with no pinned version and no inline list'));
      }
    }
  }

  return findings;
}

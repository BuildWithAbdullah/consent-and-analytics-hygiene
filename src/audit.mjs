// Running every area over a set of inputs.

import { checkBanner } from './checks/banner.mjs';
import { checkCmp } from './checks/cmp.mjs';
import { checkConsentMode } from './checks/consent-mode.mjs';
import { checkCookies } from './checks/cookies.mjs';
import { checkMeasurement } from './checks/measurement.mjs';
import { checkStorage } from './checks/storage.mjs';
import { checkTagGating } from './checks/tag-gating.mjs';
import { dedupe, sortFindings } from './findings.mjs';
import { AREAS } from './catalogue.mjs';

export const CHECKS = [
  { area: 'banner', run: checkBanner },
  { area: 'consent-mode', run: checkConsentMode },
  { area: 'tag-gating', run: checkTagGating },
  { area: 'cookies', run: checkCookies },
  { area: 'measurement', run: checkMeasurement },
  { area: 'storage', run: checkStorage },
  { area: 'cmp', run: checkCmp }
];

export function audit(inputs) {
  const findings = [];
  for (const check of CHECKS) {
    if (!Object.prototype.hasOwnProperty.call(AREAS, check.area)) {
      throw new Error(`check declares an area that is not in the catalogue: ${check.area}`);
    }
    findings.push(...check.run(inputs));
  }
  return sortFindings(dedupe(findings));
}

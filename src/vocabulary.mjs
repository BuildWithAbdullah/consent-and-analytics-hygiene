// The closed vocabularies every check reads from.
//
// Each of these is a documented list rather than a heuristic, which is the
// honest shape for them: a closed list can be printed, argued with and
// extended, and docs/limits.md carries an artefact showing what the tracker
// list misses. A fuzzy matcher would have hidden the same gap behind an
// appearance of generality.

export const CONSENT_TYPES = [
  'ad_storage',
  'analytics_storage',
  'ad_user_data',
  'ad_personalization',
  'functionality_storage',
  'personalization_storage',
  'security_storage'
];

export const CONSENT_CONTROL_KEYS = [
  'wait_for_update',
  'region',
  'ads_data_redaction',
  'url_passthrough'
];

// The two signals that cover use of the data rather than storage of it.
export const USE_SIGNALS = ['ad_user_data', 'ad_personalization'];

// Types that may legitimately default to granted, because refusing them
// breaks the thing the visitor asked for.
export const ESSENTIAL_TYPES = ['security_storage'];

// A closed list of hosts the scanner recognises as measurement or
// advertising destinations. Being closed is the point: docs/limits.md names
// the limit and ships an artefact where an unlisted host is missed.
export const TRACKER_HOSTS = [
  'www.google-analytics.com',
  'google-analytics.com',
  'analytics.google.com',
  'www.googletagmanager.com',
  'googletagmanager.com',
  'www.googleadservices.com',
  'googleads.g.doubleclick.net',
  'connect.facebook.net',
  'www.facebook.com',
  'static.hotjar.com',
  'script.hotjar.com',
  'cdn.segment.com',
  'api.segment.io',
  'snap.licdn.com',
  'analytics.tiktok.com',
  'static.ads-twitter.com'
];

// Hosts that serve advertising destinations specifically, used to decide
// whether a tag needs advertising consent rather than only analytics.
export const ADVERTISING_HOSTS = [
  'www.googleadservices.com',
  'googleads.g.doubleclick.net',
  'connect.facebook.net',
  'www.facebook.com',
  'snap.licdn.com',
  'analytics.tiktok.com',
  'static.ads-twitter.com'
];

// Cookie names, as prefixes, that carry a measurement identifier. A cookie
// matching one of these in a pre-consent response is the finding; a cookie
// outside the list is not looked at, and that is a declared limit.
export const ANALYTICS_COOKIE_PREFIXES = [
  '_ga',
  '_gid',
  '_gat',
  '_gcl_au',
  '_fbp',
  '_fbc',
  '_hj',
  'ajs_',
  '_uetsid',
  '_ttp'
];

// Names a consent record is recognised under.
export const CONSENT_COOKIE_PREFIXES = ['consent', 'cookie_consent', 'cmp', 'euconsent', 'gdpr'];

export const CAPS = {
  // A cookie living longer than this is reported. The two numbers are the
  // severity boundary: beyond the soft cap is a warning, beyond the hard cap
  // is an error.
  cookieSoftSeconds: 60 * 60 * 24 * 396,
  cookieHardSeconds: 60 * 60 * 24 * 730,
  // The same shape for a stored consent decision, in days.
  consentSoftDays: 180,
  consentHardDays: 365,
  // The shortest wait a default should allow for a stored decision to arrive.
  waitForUpdateMs: 500
};

export const PLACEHOLDER_MEASUREMENT_IDS = [
  'G-XXXXXXXXXX',
  'G-XXXXXXX',
  'UA-XXXXXX-X',
  'GTM-XXXXXXX',
  'AW-XXXXXXXXX',
  'TODO',
  'REPLACE_ME'
];

export function isTrackerHost(host) {
  if (!host) return false;
  return TRACKER_HOSTS.includes(host.toLowerCase());
}

export function isAdvertisingHost(host) {
  if (!host) return false;
  return ADVERTISING_HOSTS.includes(host.toLowerCase());
}

export function hostOf(reference) {
  if (!reference) return null;
  const text = String(reference).trim();
  const match = text.match(/^(?:https?:)?\/\/([^/?#]+)/i);
  if (!match) return null;
  return match[1].toLowerCase().replace(/:\d+$/, '');
}

export function isAnalyticsCookieName(name) {
  if (!name) return false;
  const lowered = name.toLowerCase();
  return ANALYTICS_COOKIE_PREFIXES.some((prefix) => lowered.startsWith(prefix.toLowerCase()));
}

export function isConsentCookieName(name) {
  if (!name) return false;
  const lowered = name.toLowerCase();
  return CONSENT_COOKIE_PREFIXES.some((prefix) => lowered.includes(prefix));
}

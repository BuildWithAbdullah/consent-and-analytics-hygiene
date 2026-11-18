// One fixture per reason the pairs do not reach.
//
// Writing a fixture for every remaining catalogue entry is the highest
// yielding rule on this account, eleven repositories running. A pair is
// written around a realistic mistake and tends to reach the findings that
// travel together; the reasons left over are the ones nobody has ever
// exercised, which is exactly where the defects are.
//
// Three of these exist to produce the second severity of a finding that can
// be reported at two, so that the declared severity sets are covered in both
// directions rather than only at their first value. Those three are the only
// reasons a fixture and a pair are both allowed to reach, and the suite names
// them: anything else would be two artefacts for one reason.

export const FIXTURES = [
  { file: 'banner-reject-absent.html', tokens: ['banner-reject-absent@error'], about: 'Accept, and nothing else.' },
  { file: 'banner-scroll-lock.js', tokens: ['banner-scroll-lock-without-restore@warning'], about: 'Scroll locked and never released.' },
  { file: 'banner-live-region-absent.html', tokens: ['banner-no-live-region-for-decision@notice'], about: 'A decision taken in silence.' },
  { file: 'banner-autofocus-accept.html', tokens: ['banner-autofocus-on-accept@notice'], about: 'Focus starting on the agreeing answer.' },

  { file: 'consent-update-with-no-default.js', tokens: ['consent-default-missing@error'], about: 'An update with nothing before it.' },
  { file: 'consent-unknown-key.js', tokens: ['consent-storage-key-unknown@warning'], about: 'A typo that reads as a declaration.' },
  { file: 'consent-missing-one-signal.js', tokens: ['consent-missing-v2-signals@warning'], about: 'One of the two use signals, at the lower severity.' },

  { file: 'tag-pageview-waived.container.json', tokens: ['tag-fires-on-pageview-without-consent@error'], about: 'A tag that declares it needs nothing.' },
  { file: 'tag-priority-order.container.json', tokens: ['tag-trigger-before-consent-initialization@warning'], about: 'A tag ordered above the defaults.' },
  { file: 'tag-duplicate-config.container.json', tokens: ['tag-duplicate-measurement-config@warning'], about: 'One destination, two configuration tags.' },
  { file: 'tag-parked-script-no-activation.html', tokens: ['script-tag-type-gate-without-activation@warning'], about: 'A gate with nothing on the other side.' },

  { file: 'cookie-domain-wide.http', tokens: ['cookie-domain-wider-than-host@warning'], about: 'A cookie sent to every sibling subdomain.' },
  { file: 'cookie-duplicate-attributes.http', tokens: ['cookie-duplicate-name-conflicting-attributes@warning'], about: 'One name, two sets of attributes.' },
  { file: 'cookie-lifetime-hard-cap.http', tokens: ['cookie-lifetime-excessive@error'], about: 'A lifetime past the hard cap, at the higher severity.' },

  { file: 'measurement-location-identifier.js', tokens: ['measurement-pii-in-page-path@error'], about: 'An address arriving as navigation.' },
  { file: 'measurement-user-id.js', tokens: ['measurement-user-id-without-basis@warning'], about: 'A cross session id set unconditionally.' },
  { file: 'measurement-placeholder-id.js', tokens: ['measurement-id-placeholder@error'], about: 'Every event sent to nowhere.' },

  { file: 'storage-consent-client-only.js', tokens: ['storage-consent-state-client-only@notice'], about: 'A decision no request carries.' },

  { file: 'cmp-lifetime-hard-cap.cmp.json', tokens: ['cmp-consent-lifetime-excessive@error'], about: 'A decision kept past the hard cap, at the higher severity.' }
];

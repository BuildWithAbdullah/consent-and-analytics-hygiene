// The pattern pairs.
//
// Each pair is a failing artefact and the corrected one beside it, and each
// side declares the EXACT set of id@severity tokens a real run produces over
// it. Exact, in both directions, is the whole point: an inclusion assertion
// hides every false positive the corpus triggers by construction, because a
// corrected artefact that still reports something passes. Three of the
// defects found while writing this repository were found by a corrected
// artefact reporting something it should not have.
//
// `residual` is the exact set the corrected side still produces. It is
// usually empty. Where it is not, the finding that stays behind is correct
// and the choice behind it is deliberate, and the suite requires it to still
// be there so that a later change cannot quietly clear it.

export const PAIRS = [
  {
    slug: 'banner-modal-markup',
    kinds: ['html'],
    about: 'A blocking overlay that is not a dialog, fixed by making the notice non blocking.',
    before: ['banner-focus-not-moved@error', 'banner-missing-dialog-role@error'],
    residual: []
  },
  {
    slug: 'banner-naming-and-order',
    kinds: ['html'],
    about: 'A modal dialog with no name and a positive tabindex inside it.',
    before: ['banner-no-accessible-name@error', 'banner-tabindex-positive@warning'],
    residual: []
  },
  {
    slug: 'banner-reject-parity',
    kinds: ['html'],
    about: 'Accept in the banner and refusing only through the settings control.',
    before: ['banner-reject-not-equivalent@error'],
    residual: []
  },
  {
    slug: 'banner-focus-trap',
    kinds: ['html', 'js'],
    about: 'A modal dialog that moves focus and then lets it leave, over a page that stays live.',
    before: ['banner-background-not-inert@warning', 'banner-not-focus-trapped@error'],
    residual: []
  },
  {
    slug: 'banner-dismiss-wiring',
    kinds: ['html', 'js'],
    about: 'A control labelled Close wired to the handler that grants everything.',
    before: ['banner-close-means-accept@warning'],
    residual: []
  },
  {
    slug: 'consent-default-shape',
    kinds: ['js'],
    about: 'A default that grants storage, omits both use signals and sets no wait period.',
    before: [
      'consent-default-granted@error',
      'consent-missing-v2-signals@error',
      'consent-no-wait-for-update@warning'
    ],
    residual: []
  },
  {
    slug: 'consent-order',
    kinds: ['js'],
    about: 'A correct default declared underneath the configuration call it is meant to govern.',
    before: ['consent-default-after-config@error'],
    residual: []
  },
  {
    slug: 'consent-update-timing',
    kinds: ['js'],
    about: 'An update at the top level of the script, covering one of the four declared types.',
    before: ['consent-update-partial@warning', 'consent-update-without-user-action@error'],
    residual: []
  },
  {
    slug: 'consent-region-scope',
    kinds: ['js'],
    about: 'A region scoped default with nothing behind it for everybody else.',
    before: ['consent-region-default-without-global@error'],
    residual: []
  },
  {
    slug: 'consent-passthrough-tradeoff',
    kinds: ['js'],
    about: 'Redaction and passthrough, where only one of the two is wanted.',
    before: ['consent-ads-data-redaction-absent@warning', 'consent-url-passthrough-absent@notice'],
    residual: ['consent-url-passthrough-absent@notice']
  },
  {
    slug: 'tag-container-consent',
    kinds: ['container'],
    about: 'A container with no consent initialisation and tags nobody configured.',
    before: ['container-default-consent-not-declared@error', 'tag-consent-settings-not-configured@error'],
    residual: []
  },
  {
    slug: 'tag-custom-html',
    kinds: ['container'],
    about: 'A custom HTML tag that needs nothing, and a conversion tag that asks for the wrong consent.',
    before: ['tag-additional-consent-missing-for-marketing@error', 'tag-custom-html-unchecked@error'],
    residual: []
  },
  {
    slug: 'script-gating',
    kinds: ['html'],
    about: 'A tracker script, a preconnect and a noscript pixel, none of them gated.',
    before: [
      'pixel-in-noscript-ungated@error',
      'prefetch-to-tracker-before-consent@warning',
      'script-tag-unconditional-third-party@error'
    ],
    residual: []
  },
  {
    slug: 'cookie-attributes',
    kinds: ['headers'],
    about: 'A missing SameSite, a cross site cookie without Secure and a session cookie script can read.',
    before: [
      'cookie-no-samesite@warning',
      'cookie-samesite-none-without-secure@error',
      'cookie-session-not-httponly@error'
    ],
    residual: []
  },
  {
    slug: 'cookie-prefixes-and-life',
    kinds: ['headers'],
    about: 'Two prefixed cookies the browser refuses to store, and one that outlives its consent.',
    before: [
      'cookie-host-prefix-violation@error',
      'cookie-lifetime-excessive@warning',
      'cookie-secure-prefix-violation@error'
    ],
    residual: []
  },
  {
    slug: 'cookie-timing',
    kinds: ['headers'],
    about: 'A measurement cookie in the first response, and no record of the decision in the second.',
    before: ['cookie-analytics-set-before-consent@error', 'cookie-consent-record-not-persisted@error'],
    residual: []
  },
  {
    slug: 'measurement-payload',
    kinds: ['js'],
    about: 'An address in a parameter, a parameter named as hashed carrying a number, and debug mode on.',
    before: [
      'measurement-debug-mode-enabled@warning',
      'measurement-pii-in-parameter@error',
      'measurement-raw-value-sent-as-hashed@error'
    ],
    residual: []
  },
  {
    slug: 'measurement-counting',
    kinds: ['js'],
    about: 'One destination configured twice, with a manual page view beside the automatic one.',
    before: ['measurement-duplicate-config-call@warning', 'measurement-page-view-double-counted@warning'],
    residual: []
  },
  {
    slug: 'storage-before-gate',
    kinds: ['js'],
    about: 'An identifier, a beacon and a canvas read, all above the consent gate.',
    before: [
      'beacon-before-consent@error',
      'fingerprinting-surface-before-consent@warning',
      'storage-identifier-before-consent@error'
    ],
    residual: []
  },
  {
    slug: 'cmp-configuration',
    kinds: ['cmp'],
    about: 'No reject action, a pre enabled category, no way back and no record kept.',
    before: [
      'cmp-categories-pre-enabled@error',
      'cmp-no-consent-record@error',
      'cmp-no-reject-all@error',
      'cmp-no-withdrawal-mechanism@error',
      'cmp-version-not-tracked@warning'
    ],
    residual: []
  },
  {
    slug: 'cmp-lifetime-and-interest',
    kinds: ['cmp'],
    about: 'A decision kept too long, an objection toggle starting off, and a vendor list by address.',
    before: [
      'cmp-consent-lifetime-excessive@warning',
      'cmp-legitimate-interest-pre-enabled@warning',
      'cmp-vendor-list-not-enumerated@notice'
    ],
    residual: []
  }
];

export const PAIR_BY_SLUG = new Map(PAIRS.map((pair) => [pair.slug, pair]));

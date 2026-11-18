// What this repository cannot see, written down and tested.
//
// A limit stated in prose reads correctly for ever, including after the
// checker has learned to see the thing. So each limit here carries two
// artefacts and the suite asserts the exact token set of both, and
// docs/limits.md is generated from this file so the prose cannot drift from
// the behaviour.
//
// There are two kinds, and keeping them apart matters:
//
//   hides        the limit hides a real problem. The blind artefact holds
//                the problem and reports NOTHING. The contrast artefact
//                holds the same problem in a form the scanner can see and
//                reports the declared tokens.
//
//   manufactures the limit produces a finding that is not a real problem.
//                The blind artefact reports the declared tokens, which are
//                wrong but honest, because refusing to report would be a
//                guess in the other direction. The contrast artefact is the
//                same thing in a form the scanner reads correctly, and is
//                CLEAN.
//
// Without that distinction an honest refusal reads as the limit having been
// fixed, and a false positive reads as a real finding.

export const LIMITS = [
  {
    slug: 'variable-indirection',
    kind: 'hides',
    kinds: ['js'],
    title: 'A consent payload held in a variable is not read',
    detail: 'The scanner reads literal arguments. A default whose payload is a variable is skipped entirely, so a granted default assembled anywhere other than at the call site is invisible.',
    blind: [],
    contrast: ['consent-default-granted@error']
  },
  {
    slug: 'aliased-calls',
    kind: 'hides',
    kinds: ['js'],
    title: 'An aliased or bundled measurement call is not matched',
    detail: 'Calls are matched on the name at the call site, so an alias assigned to a variable, or a bundler that renames the function, hides every consent call in the file.',
    blind: [],
    contrast: ['consent-default-missing@error']
  },
  {
    slug: 'runtime-injected-banner',
    kind: 'hides',
    kinds: ['html'],
    title: 'A banner built by script has no markup to judge',
    detail: 'Every banner finding is made from markup. A banner assembled at runtime leaves an empty container in the document, so none of the twelve banner reasons can be reached however bad the built banner is.',
    blind: [],
    contrast: ['banner-reject-absent@error']
  },
  {
    slug: 'no-stylesheet-parsing',
    kind: 'hides',
    kinds: ['html'],
    title: 'Modality expressed only in a stylesheet is not seen',
    detail: 'Whether a banner blocks the page is read from markup signals: a dialog role, an inline position, or an overlay word in the identity. A banner made modal in an external stylesheet is treated as ordinary content, and the modal findings do not run against it.',
    blind: [],
    contrast: ['banner-focus-not-moved@error', 'banner-missing-dialog-role@error']
  },
  {
    slug: 'single-captured-exchange',
    kind: 'hides',
    kinds: ['headers'],
    title: 'A cookie set by a response that was not captured is invisible',
    detail: 'The cookie timing findings read the capture they were given. A measurement cookie set by a background request rather than by the document response is simply not in the file, so the pre-consent check passes on a site that does set it.',
    blind: [],
    contrast: ['cookie-analytics-set-before-consent@error']
  },
  {
    slug: 'closed-tracker-host-list',
    kind: 'hides',
    kinds: ['html'],
    title: 'A tracker outside the documented host list is not recognised',
    detail: 'Tracker recognition is a closed list in src/vocabulary.mjs. A measurement endpoint on a first party host, a self hosted collector, or a vendor not on the list is read as an ordinary script.',
    blind: [],
    contrast: ['script-tag-unconditional-third-party@error']
  },
  {
    slug: 'encoded-request-target',
    kind: 'hides',
    kinds: ['js'],
    title: 'A request target assembled at runtime is not resolved',
    detail: 'The scanner reads literals and refuses to guess at anything else, so a target that is decoded, concatenated or read from configuration carries no host it can match against the tracker list.',
    blind: [],
    contrast: ['beacon-before-consent@error']
  },
  {
    slug: 'unescaped-angle-bracket',
    kind: 'hides',
    kinds: ['html'],
    title: 'An unescaped angle bracket inside an attribute truncates the tag',
    detail: 'The element reader finds the end of a start tag by looking for the next angle bracket, so a raw one inside an attribute value ends the tag early. The attribute it was in is lost, the rest of the tag becomes text, and a control whose label carried the bracket is no longer recognised by its words. Writing the bracket as an entity restores the finding, which is what the two artefacts here show.',
    blind: [],
    contrast: ['banner-reject-absent@error']
  },
  {
    slug: 'source-order-not-execution-order',
    kind: 'manufactures',
    kinds: ['js'],
    title: 'Position in the file is read as order of execution',
    detail: 'Whether something happens before the decision is judged by where it sits relative to the consent gate in the source. A function declared above the gate and called from the consent handler is reported, although it runs afterwards. Moving the declaration below the gate clears the report without changing a line of behaviour, which is the clearest possible demonstration that the finding is about position.',
    blind: ['beacon-before-consent@error'],
    contrast: []
  },
  {
    slug: 'custom-template-consent',
    kind: 'manufactures',
    kinds: ['container'],
    title: 'A consent check inside a custom template is not visible in the export',
    detail: 'A container export carries the body of a custom HTML tag but not the behaviour of a custom template, and a tag that gates correctly inside its own code is reported as ungated. The report is still the right default: a gate the container cannot see is a gate nobody reviewing the container can audit.',
    blind: ['tag-custom-html-unchecked@error'],
    contrast: []
  },
  {
    slug: 'capture-has-no-basis-field',
    kind: 'manufactures',
    kinds: ['headers'],
    title: 'A capture carries no declared basis for a cookie',
    detail: 'The header format has nowhere to say that a cookie is strictly necessary, so a short lived throttling cookie whose name begins like a measurement cookie is reported in the pre-consent phase. The name is the only evidence in the file, and reporting on it is better than assuming.',
    blind: ['cookie-analytics-set-before-consent@error'],
    contrast: []
  }
];

export const LIMIT_KINDS = ['hides', 'manufactures'];

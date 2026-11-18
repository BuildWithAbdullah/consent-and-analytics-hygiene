// One entry per reason, never one per check.
//
// A finding is a reason a reviewer would give, not the place a checker
// happened to look. Two checks that exist because of the same underlying
// mistake share one id. A single check that fires for two different reasons
// is split into two ids. The whole repository is keyed on this file: the
// corpus manifests name ids, the generated documents are built from it, and
// the suite fails if an id is emitted that is not declared here or declared
// here and never emitted by any artefact.
//
// `severities` is the COMPLETE set of severities the finding can carry. The
// suite compares it against a real run in both directions, so a severity a
// run produces that is not declared fails, and a severity declared that no
// artefact has ever produced fails too.

export const AREAS = {
  banner: 'Consent banner as an interactive component',
  'consent-mode': 'Google consent mode defaults and updates',
  'tag-gating': 'Tag containers and script tags',
  cookies: 'Set-Cookie attributes and timing',
  measurement: 'Analytics payload hygiene',
  storage: 'Client storage and pre-consent network activity',
  cmp: 'Consent platform configuration'
};

export const CATALOGUE = [
  // Area: banner
  {
    id: 'banner-not-focus-trapped',
    area: 'banner',
    severities: ['error'],
    title: 'A modal consent banner does not contain focus',
    reason: 'The banner is marked as a modal dialog but nothing in the markup keeps keyboard focus inside it, so tabbing leaves the dialog and lands on controls the overlay covers.',
    remedy: 'Keep focus inside the dialog while it is open, and return it to the invoking control when it closes.'
  },
  {
    id: 'banner-focus-not-moved',
    area: 'banner',
    severities: ['error'],
    title: 'Focus is never moved into the banner',
    reason: 'A banner that opens over the page without moving focus leaves a keyboard user at the top of the document with no route to the controls the overlay is blocking.',
    remedy: 'Move focus to the dialog or to its first control as soon as it opens.'
  },
  {
    id: 'banner-no-accessible-name',
    area: 'banner',
    severities: ['error'],
    title: 'The banner dialog has no accessible name',
    reason: 'A dialog with no name is announced only as a dialog, so a screen reader user is told something opened without being told what it is asking.',
    remedy: 'Give the dialog an aria-label, or point aria-labelledby at its heading.'
  },
  {
    id: 'banner-missing-dialog-role',
    area: 'banner',
    severities: ['error'],
    title: 'A blocking overlay is not announced as a dialog',
    reason: 'The banner blocks the page but carries no dialog role and no aria-modal, so assistive technology treats it as ordinary content that happens to be near the top.',
    remedy: 'Mark the blocking container as role="dialog" with aria-modal="true", or use a native dialog element.'
  },
  {
    id: 'banner-reject-not-equivalent',
    area: 'banner',
    severities: ['error'],
    title: 'Rejecting takes more steps than accepting',
    reason: 'Accept is a button in the banner while reject is only reachable through a settings panel, so the two decisions are not offered on equal terms.',
    remedy: 'Put a reject control beside the accept control, at the same level of the interface.'
  },
  {
    id: 'banner-reject-absent',
    area: 'banner',
    severities: ['error'],
    title: 'The banner offers no way to refuse',
    reason: 'The banner has an accept control and no control that refuses, so the only way past it is to agree.',
    remedy: 'Add a control that refuses all non-essential purposes.'
  },
  {
    id: 'banner-close-means-accept',
    area: 'banner',
    severities: ['warning'],
    title: 'A dismiss control grants consent',
    reason: 'A control labelled as a close or dismiss affordance is wired to the accept handler, so a user who dismisses the banner has agreed without being told they were agreeing.',
    remedy: 'Make a dismiss control leave consent unchanged, or label it as accepting.'
  },
  {
    id: 'banner-background-not-inert',
    area: 'banner',
    severities: ['warning'],
    title: 'Content behind the modal banner stays reachable',
    reason: 'The page behind a modal banner is neither inert nor hidden from assistive technology, so a keyboard or screen reader user can operate controls they cannot see.',
    remedy: 'Mark the rest of the document inert, or hide it with aria-hidden while the dialog is open.'
  },
  {
    id: 'banner-scroll-lock-without-restore',
    area: 'banner',
    severities: ['warning'],
    title: 'Scroll is locked with no matching restore',
    reason: 'The banner sets overflow on the document to stop the page scrolling and no code puts it back, so the page stays unscrollable after the decision is taken.',
    remedy: 'Restore the previous overflow value when the banner closes.'
  },
  {
    id: 'banner-no-live-region-for-decision',
    area: 'banner',
    severities: ['notice'],
    title: 'The saved decision is not announced',
    reason: 'Consent is recorded and the banner disappears with no status message, so a screen reader user is given no confirmation that their choice was taken.',
    remedy: 'Put a short confirmation in a live region when the decision is saved.'
  },
  {
    id: 'banner-tabindex-positive',
    area: 'banner',
    severities: ['warning'],
    title: 'A positive tabindex inside the banner',
    reason: 'A positive tabindex pulls the control out of document order for the whole page, not just for the banner, so the tab sequence after the banner closes is still wrong.',
    remedy: 'Use tabindex="0" or rely on the natural order, and control order with the markup.'
  },
  {
    id: 'banner-autofocus-on-accept',
    area: 'banner',
    severities: ['notice'],
    title: 'Focus is placed on the accept control',
    reason: 'Opening with focus on accept makes the agreeing answer the one a keyboard user reaches by pressing space without reading, which is not a neutral starting position.',
    remedy: 'Focus the dialog or its heading, not one of the two answers.'
  },

  // Area: consent-mode
  {
    id: 'consent-default-missing',
    area: 'consent-mode',
    severities: ['error'],
    title: 'A consent update with no consent default',
    reason: 'An update is issued without a default ever being declared, so between page load and the update the tags run with their own built in assumption rather than with a denied state.',
    remedy: 'Declare a default consent state before any measurement code loads.'
  },
  {
    id: 'consent-default-granted',
    area: 'consent-mode',
    severities: ['error'],
    title: 'The default consent state grants storage',
    reason: 'A default that grants ad or analytics storage means the state before the user has answered is the state they would be in after agreeing.',
    remedy: 'Default every non-essential consent type to denied.'
  },
  {
    id: 'consent-default-after-config',
    area: 'consent-mode',
    severities: ['error'],
    title: 'The default is declared after the measurement config',
    reason: 'The config call starts measurement, so a default declared after it applies to nothing that has already been sent.',
    remedy: 'Put the default call above the config call, in the same script.'
  },
  {
    id: 'consent-missing-v2-signals',
    area: 'consent-mode',
    severities: ['error', 'warning'],
    title: 'The default omits the user data and personalization signals',
    reason: 'A default that declares only storage types leaves the two signals covering use of the data itself undeclared, so they fall back to the vendor default rather than to the user.',
    remedy: 'Declare ad_user_data and ad_personalization in the default alongside the storage types.'
  },
  {
    id: 'consent-no-wait-for-update',
    area: 'consent-mode',
    severities: ['warning'],
    title: 'The default sets no wait period',
    reason: 'Without a wait period the tags evaluate the default immediately, so a consent decision restored from storage a few milliseconds later arrives after the first requests have gone.',
    remedy: 'Set wait_for_update to the time the platform needs to restore a stored decision.'
  },
  {
    id: 'consent-ads-data-redaction-absent',
    area: 'consent-mode',
    severities: ['warning'],
    title: 'Ad storage is denied without redaction',
    reason: 'With ad storage denied and redaction unset, requests still carry the full page context, so the denial removes the cookie and not the data.',
    remedy: 'Set ads_data_redaction to true while ad storage is denied.'
  },
  {
    id: 'consent-url-passthrough-absent',
    area: 'consent-mode',
    severities: ['notice'],
    title: 'Analytics is denied without URL passthrough',
    reason: 'Denying analytics storage without passthrough loses the campaign context across navigations, which is usually an unintended measurement loss rather than a privacy gain.',
    remedy: 'Decide whether url_passthrough is wanted and set it explicitly.'
  },
  {
    id: 'consent-region-default-without-global',
    area: 'consent-mode',
    severities: ['error'],
    title: 'A region scoped default with no unscoped fallback',
    reason: 'A default that applies only to a list of regions leaves every other visitor with no default at all, which is the opposite of the intended effect.',
    remedy: 'Declare an unscoped default first, then narrow it for the regions that differ.'
  },
  {
    id: 'consent-update-without-user-action',
    area: 'consent-mode',
    severities: ['error'],
    title: 'The update runs at load rather than on a decision',
    reason: 'An update issued at the top level of a script grants consent before the banner has been shown, so the default it replaces never applies to anything.',
    remedy: 'Issue the update from the handler that records the decision.'
  },
  {
    id: 'consent-storage-key-unknown',
    area: 'consent-mode',
    severities: ['warning'],
    title: 'An unrecognised consent type name',
    reason: 'A consent type outside the documented set is ignored by the platform, so a key with a typo reads as a complete declaration while declaring nothing.',
    remedy: 'Use the documented consent type names, listed in docs/inputs.md.'
  },
  {
    id: 'consent-update-partial',
    area: 'consent-mode',
    severities: ['warning'],
    title: 'The update covers fewer types than the default declared',
    reason: 'A type that is denied by default and absent from the update stays denied after the user has agreed, so part of the decision is silently not applied.',
    remedy: 'Update every type the default declared, including the ones being left denied.'
  },

  // Area: tag-gating
  {
    id: 'tag-fires-on-pageview-without-consent',
    area: 'tag-gating',
    severities: ['error'],
    title: 'A tag fires on page view with no consent requirement',
    reason: 'The tag is triggered by the page view that happens before any decision and declares no required consent, so it runs for every visitor regardless of their answer.',
    remedy: 'Require the consent types the tag depends on, in the tag consent settings.'
  },
  {
    id: 'tag-consent-settings-not-configured',
    area: 'tag-gating',
    severities: ['error'],
    title: 'Tag consent settings are left unconfigured',
    reason: 'A tag whose consent settings have never been looked at is not a tag that was judged not to need consent, and the export cannot tell the two apart.',
    remedy: 'Set the consent settings on every tag, including the ones that need nothing.'
  },
  {
    id: 'tag-custom-html-unchecked',
    area: 'tag-gating',
    severities: ['error'],
    title: 'A custom HTML tag with no consent gate',
    reason: 'Custom HTML runs whatever it contains, so a custom tag with no consent requirement and no gate in its own body is the easiest way for a tracker to escape the container consent model.',
    remedy: 'Declare the required consent types on the tag rather than relying on its body.'
  },
  {
    id: 'tag-additional-consent-missing-for-marketing',
    area: 'tag-gating',
    severities: ['error'],
    title: 'A marketing tag does not require advertising consent',
    reason: 'A tag that sends data to an advertising destination requires ad storage whatever else it declares, and a tag that requires only analytics storage runs for a visitor who refused advertising.',
    remedy: 'Add ad_storage, and the user data signal where the destination needs it, to the tag requirements.'
  },
  {
    id: 'container-default-consent-not-declared',
    area: 'tag-gating',
    severities: ['error'],
    title: 'The container declares no default consent state',
    reason: 'With no consent initialisation in the container, every tag consent requirement is evaluated against whatever state the page happens to be in, which on a first visit is undefined.',
    remedy: 'Add a consent initialisation trigger that declares the defaults before anything else fires.'
  },
  {
    id: 'tag-trigger-before-consent-initialization',
    area: 'tag-gating',
    severities: ['warning'],
    title: 'A tag is ordered ahead of consent initialisation',
    reason: 'The tag firing priority puts it above the consent initialisation tag, so it is evaluated before the defaults exist.',
    remedy: 'Give consent initialisation the highest priority in the container.'
  },
  {
    id: 'tag-duplicate-measurement-config',
    area: 'tag-gating',
    severities: ['warning'],
    title: 'Two configuration tags for one measurement id',
    reason: 'Two configuration tags for the same destination send two page views and set the session twice, which doubles the traffic figure rather than the data.',
    remedy: 'Keep one configuration tag per destination.'
  },
  {
    id: 'script-tag-unconditional-third-party',
    area: 'tag-gating',
    severities: ['error'],
    title: 'A tracker script tag loads unconditionally',
    reason: 'A script element pointing at a recognised tracker with no gating attribute is fetched as the document parses, which happens before the banner has been painted.',
    remedy: 'Load the script from the consent handler, or park it behind a type the gate activates.'
  },
  {
    id: 'script-tag-type-gate-without-activation',
    area: 'tag-gating',
    severities: ['warning'],
    title: 'A parked script that nothing activates',
    reason: 'The script is parked with a non executable type and a gate class, and no code in the page ever converts it back, so the gate is a permanent block rather than a gate.',
    remedy: 'Activate the parked scripts from the consent handler, or remove them.'
  },

  // Area: cookies
  {
    id: 'cookie-no-samesite',
    area: 'cookies',
    severities: ['warning'],
    title: 'A cookie is set with no SameSite attribute',
    reason: 'Browsers differ in what they assume for a cookie with no SameSite, so the cookie behaves differently across browsers and the difference shows up as a measurement gap rather than an error.',
    remedy: 'State SameSite explicitly on every cookie.'
  },
  {
    id: 'cookie-samesite-none-without-secure',
    area: 'cookies',
    severities: ['error'],
    title: 'SameSite=None without Secure',
    reason: 'A cookie asking to be sent cross site without Secure is rejected outright, so the feature it supports fails with no message anywhere.',
    remedy: 'Add Secure to every SameSite=None cookie.'
  },
  {
    id: 'cookie-session-not-httponly',
    area: 'cookies',
    severities: ['error'],
    title: 'A session cookie is readable from script',
    reason: 'A session identifier that script can read is a session identifier any injected script can take, and a consent banner is a common place for third party script to run.',
    remedy: 'Set HttpOnly on session cookies.'
  },
  {
    id: 'cookie-host-prefix-violation',
    area: 'cookies',
    severities: ['error'],
    title: 'A __Host- cookie breaks the prefix rules',
    reason: 'The host prefix is a promise the browser enforces: Secure, no Domain, and a root path. A cookie that breaks any of the three is silently not stored at all.',
    remedy: 'Give a __Host- cookie Secure, Path=/ and no Domain attribute.'
  },
  {
    id: 'cookie-secure-prefix-violation',
    area: 'cookies',
    severities: ['error'],
    title: 'A __Secure- cookie is not Secure',
    reason: 'The secure prefix is also enforced, so the cookie is rejected and the code that reads it sees an absent value rather than a rejected one.',
    remedy: 'Add Secure to every cookie whose name carries the prefix.'
  },
  {
    id: 'cookie-lifetime-excessive',
    area: 'cookies',
    severities: ['warning', 'error'],
    title: 'A cookie lifetime beyond the declared cap',
    reason: 'A lifetime longer than the consent record it depends on outlives the decision that permitted it, so the cookie is still being sent after the consent has expired.',
    remedy: 'Keep the cookie lifetime at or under the consent lifetime.'
  },
  {
    id: 'cookie-analytics-set-before-consent',
    area: 'cookies',
    severities: ['error'],
    title: 'An analytics cookie is set before the decision',
    reason: 'The cookie appears in a response captured before consent was given, so the measurement identifier exists whatever the user goes on to answer.',
    remedy: 'Set the cookie from the consent handler, not from the first document response.'
  },
  {
    id: 'cookie-domain-wider-than-host',
    area: 'cookies',
    severities: ['warning'],
    title: 'A cookie is scoped wider than the host that set it',
    reason: 'A Domain attribute naming a parent domain sends the cookie to every sibling subdomain, including ones outside the scope the consent was collected for.',
    remedy: 'Drop the Domain attribute unless the cookie is genuinely shared.'
  },
  {
    id: 'cookie-consent-record-not-persisted',
    area: 'cookies',
    severities: ['error'],
    title: 'No consent record in the post decision response',
    reason: 'With no cookie or header carrying the decision after it was taken, the next request cannot tell the decision was made, so the banner reappears and the record cannot be produced later.',
    remedy: 'Persist the decision, its scope and its timestamp in a first party cookie.'
  },
  {
    id: 'cookie-duplicate-name-conflicting-attributes',
    area: 'cookies',
    severities: ['warning'],
    title: 'One cookie name set twice with different attributes',
    reason: 'Two Set-Cookie lines for one name leave which attributes survive to the ordering, so the cookie that ends up stored is not the one either line describes.',
    remedy: 'Set each cookie once, with the attributes it should keep.'
  },

  // Area: measurement
  {
    id: 'measurement-pii-in-parameter',
    area: 'measurement',
    severities: ['error'],
    title: 'A direct identifier in an event parameter',
    reason: 'An address or a telephone number in an event parameter is sent to the measurement destination as content, where it is retained under that destination policy rather than yours.',
    remedy: 'Remove the identifier, or send a value derived from it that cannot be reversed.'
  },
  {
    id: 'measurement-pii-in-page-path',
    area: 'measurement',
    severities: ['error'],
    title: 'A direct identifier in the reported page location',
    reason: 'A page path or location carrying a query parameter that holds an address sends the same data as an event parameter would, while looking like ordinary navigation.',
    remedy: 'Strip the parameter before reporting the location.'
  },
  {
    id: 'measurement-user-id-without-basis',
    area: 'measurement',
    severities: ['warning'],
    title: 'A cross session user id with no declared basis',
    reason: 'A user id joins sessions and devices, which is a different purpose from counting visits, and the code sets it with no reference to the consent that permits it.',
    remedy: 'Set the user id only inside the branch that has the relevant consent.'
  },
  {
    id: 'measurement-debug-mode-enabled',
    area: 'measurement',
    severities: ['warning'],
    title: 'Debug mode is on in shipped code',
    reason: 'Debug mode routes events into the debug stream and keeps them out of the reports, so the figures quietly exclude every visitor who loads the shipped file.',
    remedy: 'Switch debug mode on from a local flag, never in the shipped default.'
  },
  {
    id: 'measurement-id-placeholder',
    area: 'measurement',
    severities: ['error'],
    title: 'A placeholder measurement id',
    reason: 'A placeholder id sends every event to nowhere, and because the calls succeed there is nothing in the console to find.',
    remedy: 'Put the real id in, or read it from configuration at build time.'
  },
  {
    id: 'measurement-duplicate-config-call',
    area: 'measurement',
    severities: ['warning'],
    title: 'Two configuration calls for one destination',
    reason: 'Two configuration calls in one file send two page views for one load, which inflates the session count rather than the event count.',
    remedy: 'Configure each destination once.'
  },
  {
    id: 'measurement-raw-value-sent-as-hashed',
    area: 'measurement',
    severities: ['error'],
    title: 'A parameter named as hashed carries a raw value',
    reason: 'A parameter whose name promises a hash and whose argument is a plain literal is worse than an unnamed one, because the name is what a later reviewer will trust.',
    remedy: 'Hash the value before it is assigned, or rename the parameter.'
  },
  {
    id: 'measurement-page-view-double-counted',
    area: 'measurement',
    severities: ['warning'],
    title: 'A manual page view beside the automatic one',
    reason: 'The configuration call sends a page view unless it is told not to, so a manual page view beside it counts every load twice.',
    remedy: 'Turn off the automatic page view, or remove the manual one.'
  },

  // Area: storage
  {
    id: 'storage-identifier-before-consent',
    area: 'storage',
    severities: ['error'],
    title: 'An identifier is written to storage before the decision',
    reason: 'Writing an identifier to local storage is the same act as setting a cookie, and doing it before the decision means the identifier exists whatever the answer is.',
    remedy: 'Write the identifier from the consent handler.'
  },
  {
    id: 'storage-consent-state-client-only',
    area: 'storage',
    severities: ['notice'],
    title: 'The decision is kept only in client storage',
    reason: 'A decision held only in local storage is not sent with requests, so the server cannot act on it and the record cannot be produced from the server side later.',
    remedy: 'Mirror the decision into a first party cookie.'
  },
  {
    id: 'prefetch-to-tracker-before-consent',
    area: 'storage',
    severities: ['warning'],
    title: 'A connection to a tracker is opened before the decision',
    reason: 'A preconnect or a DNS prefetch to a tracker host is a request that carries the visitor address to that host before anything has been agreed.',
    remedy: 'Add the resource hints from the consent handler.'
  },
  {
    id: 'beacon-before-consent',
    area: 'storage',
    severities: ['error'],
    title: 'A beacon is sent before the decision',
    reason: 'A beacon or a fetch to a tracker above the consent gate delivers the payload whatever the user goes on to answer, and a beacon in particular cannot be cancelled.',
    remedy: 'Send it from the consent handler.'
  },
  {
    id: 'pixel-in-noscript-ungated',
    area: 'storage',
    severities: ['error'],
    title: 'An ungated tracking pixel in a noscript element',
    reason: 'A noscript pixel loads for every visitor without script, where no consent gate written in script can reach it, so the script side gate does not cover it at all.',
    remedy: 'Render the noscript pixel on the server only once consent is recorded.'
  },
  {
    id: 'fingerprinting-surface-before-consent',
    area: 'storage',
    severities: ['warning'],
    title: 'A fingerprinting surface is read before the decision',
    reason: 'Reading canvas output, the font list or the plugin list before the decision collects a device signal that does not need storage to work, so the storage consent types do not cover it.',
    remedy: 'Read it after the decision, or not at all.'
  },

  // Area: cmp
  {
    id: 'cmp-no-reject-all',
    area: 'cmp',
    severities: ['error'],
    title: 'The configuration declares no reject all action',
    reason: 'With no reject action configured, refusing every purpose has to be assembled toggle by toggle, which is not the same offer as the single control that accepts them all.',
    remedy: 'Configure a reject all action on the first layer.'
  },
  {
    id: 'cmp-categories-pre-enabled',
    area: 'cmp',
    severities: ['error'],
    title: 'A non essential category is enabled by default',
    reason: 'A category whose default is on is consent collected by inaction, and the configuration is where that default is decided rather than in the banner markup.',
    remedy: 'Default every category except the strictly necessary one to off.'
  },
  {
    id: 'cmp-consent-lifetime-excessive',
    area: 'cmp',
    severities: ['warning', 'error'],
    title: 'The consent lifetime is beyond the declared cap',
    reason: 'A decision kept for longer than the cap is a decision the visitor made under conditions that have since changed, and the banner will not ask again until it expires.',
    remedy: 'Set the lifetime at or under the cap, and ask again when the purposes change.'
  },
  {
    id: 'cmp-no-withdrawal-mechanism',
    area: 'cmp',
    severities: ['error'],
    title: 'No way to withdraw the decision',
    reason: 'With no withdrawal entry point configured, the only route back to the banner is clearing site data, so the decision is in practice one way.',
    remedy: 'Configure a persistent control that reopens the dialog.'
  },
  {
    id: 'cmp-no-consent-record',
    area: 'cmp',
    severities: ['error'],
    title: 'The decision is not recorded',
    reason: 'Without a stored record carrying the time, the scope and the configuration version, there is no way to say later what a given visitor was shown or what they answered.',
    remedy: 'Store a record holding at least the timestamp, the purposes and the configuration version.'
  },
  {
    id: 'cmp-legitimate-interest-pre-enabled',
    area: 'cmp',
    severities: ['warning'],
    title: 'A legitimate interest toggle starts enabled',
    reason: 'An objection toggle that starts in the non objecting position puts the burden of the decision on the visitor finding it, which is the same pattern as a pre ticked box in a different vocabulary.',
    remedy: 'Start the objection toggles in the objecting position for non essential purposes.'
  },
  {
    id: 'cmp-version-not-tracked',
    area: 'cmp',
    severities: ['warning'],
    title: 'The configuration carries no version',
    reason: 'With no version on the configuration, a stored decision cannot be matched to the text and the purposes that were shown when it was taken.',
    remedy: 'Put a version on the configuration and store it with each decision.'
  },
  {
    id: 'cmp-vendor-list-not-enumerated',
    area: 'cmp',
    severities: ['notice'],
    title: 'The vendor list is referenced rather than stated',
    reason: 'A configuration that points at a vendor list by address describes a set that can change without the configuration changing, so what was disclosed on a given day cannot be reconstructed from it.',
    remedy: 'Pin the vendor list version, or hold the list in the configuration.'
  }
];

export const CATALOGUE_BY_ID = new Map(CATALOGUE.map((entry) => [entry.id, entry]));

export function entryFor(id) {
  const entry = CATALOGUE_BY_ID.get(id);
  if (!entry) throw new Error(`no catalogue entry for id: ${id}`);
  return entry;
}

export function idsForArea(area) {
  return CATALOGUE.filter((entry) => entry.area === area).map((entry) => entry.id);
}

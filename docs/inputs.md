# What this reads

Five kinds of input, chosen by the file name. The classification is part of
the contract and `test/inputs.test.mjs` holds it.

| Suffix | Kind | What it is |
|---|---|---|
| `.html`, `.htm` | `html` | A page, or the part of one that holds the banner. Script elements written into it are read as script. |
| `.js`, `.mjs` | `js` | A script. |
| `.http`, `.headers` | `headers` | A captured set of response headers, in the format below. |
| `.container.json` | `container` | A tag container export. |
| `.cmp.json` | `cmp` | A consent platform configuration. |

`--as <kind>` reads every file after it as that kind, for an input whose name
does not carry one of these suffixes. A `.json` file that is neither
`.container.json` nor `.cmp.json` is refused rather than guessed at, and the
exit code for that is 64.

Six of the findings cannot be made from markup or script at all, because the
decisions behind them live in a settings screen. That is why two of the five
inputs are configuration rather than code.

## The captured header format

A capture is a sequence of phases. A phase line names when the capture was
taken, and a host line names the host that served it:

```
--- host: shop.example.com
--- phase: pre-consent
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Set-Cookie: sessionid=opaque-value; Path=/; Secure; HttpOnly; SameSite=Lax

--- phase: post-consent
HTTP/1.1 200 OK
Set-Cookie: cookie_consent=analytics; Path=/; Secure; SameSite=Lax; Max-Age=15552000
```

The phase names are `pre-consent`, `post-consent` and `unknown`. A file with
no phase line is read as a single `unknown` phase, and the timing findings do
not run against it: a capture that does not say when it was taken cannot
answer a question about when a cookie was set.

The host line is what lets a cookie be judged as scoped wider than the host
that set it. Without it, only a `Domain` attribute beginning with a dot is
detectable as widening.

A blank line ends a response. A line beginning `HTTP/` starts one.

The format has nowhere to declare that a cookie is strictly necessary, and
that is a declared limit with artefacts: see `capture-has-no-basis-field` in
docs/limits.md.

## The container export

The shape read out of a container export, with everything this repository
looks at:

```json
{
  "containerVersion": {
    "containerId": "GTM-EXAMPLE1",
    "tag": [
      {
        "tagId": "10",
        "name": "GA4 Configuration",
        "type": "gaawc",
        "priority": 0,
        "firingTriggerId": ["2"],
        "consentSettings": {
          "consentStatus": "NEEDED",
          "consentType": [{ "value": "analytics_storage" }]
        },
        "parameter": [{ "key": "measurementId", "value": "G-EXAMPLE1" }]
      }
    ],
    "trigger": [
      { "triggerId": "1", "name": "Consent Initialization", "type": "CONSENT_INIT" },
      { "triggerId": "2", "name": "All Pages", "type": "PAGEVIEW" }
    ]
  }
}
```

`consentStatus` is one of `NOT_SET`, `NOT_NEEDED` and `NEEDED`. The
difference between the first two is the whole reason for reading the export:
a tag that was judged not to need consent and a tag nobody has ever looked at
are indistinguishable in the page and plain here.

Tag types are read against closed lists in `src/checks/tag-gating.mjs`:
measurement types, advertising types, configuration types and custom HTML.
Trigger types that happen before any decision are `INIT`, `PAGEVIEW`,
`DOM_READY` and `WINDOW_LOADED`.

A consent check written inside a custom template is not in the export, and
that is a declared limit that manufactures a finding: see
`custom-template-consent` in docs/limits.md.

## The consent platform configuration

```json
{
  "version": "2026-03-01",
  "lifetimeDays": 180,
  "actions": { "acceptAll": true, "rejectAll": true, "save": true },
  "withdrawal": { "selector": "#privacy-choices" },
  "record": { "store": "cookie", "fields": ["timestamp", "purposes", "version"] },
  "categories": [
    { "id": "necessary", "essential": true, "defaultEnabled": true },
    { "id": "analytics", "essential": false, "defaultEnabled": false }
  ],
  "legitimateInterest": [{ "purposeId": "measurement", "defaultEnabled": false }],
  "vendors": { "listUrl": "https://vendors.example.com/list.json", "listVersion": "2026.03" }
}
```

`record.fields` must hold at least `timestamp` and `purposes`, and holding
`version` as well is what lets a stored decision be matched to the text that
was shown when it was taken.

## The closed vocabularies

Four lists in `src/vocabulary.mjs` decide what is recognised, and all four
are closed on purpose. A closed list can be printed, argued with and
extended; a fuzzy matcher would hide the same gaps behind an appearance of
generality.

- The consent type names, and the control keys that sit beside them in a
  default or an update.
- The tracker hosts, and the subset of them that are advertising
  destinations. An unlisted host is not recognised, which is the
  `closed-tracker-host-list` limit.
- The cookie name prefixes that mark a measurement identifier, and the ones
  that mark a consent record.
- The placeholder measurement ids.

The caps are in the same file: a cookie lifetime beyond 396 days is a
warning and beyond 730 days an error, and a stored decision beyond 180 days
is a warning and beyond 365 days an error. Both are stated as two numbers
because the severity boundary is part of the finding, not a judgement made
when it is reported.

## Word lists

The banner findings recognise a control by the words in its accessible name,
and recognise a consent container by the words in its id and class. Those
lists are in `src/checks/banner.mjs`. A control named in another language is
not recognised, and neither is a banner whose markup carries no consent word
and no dialog role.

## Scope, and what is read together

Everything named on one run is read as one site. That is deliberate: a
consent default written into the page and the update written in a separate
script file are the same consent model, and a checker that read each file
alone would report the update as having no default.

It has a consequence worth stating. The signals the banner findings look for
in script, a key handler comparing against Tab, a call that moves focus, a
page marked inert, are collected across every script given to the run. Two
pages given at once, one with focus containment and one without, both pass.
Run one page at a time when that matters.

Entities in attribute values are not decoded, and a raw angle bracket inside
an attribute value ends the start tag early. The second of those is a
declared limit with artefacts: see `unescaped-angle-bracket` in
docs/limits.md.

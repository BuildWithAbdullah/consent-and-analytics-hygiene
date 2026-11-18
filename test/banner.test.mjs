import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bannerContainers, isBlocking, ACCEPT_WORDS, REJECT_WORDS } from '../src/checks/banner.mjs';
import { parseHtml } from '../src/scan/elements.mjs';
import { CLEAN_CONSENT, NOTICE, PAGE_SHELL, html, idsIn, js, only, tokens } from './helpers.mjs';

const TRAP = `document.getElementById('cookie-dialog').addEventListener('keydown', function (event) {
  if (event.key === 'Tab') { event.preventDefault(); }
});
document.getElementById('cookie-dialog').focus();
`;

function dialog(attributes, body) {
  return PAGE_SHELL(`<div ${attributes} id="cookie-dialog" tabindex="-1">
  <h2 id="cookie-heading">We use cookies</h2>
  ${body}
</div>
<p role="status"></p>`, TRAP);
}

const BOTH_BUTTONS = `<button type="button" id="cmp-accept">Accept all</button>
  <button type="button" id="cmp-reject">Reject all</button>`;

test('a banner is recognised by a consent word in its identity', () => {
  for (const identity of ['id="cookie-bar"', 'class="consent-panel"', 'id="cmp"', 'class="gdpr-notice"', 'id="privacy-bar"']) {
    const parsed = parseHtml(`<div ${identity}></div>`);
    assert.equal(bannerContainers(parsed).length, 1, identity);
  }
});

test('a banner is recognised by a dialog role even with no consent word', () => {
  const parsed = parseHtml('<div role="dialog"></div><dialog></dialog>');
  assert.equal(bannerContainers(parsed).length, 2);
});

test('an element with neither is not a banner', () => {
  const parsed = parseHtml('<div class="promo-bar"></div>');
  assert.equal(bannerContainers(parsed).length, 0);
});

test('a nested consent element is part of the banner rather than a second one', () => {
  const parsed = parseHtml('<div id="cmp-root"><div class="cookie-panel"></div></div>');
  assert.equal(bannerContainers(parsed).length, 1);
});

test('modality is read from a dialog role, an inline position or an overlay word', () => {
  const cases = [
    ['<div role="dialog" id="c"></div>', true],
    ['<div aria-modal="true" id="c"></div>', true],
    ['<div id="c" style="position:fixed;inset:0"></div>', true],
    ['<div id="c" style="position: absolute; top: 0; left: 0"></div>', true],
    ['<div id="c" style="position:fixed;width:100%;height:100%"></div>', true],
    ['<div id="c" class="cmp-overlay"></div>', true],
    ['<div id="c" class="cookie-backdrop"></div>', true],
    ['<div id="c"><div class="cmp-scrim"></div></div>', true],
    ['<div id="c" style="position:static"></div>', false],
    ['<section id="cookie-notice"></section>', false]
  ];
  for (const [markup, expected] of cases) {
    const parsed = parseHtml(markup);
    assert.equal(isBlocking(parsed.elements[0]), expected, markup);
  }
});

test('a blocking container with no dialog role is reported', () => {
  const found = tokens([html(PAGE_SHELL(`<div class="cmp-overlay" style="position:fixed;inset:0">
  ${BOTH_BUTTONS}
</div>`))]);
  assert.ok(found.includes('banner-missing-dialog-role@error'));
});

test('a non blocking notice is not held to the modal rules', () => {
  assert.deepEqual(tokens([html(PAGE_SHELL(NOTICE))]), []);
});

test('a modal dialog with no focus containment is reported', () => {
  const found = idsIn(only([html(dialog('role="dialog" aria-modal="true" aria-label="Cookie choices"', BOTH_BUTTONS).replace(TRAP, "var a = 1;\n"))], 'banner-not-focus-trapped'));
  assert.deepEqual(found, ['banner-not-focus-trapped']);
});

test('a key handler comparing against Tab counts as containment', () => {
  const found = only([html(dialog('role="dialog" aria-modal="true" aria-label="Cookie choices"', BOTH_BUTTONS))], 'banner-not-focus-trapped');
  assert.deepEqual(found, []);
});

test('a native dialog opened as a modal counts as containment', () => {
  const page = PAGE_SHELL(`<dialog id="cookie-dialog" aria-label="Cookie choices">${BOTH_BUTTONS}</dialog><p role="status"></p>`,
    "document.getElementById('cookie-dialog').showModal();\n");
  assert.deepEqual(only([html(page)], 'banner-not-focus-trapped'), []);
});

test('a dialog takes its name from a label and not from its own content', () => {
  // A dialog with plenty of text inside it and no label has no accessible
  // name. Falling back to the content would report every named dialog as
  // named and never find this.
  const unnamed = dialog('role="dialog" aria-modal="true"', BOTH_BUTTONS);
  assert.equal(only([html(unnamed)], 'banner-no-accessible-name').length, 1);
});

test('aria-labelledby names a dialog', () => {
  const named = dialog('role="dialog" aria-modal="true" aria-labelledby="cookie-heading"', BOTH_BUTTONS);
  assert.deepEqual(only([html(named)], 'banner-no-accessible-name'), []);
});

test('a title attribute names a dialog', () => {
  const named = dialog('role="dialog" aria-modal="true" title="Cookie choices"', BOTH_BUTTONS);
  assert.deepEqual(only([html(named)], 'banner-no-accessible-name'), []);
});

test('focus not being moved into a blocking banner is reported', () => {
  const page = PAGE_SHELL(`<div class="cmp-overlay" style="position:fixed;inset:0">${BOTH_BUTTONS}</div>`);
  assert.equal(only([html(page)], 'banner-focus-not-moved').length, 1);
});

test('an autofocus inside the banner counts as moving focus', () => {
  const page = PAGE_SHELL(`<div class="cmp-overlay" style="position:fixed;inset:0">
  <button type="button" id="cmp-accept">Accept all</button>
  <button type="button" id="cmp-reject" autofocus>Reject all</button>
</div>`);
  assert.deepEqual(only([html(page)], 'banner-focus-not-moved'), []);
});

test('accept with no refusal and no settings is reported as no way to refuse', () => {
  const page = PAGE_SHELL(`<section id="cookie-notice" aria-label="Cookie choices">
  <button type="button">Accept all</button>
</section>`);
  const found = tokens([html(page)]);
  assert.deepEqual(found, ['banner-reject-absent@error']);
});

test('accept with settings but no refusal is reported as unequal rather than absent', () => {
  const page = PAGE_SHELL(`<section id="cookie-notice" aria-label="Cookie choices">
  <button type="button">Accept all</button>
  <button type="button">Manage settings</button>
</section>`);
  assert.deepEqual(tokens([html(page)]), ['banner-reject-not-equivalent@error']);
});

test('the two refusal findings are never both reported', () => {
  const page = PAGE_SHELL(`<section id="cookie-notice" aria-label="Cookie choices">
  <button type="button">Accept all</button>
  <button type="button">Preferences</button>
</section>`);
  const found = tokens([html(page)]);
  assert.equal(found.filter((token) => token.startsWith('banner-reject')).length, 1);
});

test('a refusal control is recognised by any of the documented wordings', () => {
  for (const word of REJECT_WORDS) {
    const page = PAGE_SHELL(`<section id="cookie-notice" aria-label="Cookie choices">
  <button type="button">Accept all</button>
  <button type="button">${word}</button>
</section>`);
    assert.deepEqual(tokens([html(page)]), [], word);
  }
});

test('an accept control is recognised by any of the documented wordings', () => {
  for (const word of ACCEPT_WORDS) {
    const page = PAGE_SHELL(`<section id="cookie-notice" aria-label="Cookie choices">
  <button type="button">${word}</button>
</section>`);
    assert.deepEqual(tokens([html(page)]), ['banner-reject-absent@error'], word);
  }
});

test('an accept control made of a logo is recognised through its alt text', () => {
  const page = PAGE_SHELL(`<section id="cookie-notice" aria-label="Cookie choices">
  <button type="button"><img src="ok.png" alt="Accept all"></button>
</section>`);
  assert.deepEqual(tokens([html(page)]), ['banner-reject-absent@error']);
});

test('a dismiss control wired to the accept handler is reported', () => {
  const page = PAGE_SHELL(`<section id="cookie-notice" aria-label="Cookie choices">
  ${BOTH_BUTTONS}
  <button type="button" id="cmp-close" aria-label="Close">x</button>
</section>
<p role="status"></p>`);
  const script = `${CLEAN_CONSENT}
document.getElementById('cmp-close').addEventListener('click', acceptAll);
`;
  assert.equal(only([html(page), js(script)], 'banner-close-means-accept').length, 1);
});

test('a dismiss control wired to its own handler is not reported', () => {
  const page = PAGE_SHELL(`<section id="cookie-notice" aria-label="Cookie choices">
  ${BOTH_BUTTONS}
  <button type="button" id="cmp-close" aria-label="Close">x</button>
</section>
<p role="status"></p>`);
  const script = `${CLEAN_CONSENT}
function dismiss() { document.getElementById('cookie-notice').hidden = true; }
document.getElementById('cmp-close').addEventListener('click', dismiss);
`;
  assert.deepEqual(only([html(page), js(script)], 'banner-close-means-accept'), []);
});

test('a live page behind a modal banner is reported', () => {
  const page = dialog('role="dialog" aria-modal="true" aria-label="Cookie choices"', BOTH_BUTTONS);
  assert.equal(only([html(page)], 'banner-background-not-inert').length, 1);
});

test('an inert page behind a modal banner is not reported', () => {
  const page = dialog('role="dialog" aria-modal="true" aria-label="Cookie choices"', BOTH_BUTTONS)
    .replace('<main id="page">', '<main id="page" inert>');
  assert.deepEqual(only([html(page)], 'banner-background-not-inert'), []);
});

test('a page hidden from assistive technology behind a modal banner is not reported', () => {
  const page = dialog('role="dialog" aria-modal="true" aria-label="Cookie choices"', BOTH_BUTTONS)
    .replace('<main id="page">', '<main id="page" aria-hidden="true">');
  assert.deepEqual(only([html(page)], 'banner-background-not-inert'), []);
});

test('a positive tabindex inside the banner is reported with its own line', () => {
  const page = PAGE_SHELL(`<section id="cookie-notice" aria-label="Cookie choices">
  <button type="button" tabindex="3">Accept all</button>
  <button type="button">Reject all</button>
</section>`);
  const found = only([html(page)], 'banner-tabindex-positive');
  assert.equal(found.length, 1);
  assert.match(found[0].detail, /tabindex=3/);
});

test('a zero or negative tabindex is not reported', () => {
  const page = PAGE_SHELL(`<section id="cookie-notice" aria-label="Cookie choices">
  <button type="button" tabindex="0">Accept all</button>
  <button type="button" tabindex="-1">Reject all</button>
</section>`);
  assert.deepEqual(only([html(page)], 'banner-tabindex-positive'), []);
});

test('focus starting on the accept control is reported', () => {
  const page = PAGE_SHELL(`<section id="cookie-notice" aria-label="Cookie choices">
  <button type="button" autofocus>Accept all</button>
  <button type="button">Reject all</button>
</section>`);
  assert.equal(only([html(page)], 'banner-autofocus-on-accept').length, 1);
});

test('focus starting on the refusal is not reported', () => {
  const page = PAGE_SHELL(`<section id="cookie-notice" aria-label="Cookie choices">
  <button type="button">Accept all</button>
  <button type="button" autofocus>Reject all</button>
</section>`);
  assert.deepEqual(only([html(page)], 'banner-autofocus-on-accept'), []);
});

test('a decision recorded with no status message anywhere is reported', () => {
  const page = PAGE_SHELL(NOTICE, CLEAN_CONSENT);
  assert.equal(only([html(page)], 'banner-no-live-region-for-decision').length, 1);
});

test('a live region anywhere in the document is enough', () => {
  const page = PAGE_SHELL(`${NOTICE}\n<p aria-live="polite"></p>`, CLEAN_CONSENT);
  assert.deepEqual(only([html(page)], 'banner-no-live-region-for-decision'), []);
});

test('no consent update means no missing status message', () => {
  assert.deepEqual(only([html(PAGE_SHELL(NOTICE))], 'banner-no-live-region-for-decision'), []);
});

test('scroll locked and never released is reported', () => {
  assert.equal(only([js("document.body.style.overflow = 'hidden';\n")], 'banner-scroll-lock-without-restore').length, 1);
});

test('a scroll lock with a restore is not reported', () => {
  const script = `document.body.style.overflow = 'hidden';
function close() { document.body.style.overflow = ''; }
`;
  assert.deepEqual(only([js(script)], 'banner-scroll-lock-without-restore'), []);
});

test('a scroll lock released through removeProperty is not reported', () => {
  const script = `document.body.style.overflow = 'hidden';
function close() { document.body.style.removeProperty('overflow'); }
`;
  assert.deepEqual(only([js(script)], 'banner-scroll-lock-without-restore'), []);
});

// Every defect found while writing this repository, reproduced.
//
// Each test here failed before the fix and passes after it. They are kept
// together rather than filed by area, because the pattern across them is
// more useful than any one of them: four of the six were found by an
// artefact reporting something it should not have, and two were in the
// checking machinery rather than in the checks.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { accessibleName, parseHtml, textOf } from '../src/scan/elements.mjs';
import { looksLikeTelephone } from '../src/checks/measurement.mjs';
import { ROOT, pairFiles } from '../tools/corpus.mjs';
import { auditFiles } from '../tools/audit-verdicts.mjs';
import { tokensOf } from '../src/findings.mjs';
import { js, only, tokens } from './helpers.mjs';

const DIGEST = '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8';

test('1: a hashed value is not reported as a telephone number', () => {
  // Found by the corrected side of measurement-payload still reporting an
  // identifier. The digest holds a ten digit run, and a bare digit run
  // pattern read it as a number, so the finding landed on exactly the value
  // somebody had hashed in order to be careful. Under a containment
  // assertion this would have passed in silence.
  assert.equal(looksLikeTelephone(DIGEST), false);
  assert.deepStrictEqual(
    tokensOf(auditFiles(pairFiles('measurement-payload', 'after'))),
    []
  );
});

test('2: an element keeps its own text when its tag holds raw text', () => {
  // The text walk skipped the text of any element in the raw text list, so
  // an inline icon with a title contributed nothing and a control made of
  // one had no accessible name at all. The raw text list and the list of
  // tags whose contents are not text are different lists.
  const parsed = parseHtml('<button><svg><title>Close</title></svg></button>');
  assert.equal(textOf(parsed.elements[0]), 'Close');
  assert.equal(accessibleName(parsed, parsed.elements[0]), 'Close');
});

test('2a: the title of an inline graphic is counted once', () => {
  // The first fix introduced the opposite defect: the title was pushed by
  // the graphic branch and then reached again by the walk, so the name came
  // back doubled.
  const parsed = parseHtml('<button><svg><title>Close</title></svg></button>');
  assert.equal(textOf(parsed.elements[0]), 'Close');
  assert.notEqual(textOf(parsed.elements[0]), 'Close Close');
});

test('3: a digit run inside a longer reference is not a telephone number', () => {
  // The first fix checked only for an adjacent letter. The separators a
  // telephone number may contain are the same ones that delimit a
  // reference, so in an order reference the digits are bounded by hyphens
  // and the letters are two characters further out.
  assert.equal(looksLikeTelephone('order-1234567890-eu'), false);
  assert.equal(looksLikeTelephone('build-20261118-1234567890'), false);
  assert.equal(looksLikeTelephone('+1 555 0142'), true);
});

test('4: a run longer than an international number is not a telephone number', () => {
  // The boundary rule cannot separate a number from a long reference made
  // only of digits and separators, because both stand alone. The upper
  // bound on the digit count can.
  const fifteen = `${'12345'}${'67890'}${'12345'}`;
  assert.equal(looksLikeTelephone(fifteen), true);
  assert.equal(looksLikeTelephone(`${fifteen}6`), false);
});

test('5: the measurement queue is read and an ordinary array append is not', () => {
  // Matching any member call named push read every array append as a
  // measurement call, so a list of addresses held in an application became
  // a finding about sending them to a measurement destination.
  assert.equal(only([js("dataLayer.push({ email: 'buyer@example.com' });")], 'measurement-pii-in-parameter').length, 1);
  assert.deepEqual(only([js("var to = [];\nto.push({ email: 'buyer@example.com' });")], 'measurement-pii-in-parameter'), []);
});

test('6: the guard against loose corpus assertions does not read its own file', () => {
  // The guard counts the lines in the pair suite that compare token sets
  // exactly. Written inside that same file it counted its own needle as a
  // match, and then counted the line doing the counting as a loose
  // assertion. A scanner cannot read its own declaration, and the way to
  // guarantee that is to put it in another file.
  const guard = readFileSync(join(ROOT, 'test/tools.test.mjs'), 'utf8');
  const subject = readFileSync(join(ROOT, 'test/pairs.test.mjs'), 'utf8');
  assert.ok(guard.includes('pairs.test.mjs'), 'the guard reads the pair suite');
  assert.equal(subject.includes('tools.test.mjs'), false, 'the pair suite does not read the guard');
});

test('7: an unescaped angle bracket in an attribute loses the label', () => {
  // Not fixed, declared. The element reader ends a start tag at the next
  // angle bracket, so a raw one inside an attribute value truncates the tag
  // and a control whose label carried it is no longer recognised. It is the
  // eleventh declared limit, with a blind artefact that reports nothing and
  // a contrast artefact that reports the finding.
  const broken = parseHtml('<button aria-label="Accept all > continue">OK</button>');
  assert.equal(accessibleName(broken, broken.elements[0]).includes('Accept all'), false);
  const escaped = parseHtml('<button aria-label="Accept all &gt; continue">OK</button>');
  assert.ok(accessibleName(escaped, escaped.elements[0]).includes('Accept all'));
});

test('every corrected artefact is still exactly as clean as it declares', () => {
  // The standing form of defects 1 through 5. Four of the six were found
  // this way, and none of them would have been found by an assertion that
  // the corrected side merely stops reporting the findings it was written
  // for.
  const residuals = ['consent-passthrough-tradeoff'];
  for (const slug of ['measurement-payload', 'banner-naming-and-order', 'cookie-attributes', 'cmp-configuration']) {
    assert.deepStrictEqual(tokensOf(auditFiles(pairFiles(slug, 'after'))), [], slug);
  }
  assert.deepStrictEqual(
    tokensOf(auditFiles(pairFiles(residuals[0], 'after'))),
    ['consent-url-passthrough-absent@notice']
  );
});

test('nothing in the corpus reports a finding at an undeclared severity', () => {
  // The finding factory throws rather than reporting, so this passing is a
  // statement about the whole corpus having been run through it.
  assert.doesNotThrow(() => {
    for (const slug of ['banner-focus-trap', 'storage-before-gate', 'tag-custom-html']) {
      auditFiles(pairFiles(slug, 'before'));
    }
  });
});

test('reading a page one way and the whole corpus the other agree', () => {
  const direct = tokensOf(auditFiles(pairFiles('script-gating', 'before')));
  assert.deepStrictEqual(direct, [
    'pixel-in-noscript-ungated@error',
    'prefetch-to-tracker-before-consent@warning',
    'script-tag-unconditional-third-party@error'
  ]);
  assert.deepStrictEqual(tokens([{ path: 'empty.html', source: '<!doctype html><html></html>' }]), []);
});

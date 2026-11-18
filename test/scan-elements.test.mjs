import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  accessibleName, ancestors, attr, byId, classesOf, descendants, hasAttr,
  isFocusable, parseHtml, roleOf, textOf
} from '../src/scan/elements.mjs';

function parse(source) {
  return parseHtml(source, 'page.html');
}

test('elements come back with their tag, their attributes and their line', () => {
  const parsed = parse('<div id="a">\n  <p class="x y">hello</p>\n</div>');
  const paragraph = parsed.elements.find((element) => element.tag === 'p');
  assert.equal(paragraph.line, 2);
  assert.equal(attr(paragraph, 'class'), 'x y');
  assert.deepEqual(classesOf(paragraph), ['x', 'y']);
});

test('attribute names are read case insensitively', () => {
  const parsed = parse('<div ARIA-Modal="true" ID="x"></div>');
  const element = parsed.elements[0];
  assert.equal(attr(element, 'aria-modal'), 'true');
  assert.equal(attr(element, 'ARIA-MODAL'), 'true');
  assert.equal(attr(element, 'id'), 'x');
});

test('an attribute with no value reads as present and empty', () => {
  const parsed = parse('<button autofocus disabled>Go</button>');
  const element = parsed.elements[0];
  assert.equal(hasAttr(element, 'autofocus'), true);
  assert.equal(attr(element, 'autofocus'), '');
  assert.equal(attr(element, 'nothing'), null);
  assert.equal(hasAttr(element, 'nothing'), false);
});

test('single quoted and unquoted attribute values are both read', () => {
  const parsed = parse("<a href='/x' target=_blank rel=\"noopener\">x</a>");
  const element = parsed.elements[0];
  assert.equal(attr(element, 'href'), '/x');
  assert.equal(attr(element, 'target'), '_blank');
  assert.equal(attr(element, 'rel'), 'noopener');
});

test('a comment is kept as a comment and not read as markup', () => {
  const parsed = parse('<div><!-- <button>Accept</button> --></div>');
  assert.equal(parsed.elements.filter((element) => element.tag === 'button').length, 0);
});

test('a doctype is skipped', () => {
  const parsed = parse('<!doctype html>\n<html><body><p>x</p></body></html>');
  assert.equal(parsed.elements.map((element) => element.tag).includes('!doctype'), false);
});

test('a void element does not swallow what follows it', () => {
  const parsed = parse('<div><img src="a.png" alt="A"><p>after</p></div>');
  const paragraph = parsed.elements.find((element) => element.tag === 'p');
  assert.equal(paragraph.parent.tag, 'div');
});

test('a self closing tag does not open a scope', () => {
  const parsed = parse('<div><span/><p>after</p></div>');
  const paragraph = parsed.elements.find((element) => element.tag === 'p');
  assert.equal(paragraph.parent.tag, 'div');
});

test('script contents come back as raw text, not as elements', () => {
  const parsed = parse('<script>var markup = "<button>Accept</button>";</script>');
  const script = parsed.elements[0];
  assert.match(script.raw, /var markup/);
  assert.equal(parsed.elements.filter((element) => element.tag === 'button').length, 0);
});

test('an unclosed element does not lose its siblings', () => {
  const parsed = parse('<div><p>one<p>two</div><footer>f</footer>');
  assert.ok(parsed.elements.some((element) => element.tag === 'footer'));
});

test('an image contributes its alt text to the text of its container', () => {
  // A label made of a brand logo has a name. Stripping tags and reading what
  // is left says it has none, which is the shape of a real defect on this
  // account.
  const parsed = parse('<button><img src="logo.png" alt="Accept all"></button>');
  assert.equal(textOf(parsed.elements[0]), 'Accept all');
});

test('an image with no alt contributes nothing', () => {
  const parsed = parse('<button><img src="logo.png" alt=""> </button>');
  assert.equal(textOf(parsed.elements[0]), '');
});

test('an image button contributes its alt text too', () => {
  const parsed = parse('<span><input type="image" alt="Reject all"></span>');
  assert.equal(textOf(parsed.elements[0]), 'Reject all');
});

test('an inline svg contributes its title', () => {
  const parsed = parse('<button><svg><title>Close</title></svg></button>');
  assert.equal(textOf(parsed.elements[0]), 'Close');
});

test('text is collapsed and trimmed', () => {
  const parsed = parse('<p>  one\n   two  </p>');
  assert.equal(textOf(parsed.elements[0]), 'one two');
});

test('script text inside an element is not part of its text', () => {
  const parsed = parse('<div>visible<script>var hidden = 1;</script></div>');
  assert.equal(textOf(parsed.elements[0]), 'visible');
});

test('an accessible name prefers aria-label over content', () => {
  const parsed = parse('<button aria-label="Reject all">x</button>');
  assert.equal(accessibleName(parsed, parsed.elements[0]), 'Reject all');
});

test('aria-labelledby is resolved through the document', () => {
  const parsed = parse('<h2 id="h">Cookie choices</h2><div role="dialog" aria-labelledby="h"></div>');
  const dialog = parsed.elements.find((element) => roleOf(element) === 'dialog');
  assert.equal(accessibleName(parsed, dialog), 'Cookie choices');
});

test('aria-labelledby pointing at nothing falls through to the content', () => {
  const parsed = parse('<button aria-labelledby="absent">Accept all</button>');
  assert.equal(accessibleName(parsed, parsed.elements[0]), 'Accept all');
});

test('a title attribute is the last resort', () => {
  const parsed = parse('<button title="Close"></button>');
  assert.equal(accessibleName(parsed, parsed.elements[0]), 'Close');
});

test('an element with nothing to name it has an empty name', () => {
  const parsed = parse('<button></button>');
  assert.equal(accessibleName(parsed, parsed.elements[0]), '');
});

test('focusability follows the tag and the tabindex', () => {
  const parsed = parse([
    '<button>b</button>',
    '<a href="/x">a</a>',
    '<a>no href</a>',
    '<input type="text">',
    '<input type="hidden">',
    '<div tabindex="0"></div>',
    '<div tabindex="-1"></div>',
    '<div></div>',
    '<button disabled>d</button>',
    '<div contenteditable="true"></div>'
  ].join('\n'));
  const answers = parsed.elements.map((element) => isFocusable(element));
  assert.deepEqual(answers, [true, true, false, true, false, true, false, false, false, true]);
});

test('descendants and ancestors agree with each other', () => {
  const parsed = parse('<main><section><p><em>x</em></p></section></main>');
  const main = parsed.elements.find((element) => element.tag === 'main');
  const em = parsed.elements.find((element) => element.tag === 'em');
  assert.ok(descendants(main).includes(em));
  assert.ok(ancestors(em).includes(main));
});

test('roleOf prefers the explicit role and falls back to the tag', () => {
  const parsed = parse('<dialog></dialog><button></button><a href="/x">x</a><div role="alertdialog"></div><span></span>');
  assert.deepEqual(parsed.elements.map((element) => roleOf(element)),
    ['dialog', 'button', 'link', 'alertdialog', null]);
});

test('a role list reads as its first token', () => {
  const parsed = parse('<div role="dialog region"></div>');
  assert.equal(roleOf(parsed.elements[0]), 'dialog');
});

test('byId finds an element and refuses to invent one', () => {
  const parsed = parse('<div id="here"></div>');
  assert.equal(byId(parsed, 'here').tag, 'div');
  assert.equal(byId(parsed, 'absent'), null);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  braceDepthAt, findCalls, lineOf, maskSource, readArray, readLiteral, readObject,
  stringLiterals, UNRESOLVED
} from '../src/scan/js.mjs';

test('a line comment is masked and keeps its newlines', () => {
  const source = "var a = 1; // gtag('consent','default',{})\nvar b = 2;";
  const masked = maskSource(source);
  assert.equal(masked.length, source.length);
  assert.equal(masked.split('\n').length, source.split('\n').length);
  assert.equal(masked.includes('consent'), false);
});

test('a block comment is masked across lines', () => {
  const source = "/*\n gtag('consent','update',{})\n*/\nvar a = 1;";
  assert.equal(maskSource(source).includes('consent'), false);
});

test('a string body is masked and its quotes are kept', () => {
  const source = "var a = 'hello';";
  const masked = maskSource(source);
  assert.equal(masked.includes('hello'), false);
  assert.equal(masked.includes("''"), false);
  assert.equal(masked[8], "'");
});

test('an escaped quote does not end the string', () => {
  const source = "var a = 'it\\'s here'; var b = 1;";
  const masked = maskSource(source);
  assert.equal(masked.includes('here'), false);
  assert.equal(masked.includes('var b'), true);
});

test('a bracket inside a string does not change the shape of a call', () => {
  const calls = findCalls("f('a)b', 2);");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, ["'a)b'", '2']);
});

test('a comma inside a nested object does not split the arguments', () => {
  const calls = findCalls("f({ a: 1, b: { c: 2, d: 3 } }, 4);");
  assert.equal(calls[0].args.length, 2);
  assert.equal(calls[0].args[1], '4');
});

test('a dotted callee is read whole', () => {
  const calls = findCalls('window.dataLayer.push({ a: 1 });');
  assert.equal(calls[0].callee, 'window.dataLayer.push');
});

test('whitespace inside a member expression is removed', () => {
  const calls = findCalls('window\n  .gtag("consent", "default", {});');
  assert.equal(calls[0].callee, 'window.gtag');
});

test('a keyword followed by a bracket is not a call', () => {
  const calls = findCalls('if (a) { while (b) { c(); } }');
  assert.deepEqual(calls.map((call) => call.callee), ['c']);
});

test('a call records the line it starts on', () => {
  const calls = findCalls('\n\nf(1);');
  assert.equal(calls[0].line, 3);
  assert.equal(lineOf('a\nb\nc', 4), 3);
});

test('the statement text reaches back across an earlier call in a chain', () => {
  // Without this the callee pattern stops at the closing bracket of the
  // query, and a listener attached to a selected element is invisible.
  const calls = findCalls("document.querySelector('.cmp-close').addEventListener('click', acceptAll);");
  const listener = calls.find((call) => call.callee === 'addEventListener');
  assert.match(listener.statementText, /cmp-close/);
  assert.match(listener.statementText, /acceptAll/);
});

test('the statement text stops at the previous statement', () => {
  const calls = findCalls("first('a');\nsecond('b');");
  const second = calls.find((call) => call.callee === 'second');
  assert.equal(second.statementText.includes('first'), false);
});

test('readLiteral reads the literal types', () => {
  assert.equal(readLiteral("'a'"), 'a');
  assert.equal(readLiteral('"b"'), 'b');
  assert.equal(readLiteral('`c`'), 'c');
  assert.equal(readLiteral('true'), true);
  assert.equal(readLiteral('false'), false);
  assert.equal(readLiteral('null'), null);
  assert.equal(readLiteral('42'), 42);
  assert.equal(readLiteral('-1.5'), -1.5);
});

test('readLiteral refuses to guess at anything that is not a literal', () => {
  assert.equal(readLiteral('defaults'), UNRESOLVED);
  assert.equal(readLiteral('a + b'), UNRESOLVED);
  assert.equal(readLiteral("atob('x')"), UNRESOLVED);
  assert.equal(readLiteral('  '), UNRESOLVED);
});

test('an escape inside a string literal is decoded', () => {
  assert.equal(readLiteral("'a\\nb'"), 'a\nb');
  assert.equal(readLiteral("'it\\'s'"), "it's");
});

test('readObject returns a map of parsed values', () => {
  const object = readObject("{ a: 'x', 'b': 2, \"c\": true }");
  assert.deepEqual([...object.entries()], [['a', 'x'], ['b', 2], ['c', true]]);
});

test('readObject nests', () => {
  const object = readObject('{ outer: { inner: 1 } }');
  assert.equal(object.get('outer').get('inner'), 1);
});

test('readObject marks a value it cannot read as unresolved rather than dropping it', () => {
  const object = readObject('{ a: someVariable }');
  assert.equal(object.get('a'), UNRESOLVED);
  assert.equal(object.has('a'), true);
});

test('readObject skips an entry with no colon rather than inventing one', () => {
  const object = readObject('{ ...spread, a: 1 }');
  assert.deepEqual([...object.keys()], ['a']);
});

test('readArray reads a list', () => {
  assert.deepEqual(readArray("['ES', 'DE']"), ['ES', 'DE']);
  assert.deepEqual(readArray('[]'), []);
});

test('a colon inside a nested object does not split the outer entry', () => {
  const object = readObject('{ a: { b: 1 }, c: 2 }');
  assert.deepEqual([...object.keys()], ['a', 'c']);
});

test('braceDepthAt tells a top level call from one inside a function', () => {
  const source = "a();\nfunction f() {\n  b();\n}\n";
  assert.equal(braceDepthAt(source, source.indexOf('a()')), 0);
  assert.equal(braceDepthAt(source, source.indexOf('b()')), 1);
});

test('a brace inside a string does not change the depth', () => {
  const source = "var s = '{';\na();";
  assert.equal(braceDepthAt(source, source.indexOf('a()')), 0);
});

test('stringLiterals reports the literals with their lines', () => {
  const found = stringLiterals("var a = 'one';\nvar b = \"two\";");
  assert.deepEqual(found.map((entry) => entry.value), ['one', 'two']);
  assert.deepEqual(found.map((entry) => entry.line), [1, 2]);
});

test('a literal inside a comment is not reported as a literal', () => {
  const found = stringLiterals("// 'commented'\nvar a = 'real';");
  assert.deepEqual(found.map((entry) => entry.value), ['real']);
});

test('an unterminated string does not hang the masker', () => {
  const masked = maskSource("var a = 'unterminated");
  assert.equal(masked.length, "var a = 'unterminated".length);
});

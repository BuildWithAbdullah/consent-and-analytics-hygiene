import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InputError, KINDS, at, buildInputs, jsSources, kindFor } from '../src/inputs.mjs';

test('the five input kinds are the documented set', () => {
  assert.deepEqual(KINDS, ['html', 'js', 'headers', 'container', 'cmp']);
});

test('each documented suffix picks its kind', () => {
  assert.equal(kindFor('a.html'), 'html');
  assert.equal(kindFor('a.htm'), 'html');
  assert.equal(kindFor('a.js'), 'js');
  assert.equal(kindFor('a.mjs'), 'js');
  assert.equal(kindFor('a.http'), 'headers');
  assert.equal(kindFor('a.headers'), 'headers');
  assert.equal(kindFor('a.container.json'), 'container');
  assert.equal(kindFor('a.cmp.json'), 'cmp');
});

test('the suffix is read case insensitively', () => {
  assert.equal(kindFor('A.HTML'), 'html');
  assert.equal(kindFor('A.Container.JSON'), 'container');
});

test('a plain json file is refused rather than guessed at', () => {
  assert.equal(kindFor('a.json'), null);
  assert.throws(() => buildInputs([{ path: 'a.json', source: '{}' }]), InputError);
});

test('the refusal says how to resolve it', () => {
  assert.throws(() => buildInputs([{ path: 'a.json', source: '{}' }]), /--as/);
});

test('an explicit kind overrides the name', () => {
  const inputs = buildInputs([{ path: 'whatever.json', kind: 'cmp', source: '{"version":"1"}' }]);
  assert.equal(inputs.cmp.length, 1);
});

test('an unknown explicit kind is refused', () => {
  assert.throws(() => buildInputs([{ path: 'a.txt', kind: 'invented', source: '' }]), /unknown input kind/);
});

test('malformed json names the file and the reason', () => {
  assert.throws(
    () => buildInputs([{ path: 'broken.cmp.json', source: '{' }]),
    /broken.cmp.json is not valid JSON/
  );
});

test('html is parsed on the way in', () => {
  const inputs = buildInputs([{ path: 'a.html', source: '<div id="x"></div>' }]);
  assert.equal(inputs.html[0].parsed.elements.length, 1);
});

test('a header capture is parsed on the way in', () => {
  const inputs = buildInputs([{ path: 'a.http', source: 'HTTP/1.1 200 OK\nSet-Cookie: a=1' }]);
  assert.equal(inputs.headers[0].capture.responses.length, 1);
});

test('a script written into a document is read as script', () => {
  const inputs = buildInputs([{ path: 'a.html', source: '<body>\n<script>\nvar a = 1;\n</script>\n</body>' }]);
  const sources = jsSources(inputs);
  assert.equal(sources.length, 1);
  assert.match(sources[0].source, /var a = 1/);
  assert.equal(sources[0].path, 'a.html');
  assert.equal(sources[0].inline, true);
});

test('an inline script carries the line offset of its element', () => {
  const inputs = buildInputs([{ path: 'a.html', source: '<body>\n\n\n<script>\nvar a = 1;\n</script>' }]);
  const source = jsSources(inputs)[0];
  assert.equal(source.lineOffset, 4);
  assert.deepEqual(at(source, 1), { path: 'a.html', line: 5 });
});

test('a script element with a src is not read as inline script', () => {
  const inputs = buildInputs([{ path: 'a.html', source: '<script src="/a.js"></script>' }]);
  assert.equal(jsSources(inputs).length, 0);
});

test('a parked script is not read as script', () => {
  const inputs = buildInputs([{ path: 'a.html', source: '<script type="text/plain">var a = 1;</script>' }]);
  assert.equal(jsSources(inputs).length, 0);
});

test('a module script is read as script', () => {
  const inputs = buildInputs([{ path: 'a.html', source: '<script type="module">var a = 1;</script>' }]);
  assert.equal(jsSources(inputs).length, 1);
});

test('an empty script element is skipped', () => {
  const inputs = buildInputs([{ path: 'a.html', source: '<script>   </script>' }]);
  assert.equal(jsSources(inputs).length, 0);
});

test('a standalone script file has no line offset', () => {
  const inputs = buildInputs([{ path: 'a.js', source: 'var a = 1;' }]);
  const source = jsSources(inputs)[0];
  assert.equal(source.lineOffset, 0);
  assert.deepEqual(at(source, 3), { path: 'a.js', line: 3 });
});

test('inputs of every kind can be given at once', () => {
  const inputs = buildInputs([
    { path: 'a.html', source: '<div></div>' },
    { path: 'a.js', source: 'var a = 1;' },
    { path: 'a.http', source: 'HTTP/1.1 200 OK' },
    { path: 'a.container.json', source: '{"containerVersion":{"tag":[],"trigger":[]}}' },
    { path: 'a.cmp.json', source: '{"version":"1"}' }
  ]);
  assert.deepEqual(KINDS.map((kind) => inputs[kind].length), [1, 1, 1, 1, 1]);
});

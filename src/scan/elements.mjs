// A dependency free element scanner.
//
// This is deliberately not an HTML parser. It reads start tags, end tags,
// comments and raw text elements well enough to answer the questions the
// banner and script tag checks ask, and docs/limits.md states what it
// cannot do. A parser dependency was considered and rejected: every
// repository on this account is dependency free so that a red build means
// something, and writing the limits down turned out to be more useful than
// the extra accuracy would have been.

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr'
]);

// Tags whose contents the parser reads as raw text rather than as markup.
const RAW_TEXT_TAGS = new Set(['script', 'style', 'textarea', 'title']);

// Tags whose contents are not text at all. This is a shorter list than the
// one above on purpose: a title element holds raw text that IS text, and a
// label made of an inline icon takes its name from exactly that. Using the
// raw text list here drops the text of the element being read, so the name
// comes back empty.
const NON_TEXT_TAGS = new Set(['script', 'style', 'textarea']);

const FOCUSABLE_TAGS = new Set(['a', 'button', 'input', 'select', 'textarea', 'summary']);

function lineAt(source, index) {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i += 1) {
    if (source[i] === '\n') line += 1;
  }
  return line;
}

function parseAttributes(text) {
  const attrs = new Map();
  const pattern = /([^\s"'>/=]+)(\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const name = match[1].toLowerCase();
    if (attrs.has(name)) continue;
    let value = '';
    if (match[2] === undefined) value = '';
    else if (match[4] !== undefined) value = match[4];
    else if (match[5] !== undefined) value = match[5];
    else if (match[6] !== undefined) value = match[6];
    attrs.set(name, value);
  }
  return attrs;
}

export function parseHtml(source, path = '<input>') {
  const root = {
    type: 'element',
    tag: '#document',
    attrs: new Map(),
    children: [],
    parent: null,
    line: 1,
    path
  };
  const elements = [];
  const stack = [root];
  let index = 0;

  const pushText = (value, at) => {
    if (value === '') return;
    stack[stack.length - 1].children.push({
      type: 'text',
      value,
      line: lineAt(source, at),
      parent: stack[stack.length - 1]
    });
  };

  while (index < source.length) {
    const next = source.indexOf('<', index);
    if (next === -1) {
      pushText(source.slice(index), index);
      break;
    }
    if (next > index) pushText(source.slice(index, next), index);

    if (source.startsWith('<!--', next)) {
      const end = source.indexOf('-->', next + 4);
      const stop = end === -1 ? source.length : end + 3;
      stack[stack.length - 1].children.push({
        type: 'comment',
        value: source.slice(next + 4, end === -1 ? source.length : end),
        line: lineAt(source, next),
        parent: stack[stack.length - 1]
      });
      index = stop;
      continue;
    }
    if (source.startsWith('<!', next) || source.startsWith('<?', next)) {
      const end = source.indexOf('>', next);
      index = end === -1 ? source.length : end + 1;
      continue;
    }
    if (source.startsWith('</', next)) {
      const end = source.indexOf('>', next);
      const stop = end === -1 ? source.length : end + 1;
      const name = source.slice(next + 2, end === -1 ? source.length : end).trim().toLowerCase();
      for (let depth = stack.length - 1; depth > 0; depth -= 1) {
        if (stack[depth].tag === name) {
          stack.length = depth;
          break;
        }
      }
      index = stop;
      continue;
    }

    const end = source.indexOf('>', next);
    if (end === -1) {
      pushText(source.slice(next), next);
      break;
    }
    let inner = source.slice(next + 1, end);
    const selfClosing = inner.endsWith('/');
    if (selfClosing) inner = inner.slice(0, -1);
    const space = inner.search(/\s/);
    const name = (space === -1 ? inner : inner.slice(0, space)).toLowerCase();
    if (name === '') {
      pushText(source.slice(next, end + 1), next);
      index = end + 1;
      continue;
    }
    const attrs = parseAttributes(space === -1 ? '' : inner.slice(space));
    const element = {
      type: 'element',
      tag: name,
      attrs,
      children: [],
      parent: stack[stack.length - 1],
      line: lineAt(source, next),
      path
    };
    stack[stack.length - 1].children.push(element);
    elements.push(element);
    index = end + 1;

    if (VOID_TAGS.has(name) || selfClosing) continue;

    if (RAW_TEXT_TAGS.has(name)) {
      const closeAt = source.toLowerCase().indexOf(`</${name}`, index);
      const raw = source.slice(index, closeAt === -1 ? source.length : closeAt);
      element.raw = raw;
      if (raw !== '') {
        element.children.push({
          type: 'text',
          value: raw,
          line: lineAt(source, index),
          parent: element
        });
      }
      index = closeAt === -1 ? source.length : closeAt;
      continue;
    }

    stack.push(element);
  }

  return { root, elements, path };
}

export function attr(element, name) {
  if (!element || !element.attrs) return null;
  const value = element.attrs.get(name.toLowerCase());
  return value === undefined ? null : value;
}

export function hasAttr(element, name) {
  return Boolean(element && element.attrs && element.attrs.has(name.toLowerCase()));
}

export function classesOf(element) {
  const value = attr(element, 'class');
  if (!value) return [];
  return value.split(/\s+/).filter(Boolean);
}

export function descendants(element) {
  const out = [];
  const walk = (node) => {
    for (const child of node.children || []) {
      if (child.type === 'element') {
        out.push(child);
        walk(child);
      }
    }
  };
  walk(element);
  return out;
}

export function ancestors(element) {
  const out = [];
  let current = element.parent;
  while (current) {
    out.push(current);
    current = current.parent;
  }
  return out;
}

// An image contributes its alt text to the text of its container. Stripping
// tags and reading what is left gets this wrong, and a label made of a brand
// logo then reads as having no name at all.
export function textOf(element) {
  if (!element) return '';
  const parts = [];
  const walk = (node) => {
    for (const child of node.children || []) {
      if (child.type === 'text') {
        if (!NON_TEXT_TAGS.has(node.tag)) parts.push(child.value);
      } else if (child.type === 'element') {
        if (child.tag === 'img' || (child.tag === 'input' && (attr(child, 'type') || '').toLowerCase() === 'image')) {
          const alt = attr(child, 'alt');
          if (alt) parts.push(alt);
        }
        if (child.tag === 'svg') {
          // An inline graphic contributes its title and nothing else, and
          // the walk stops here so the title is not counted a second time
          // on the way down.
          const titled = descendants(child).find((node) => node.tag === 'title');
          if (titled) parts.push(textOf(titled));
          continue;
        }
        walk(child);
      }
    }
  };
  walk(element);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

export function byId(parsed, id) {
  return parsed.elements.find((element) => attr(element, 'id') === id) || null;
}

export function accessibleName(parsed, element) {
  const label = attr(element, 'aria-label');
  if (label && label.trim() !== '') return label.trim();
  const labelledBy = attr(element, 'aria-labelledby');
  if (labelledBy) {
    const names = labelledBy
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => {
        const target = byId(parsed, id);
        return target ? textOf(target) : '';
      })
      .filter((value) => value !== '');
    if (names.length > 0) return names.join(' ');
  }
  const text = textOf(element);
  if (text !== '') return text;
  const title = attr(element, 'title');
  if (title && title.trim() !== '') return title.trim();
  const alt = attr(element, 'alt');
  if (alt && alt.trim() !== '') return alt.trim();
  return '';
}

export function isFocusable(element) {
  const tabindex = attr(element, 'tabindex');
  if (tabindex !== null) {
    const parsed = Number.parseInt(tabindex, 10);
    if (Number.isFinite(parsed)) return parsed >= 0;
  }
  if (hasAttr(element, 'disabled')) return false;
  if (FOCUSABLE_TAGS.has(element.tag)) {
    if (element.tag === 'a') return hasAttr(element, 'href');
    if (element.tag === 'input') return (attr(element, 'type') || '').toLowerCase() !== 'hidden';
    return true;
  }
  const editable = attr(element, 'contenteditable');
  if (editable !== null && editable !== 'false') return true;
  return false;
}

export function roleOf(element) {
  const explicit = attr(element, 'role');
  if (explicit && explicit.trim() !== '') return explicit.trim().split(/\s+/)[0].toLowerCase();
  if (element.tag === 'dialog') return 'dialog';
  if (element.tag === 'button') return 'button';
  if (element.tag === 'a' && hasAttr(element, 'href')) return 'link';
  return null;
}

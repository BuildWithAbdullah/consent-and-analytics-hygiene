// Client storage, and everything that leaves the page before the decision.
//
// The storage consent types are about storage, so the things in this file
// that are not storage at all, a beacon, a preconnect, a canvas read, are
// the ones a consent model built only around cookies does not cover.

import { attr, descendants } from '../scan/elements.mjs';
import { findCalls, lineOf, readLiteral } from '../scan/js.mjs';
import { makeFinding } from '../findings.mjs';
import { at, jsSources } from '../inputs.mjs';
import { hostOf, isTrackerHost } from '../vocabulary.mjs';

export const IDENTIFIER_KEY_WORDS = ['id', 'uid', 'visitor', 'client', 'device', 'anon', 'session'];
export const CONSENT_KEY_WORDS = ['consent', 'cmp', 'gdpr', 'cookie_policy'];
export const PREFETCH_RELS = ['preconnect', 'dns-prefetch', 'prefetch', 'preload'];
export const FINGERPRINTING_CALLS = ['toDataURL', 'getImageData', 'getHighEntropyValues', 'enumerateDevices'];
export const FINGERPRINTING_READS = ['navigator.plugins', 'navigator.mimeTypes', 'document.fonts.check'];

// The point in a script after which a decision is known. A call above this
// index runs before the decision; a call below it may not.
//
// This is a source position, not an execution order, and that difference is
// a declared limit with an artefact: a tracker call inside a function
// declared above the gate is reported even though it runs after.
export function gateIndex(source) {
  const candidates = [];
  for (const call of findCalls(source)) {
    if ((call.callee === 'gtag' || call.callee.endsWith('.gtag'))
      && readLiteral(call.args[0] || '') === 'consent'
      && readLiteral(call.args[1] || '') === 'update') {
      candidates.push(call.index);
    }
    if (/^(has|get|read|check)[A-Za-z]*Consent$/i.test(call.callee)
      || /consent/i.test(call.callee) && /^(window\.)?__?consent/i.test(call.callee)) {
      candidates.push(call.index);
    }
  }
  const guard = source.search(/if\s*\([^)]*consent/i);
  if (guard !== -1) candidates.push(guard);
  if (candidates.length === 0) return Number.POSITIVE_INFINITY;
  return Math.min(...candidates);
}

function mentionsIdentifier(key) {
  if (typeof key !== 'string') return false;
  const lowered = key.toLowerCase();
  if (CONSENT_KEY_WORDS.some((word) => lowered.includes(word))) return false;
  return IDENTIFIER_KEY_WORDS.some((word) => new RegExp(`(^|[^a-z])${word}([^a-z]|$)`).test(lowered));
}

function mentionsConsent(key) {
  if (typeof key !== 'string') return false;
  const lowered = key.toLowerCase();
  return CONSENT_KEY_WORDS.some((word) => lowered.includes(word));
}

export function checkStorage(inputs) {
  const findings = [];
  const scripts = jsSources(inputs);

  let consentInClientStorageOnly = false;
  let anyCookieWrite = false;
  let anyConsentStorageWrite = false;

  for (const script of scripts) {
    const gate = gateIndex(script.source);
    if (/document\.cookie\s*=/.test(script.source)) anyCookieWrite = true;

    for (const call of findCalls(script.source)) {
      const where = at(script, call.line);
      const callee = call.callee;

      if (/^(window\.)?(localStorage|sessionStorage)\.setItem$/.test(callee)) {
        const key = readLiteral(call.args[0] || '');
        if (mentionsConsent(key)) {
          anyConsentStorageWrite = true;
        } else if (mentionsIdentifier(key) && call.index < gate) {
          findings.push(makeFinding('storage-identifier-before-consent', 'error', where,
            `${String(key)} is written to storage above the consent gate`));
        }
      }

      const isSend = /sendBeacon$/.test(callee) || callee === 'fetch' || /\.open$/.test(callee);
      if (isSend) {
        const target = call.args.map((arg) => readLiteral(arg)).find((value) => typeof value === 'string' && /^(https?:)?\/\//.test(value));
        if (target && isTrackerHost(hostOf(target)) && call.index < gate) {
          findings.push(makeFinding('beacon-before-consent', 'error', where,
            `a request to ${hostOf(target)} is issued above the consent gate`));
        }
      }

      if (FINGERPRINTING_CALLS.some((name) => callee.endsWith(name)) && call.index < gate) {
        findings.push(makeFinding('fingerprinting-surface-before-consent', 'warning', where,
          `${callee} is read above the consent gate`));
      }
    }

    for (const read of FINGERPRINTING_READS) {
      const index = script.source.indexOf(read);
      if (index !== -1 && index < gateIndex(script.source)) {
        findings.push(makeFinding('fingerprinting-surface-before-consent', 'warning',
          at(script, lineOf(script.source, index)),
          `${read} is read above the consent gate`));
      }
    }
  }

  if (anyConsentStorageWrite && !anyCookieWrite) consentInClientStorageOnly = true;
  if (consentInClientStorageOnly) {
    const script = scripts.find((candidate) => /setItem/.test(candidate.source));
    findings.push(makeFinding('storage-consent-state-client-only', 'notice',
      at(script || { path: '<input>', lineOffset: 0 }, 1),
      'the decision is held in client storage only, so no request carries it'));
  }

  for (const document of inputs.html) {
    for (const element of document.parsed.elements) {
      const where = { path: document.path, line: element.line };

      if (element.tag === 'link') {
        const rel = (attr(element, 'rel') || '').toLowerCase().trim();
        const href = attr(element, 'href');
        if (PREFETCH_RELS.includes(rel) && isTrackerHost(hostOf(href))) {
          findings.push(makeFinding('prefetch-to-tracker-before-consent', 'warning', where,
            `${rel} opens a connection to ${hostOf(href)} as the document parses`));
        }
      }

      if (element.tag === 'noscript') {
        // The contents of a noscript element are read as elements, because a
        // static reader has no scripting state to switch on. A browser with
        // scripting enabled treats them as text, which is exactly why a
        // consent gate written in script cannot reach them.
        for (const child of descendants(element)) {
          if (!['img', 'iframe', 'script', 'embed'].includes(child.tag)) continue;
          const source = attr(child, 'src');
          if (isTrackerHost(hostOf(source))) {
            findings.push(makeFinding('pixel-in-noscript-ungated', 'error',
              { path: document.path, line: child.line },
              `a noscript element loads ${hostOf(source)} for every visitor without script`));
          }
        }
      }
    }
  }

  return findings;
}

export const __internal = { mentionsIdentifier, mentionsConsent };

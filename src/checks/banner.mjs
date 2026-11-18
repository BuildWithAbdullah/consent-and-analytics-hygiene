// The consent banner read as an interactive component.
//
// A consent banner is the one dialog on a site that every visitor meets and
// that almost nobody tests with a keyboard, which is why it is so often the
// worst focus trap on the page. These checks read the banner markup and the
// script beside it.

import {
  accessibleName, attr, classesOf, descendants, hasAttr, isFocusable, roleOf, textOf
} from '../scan/elements.mjs';
import { findCalls, readLiteral, stringLiterals } from '../scan/js.mjs';
import { makeFinding } from '../findings.mjs';
import { at, jsSources } from '../inputs.mjs';

// Word lists, stated rather than guessed at. A control is recognised by the
// words in its accessible name, so a name in another language is not
// recognised, and docs/limits.md says so.
export const BANNER_WORDS = ['cookie', 'consent', 'cmp', 'gdpr', 'privacy'];
export const ACCEPT_WORDS = ['accept', 'agree', 'allow all', 'allow cookies', 'got it', 'ok, got it'];
export const REJECT_WORDS = ['reject', 'decline', 'refuse', 'deny', 'only necessary', 'necessary only', 'essential only', 'only essential'];
export const MANAGE_WORDS = ['manage', 'settings', 'preferences', 'customise', 'customize', 'options', 'choices'];
export const DISMISS_WORDS = ['close', 'dismiss', 'hide'];
export const OVERLAY_WORDS = ['overlay', 'backdrop', 'modal', 'scrim'];

function nameMatches(name, words) {
  const lowered = name.toLowerCase();
  return words.some((word) => lowered.includes(word));
}

function identityWords(element) {
  return [attr(element, 'id') || '', ...classesOf(element)].join(' ').toLowerCase();
}

export function bannerContainers(parsed) {
  const found = [];
  for (const element of parsed.elements) {
    const role = roleOf(element);
    const isDialogRole = role === 'dialog' || role === 'alertdialog' || element.tag === 'dialog';
    const words = identityWords(element);
    const named = BANNER_WORDS.some((word) => words.includes(word));
    if (!isDialogRole && !named) continue;
    // A nested element inside an already recognised container is part of it,
    // not a second banner.
    if (found.some((outer) => descendants(outer).includes(element))) continue;
    found.push(element);
  }
  return found;
}

// Modality is read from markup signals only. A banner made modal in a
// stylesheet is not recognised, which is a declared limit with an artefact.
export function isBlocking(element) {
  if (attr(element, 'aria-modal') === 'true') return true;
  if (roleOf(element) === 'dialog' || roleOf(element) === 'alertdialog') return true;
  const style = (attr(element, 'style') || '').toLowerCase().replace(/\s+/g, '');
  if (style.includes('position:fixed') || style.includes('position:absolute')) {
    if (style.includes('inset:0') || (style.includes('top:0') && style.includes('left:0'))) return true;
    if (style.includes('width:100%') && style.includes('height:100%')) return true;
  }
  const words = identityWords(element);
  if (OVERLAY_WORDS.some((word) => words.includes(word))) return true;
  if (descendants(element).some((child) => OVERLAY_WORDS.some((word) => identityWords(child).includes(word)))) {
    return true;
  }
  return false;
}

function isModalDialog(element) {
  const role = roleOf(element);
  const dialogish = role === 'dialog' || role === 'alertdialog' || element.tag === 'dialog';
  return dialogish && (attr(element, 'aria-modal') === 'true' || element.tag === 'dialog');
}

function controlsIn(element) {
  return descendants(element).filter(
    (child) => isFocusable(child) || roleOf(child) === 'button'
  );
}

function focusTrapSignals(scripts) {
  const signals = { tabKey: false, showModal: false, inert: false, focusCall: false, overflowSet: [], overflowRestored: false };
  for (const script of scripts) {
    for (const literal of stringLiterals(script.source)) {
      if (literal.value === 'Tab') signals.tabKey = true;
    }
    for (const call of findCalls(script.source)) {
      if (call.callee.endsWith('showModal')) signals.showModal = true;
      if (call.callee.endsWith('focus')) signals.focusCall = true;
      if (call.callee.endsWith('setAttribute') && readLiteral(call.args[0] || '') === 'inert') signals.inert = true;
      if (call.callee.endsWith('removeProperty') && readLiteral(call.args[0] || '') === 'overflow') {
        signals.overflowRestored = true;
      }
    }
    if (/\.inert\s*=\s*true/.test(script.source)) signals.inert = true;
    const overflow = /\.style\.overflow\s*=\s*(['"`])([^'"`]*)\1/g;
    let match;
    while ((match = overflow.exec(script.source)) !== null) {
      signals.overflowSet.push(match[2]);
    }
  }
  return signals;
}

function acceptHandlerNames(scripts) {
  const names = new Set();
  for (const script of scripts) {
    const pattern = /function\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
    let match;
    while ((match = pattern.exec(script.source)) !== null) {
      if (nameMatches(match[1], ['accept', 'allowall', 'grantall', 'agree'])) names.add(match[1]);
    }
    const assigned = /(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:function|\()/g;
    while ((match = assigned.exec(script.source)) !== null) {
      if (nameMatches(match[1], ['accept', 'allowall', 'grantall', 'agree'])) names.add(match[1]);
    }
  }
  return names;
}

export function checkBanner(inputs) {
  const findings = [];
  const scripts = jsSources(inputs);
  const signals = focusTrapSignals(scripts);
  const acceptNames = acceptHandlerNames(scripts);

  const anyConsentUpdate = scripts.some((script) =>
    findCalls(script.source).some(
      (call) => call.callee.endsWith('gtag') && readLiteral(call.args[0] || '') === 'consent'
        && readLiteral(call.args[1] || '') === 'update'
    )
  );

  for (const document of inputs.html) {
    const parsed = document.parsed;
    const banners = bannerContainers(parsed);
    const liveRegions = parsed.elements.filter(
      (element) => hasAttr(element, 'aria-live') || ['status', 'alert'].includes(roleOf(element))
    );

    for (const banner of banners) {
      const where = { path: document.path, line: banner.line };
      const blocking = isBlocking(banner);
      const modal = isModalDialog(banner);
      const controls = controlsIn(banner);
      const names = controls.map((control) => ({ control, name: accessibleName(parsed, control) }));

      if (blocking && !modal) {
        findings.push(makeFinding('banner-missing-dialog-role', 'error', where,
          'a blocking consent container with no dialog role and no aria-modal'));
      }

      if (modal && !signals.tabKey && !signals.showModal) {
        findings.push(makeFinding('banner-not-focus-trapped', 'error', where,
          'a modal consent dialog with no focus containment in the script beside it'));
      }

      if (modal) {
        const name = (attr(banner, 'aria-label') || '').trim()
          || (attr(banner, 'aria-labelledby') || '').trim()
          || (attr(banner, 'title') || '').trim();
        // A dialog does not take its name from its own content, so textOf is
        // deliberately not consulted here. It is used for the controls below,
        // where content is exactly where the name comes from.
        if (name === '') {
          findings.push(makeFinding('banner-no-accessible-name', 'error', where,
            'the consent dialog has no aria-label, aria-labelledby or title'));
        }
      }

      const autofocusInBanner = descendants(banner).some((child) => hasAttr(child, 'autofocus'));
      if (blocking && !autofocusInBanner && !signals.focusCall && !signals.showModal) {
        findings.push(makeFinding('banner-focus-not-moved', 'error', where,
          'nothing moves focus into the banner when it opens'));
      }

      const hasAccept = names.some((entry) => nameMatches(entry.name, ACCEPT_WORDS));
      const hasReject = names.some((entry) => nameMatches(entry.name, REJECT_WORDS));
      const hasManage = names.some((entry) => nameMatches(entry.name, MANAGE_WORDS));
      if (hasAccept && !hasReject) {
        if (hasManage) {
          findings.push(makeFinding('banner-reject-not-equivalent', 'error', where,
            'accept is in the banner and refusing is only reachable through the settings control'));
        } else {
          findings.push(makeFinding('banner-reject-absent', 'error', where,
            'the banner offers accept with no control that refuses'));
        }
      }

      if (modal) {
        const otherTopLevel = parsed.elements.filter(
          (element) => element !== banner
            && !descendants(banner).includes(element)
            && ['main', 'div', 'section', 'body'].includes(element.tag)
            && element.parent
            && ['body', '#document', 'html'].includes(element.parent.tag)
        );
        const neutralised = otherTopLevel.some(
          (element) => hasAttr(element, 'inert') || attr(element, 'aria-hidden') === 'true'
        );
        if (otherTopLevel.length > 0 && !neutralised && !signals.inert && !signals.showModal) {
          findings.push(makeFinding('banner-background-not-inert', 'warning', where,
            'the page behind the modal banner is neither inert nor hidden'));
        }
      }

      for (const child of descendants(banner)) {
        const tabindex = attr(child, 'tabindex');
        if (tabindex === null) continue;
        const value = Number.parseInt(tabindex, 10);
        if (Number.isFinite(value) && value > 0) {
          findings.push(makeFinding('banner-tabindex-positive', 'warning',
            { path: document.path, line: child.line },
            `tabindex=${value} inside the consent banner`));
        }
      }

      for (const entry of names) {
        if (!nameMatches(entry.name, ACCEPT_WORDS)) continue;
        if (hasAttr(entry.control, 'autofocus')) {
          findings.push(makeFinding('banner-autofocus-on-accept', 'notice',
            { path: document.path, line: entry.control.line },
            'the accept control is the one that receives focus on open'));
        }
      }

      const dismissControls = names.filter((entry) =>
        nameMatches(entry.name, DISMISS_WORDS) || nameMatches(attr(entry.control, 'aria-label') || '', DISMISS_WORDS));
      for (const entry of dismissControls) {
        const identity = [attr(entry.control, 'id') || '', ...classesOf(entry.control)].filter(Boolean);
        if (identity.length === 0) continue;
        const wired = scripts.some((script) => findCalls(script.source).some((call) => {
          if (!call.callee.endsWith('addEventListener')) return false;
          const statement = call.statementText;
          if (!identity.some((token) => statement.includes(token))) return false;
          if ([...acceptNames].some((name) => new RegExp(`\\b${name}\\b`).test(statement))) return true;
          const inline = statement.toLowerCase();
          return inline.includes('granted');
        }));
        if (wired) {
          findings.push(makeFinding('banner-close-means-accept', 'warning',
            { path: document.path, line: entry.control.line },
            'the dismiss control is wired to the handler that grants consent'));
        }
      }

      if (banners.length > 0 && anyConsentUpdate && liveRegions.length === 0) {
        findings.push(makeFinding('banner-no-live-region-for-decision', 'notice', where,
          'consent is recorded with no status message anywhere in the document'));
      }
    }
  }

  if (signals.overflowSet.includes('hidden') && !signals.overflowRestored
    && !signals.overflowSet.some((value) => value !== 'hidden')) {
    const script = scripts.find((candidate) => /\.style\.overflow\s*=\s*(['"`])hidden\1/.test(candidate.source));
    if (script) {
      const line = script.source.split('\n').findIndex((text) => /\.style\.overflow\s*=\s*(['"`])hidden\1/.test(text)) + 1;
      findings.push(makeFinding('banner-scroll-lock-without-restore', 'warning', at(script, line),
        'scroll is locked on the document and nothing restores it'));
    }
  }

  return findings;
}

export const __internal = { nameMatches, focusTrapSignals, acceptHandlerNames };

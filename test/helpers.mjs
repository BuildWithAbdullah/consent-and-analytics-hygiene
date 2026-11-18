// Running the audit over sources written inline in a test, with no files on
// disk. The checks take parsed inputs rather than paths, which is what makes
// this possible and is why most of the suite does not touch the filesystem.

import { audit } from '../src/audit.mjs';
import { buildInputs } from '../src/inputs.mjs';
import { tokensOf } from '../src/findings.mjs';

export function auditSources(sources) {
  return audit(buildInputs(sources));
}

export function tokens(sources) {
  return tokensOf(auditSources(sources));
}

export function html(source, path = 'page.html') {
  return { path, source };
}

export function js(source, path = 'app.js') {
  return { path, source };
}

export function headers(source, path = 'capture.http') {
  return { path, source };
}

export function container(data, path = 'export.container.json') {
  return { path, source: JSON.stringify(data) };
}

export function cmp(data, path = 'config.cmp.json') {
  return { path, source: JSON.stringify(data) };
}

export function idsIn(findings) {
  return [...new Set(findings.map((finding) => finding.id))].sort();
}

export function only(sources, id) {
  return auditSources(sources).filter((finding) => finding.id === id);
}

// A clean consent block, so a test about one area is not reporting findings
// from another.
export const CLEAN_CONSENT = `gtag('consent', 'default', {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: 'denied',
  wait_for_update: 500
});
gtag('set', 'ads_data_redaction', true);
gtag('set', 'url_passthrough', true);

function acceptAll() {
  gtag('consent', 'update', {
    ad_storage: 'granted',
    ad_user_data: 'granted',
    ad_personalization: 'granted',
    analytics_storage: 'granted'
  });
}
`;

export const PAGE_SHELL = (body, scripts = '') => `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Example store</title></head>
<body>
<main id="page"><h1>Example store</h1></main>
${body}
${scripts ? `<script>\n${scripts}</script>` : ''}
</body>
</html>
`;

export const NOTICE = `<section id="cookie-notice" aria-label="Cookie choices">
  <p>We would like to measure how the site is used.</p>
  <button type="button" id="cmp-accept">Accept all</button>
  <button type="button" id="cmp-reject">Reject all</button>
</section>`;

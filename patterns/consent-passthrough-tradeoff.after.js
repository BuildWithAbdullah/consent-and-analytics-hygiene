gtag('consent', 'default', {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: 'denied',
  wait_for_update: 500
});

// Redaction is switched on because ad storage is denied. Passthrough is
// deliberately left off: this site does not want campaign context carried
// across navigations before a decision has been taken, so the notice that
// stays behind is the correct report of a choice rather than a defect. It is
// declared as the residual of this pair, and the suite requires it to still
// be there.
gtag('set', 'ads_data_redaction', true);

function acceptAll() {
  gtag('consent', 'update', {
    ad_storage: 'granted',
    ad_user_data: 'granted',
    ad_personalization: 'granted',
    analytics_storage: 'granted'
  });
}

document.getElementById('cmp-accept').addEventListener('click', acceptAll);

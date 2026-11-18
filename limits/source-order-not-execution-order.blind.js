gtag('consent', 'default', {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: 'denied',
  wait_for_update: 500
});
gtag('set', 'ads_data_redaction', true);
gtag('set', 'url_passthrough', true);

function sendSignup() {
  navigator.sendBeacon('https://api.segment.io/v1/t', 'signup');
}

function acceptAll() {
  gtag('consent', 'update', {
    ad_storage: 'granted',
    ad_user_data: 'granted',
    ad_personalization: 'granted',
    analytics_storage: 'granted'
  });
  sendSignup();
}

document.getElementById('cmp-accept').addEventListener('click', acceptAll);

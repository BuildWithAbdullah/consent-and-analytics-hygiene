gtag('consent', 'default', {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: 'denied',
  wait_for_update: 500
});
gtag('set', 'ads_data_redaction', true);
gtag('set', 'url_passthrough', true);

function onAccept() {
  gtag('consent', 'update', {
    ad_storage: 'granted',
    ad_user_data: 'granted',
    ad_personalization: 'granted',
    analytics_storage: 'granted'
  });

  var visitorId = Math.random().toString(36).slice(2);
  localStorage.setItem('visitor_id', visitorId);
  navigator.sendBeacon('https://api.segment.io/v1/t', visitorId);
  var canvas = document.createElement('canvas');
  var fingerprint = canvas.toDataURL();
  return fingerprint;
}

document.getElementById('cmp-accept').addEventListener('click', onAccept);

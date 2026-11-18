var defaults = {
  ad_storage: 'granted',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: 'denied',
  wait_for_update: 500
};

gtag('consent', 'default', defaults);
gtag('set', 'url_passthrough', true);

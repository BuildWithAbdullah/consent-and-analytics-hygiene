var g = window.gtag;

function acceptAll() {
  g('consent', 'update', {
    analytics_storage: 'granted'
  });
}

document.getElementById('cmp-accept').addEventListener('click', acceptAll);

function recordDecision(purposes) {
  localStorage.setItem('cookie_consent', purposes.join(','));
}

document.getElementById('cmp-accept').addEventListener('click', function () {
  recordDecision(['analytics']);
});

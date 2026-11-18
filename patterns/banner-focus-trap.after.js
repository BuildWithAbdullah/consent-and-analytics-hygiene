var dialog = document.getElementById('cookie-dialog');
var page = document.getElementById('page');

function trapFocus(element) {
  element.addEventListener('keydown', function (event) {
    if (event.key !== 'Tab') return;
    var focusable = element.querySelectorAll('button, [href]');
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      last.focus();
      event.preventDefault();
    } else if (!event.shiftKey && document.activeElement === last) {
      first.focus();
      event.preventDefault();
    }
  });
}

function openBanner() {
  dialog.hidden = false;
  page.inert = true;
  trapFocus(dialog);
  dialog.focus();
}

openBanner();

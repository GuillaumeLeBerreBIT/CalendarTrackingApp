// Applies the saved theme before the app renders (no flash). A separate file because the
// CSP allows only same-origin scripts. Mirrors client/src/lib/theme.ts.
(function () {
  var theme = 'dark';
  try {
    var pref = window.localStorage.getItem('eventli-theme');
    if (pref === 'light') theme = 'light';
    else if (pref === 'system') {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
  } catch (e) { /* storage blocked: keep dark */ }
  document.documentElement.setAttribute('data-theme', theme);
})();

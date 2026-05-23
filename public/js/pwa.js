document.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/static/sw.js')
        .then(registration => {
          console.log('ServiceWorker registration successful with scope: ', registration.scope);
        }, err => {
          console.log('ServiceWorker registration failed: ', err);
        });
    });
  }

  // Keep session alive — POST every 55 minutes to slide the cookie window
  setInterval(async () => {
    try {
      await fetch('/refresh-session', { method: 'POST', credentials: 'include' });
    } catch (_) {}
  }, 55 * 60 * 1000);
});

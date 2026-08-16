// Apply the saved/system theme before first paint to avoid a flash.
//
// Kept as an external file rather than inline in index.html: the backend's
// Content-Security-Policy (backend/src/app.js) sets script-src without
// 'unsafe-inline', so an inline <script> here would simply be blocked.
(function () {
  try {
    var t = localStorage.getItem('jt_theme');
    if (!t) {
      t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    if (t === 'dark') document.documentElement.classList.add('dark');
  } catch (e) {}
})();

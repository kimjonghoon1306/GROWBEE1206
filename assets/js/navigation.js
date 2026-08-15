(function () {
  function initNavigation() {
    var style = document.getElementById('onjongil-global-mobile-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'onjongil-global-mobile-style';
      style.textContent = '#onjongil-global-theme-slot{position:fixed;top:12px;right:14px;z-index:10020}#onjongil-global-theme-slot #modeBtn{width:44px;height:44px;border:1px solid rgba(25,140,77,.26);border-radius:14px;background:var(--bg-card,#fff);box-shadow:0 8px 24px rgba(15,50,32,.14);font-size:20px;align-items:center;justify-content:center;cursor:pointer}@media(max-width:768px){#modeBtn.global-theme-toggle{display:flex!important;visibility:visible!important;opacity:1!important;flex-shrink:0!important}.header-right{display:flex!important;align-items:center!important}}';
      document.head.appendChild(style);
    }
    var headerRight = document.querySelector('.site-header .header-right, header .header-right');
    var mode = document.getElementById('modeBtn');
    if (!mode) {
      mode = document.createElement('button');
      mode.id = 'modeBtn'; mode.className = 'h-ico'; mode.type = 'button';
      mode.setAttribute('aria-label', '낮/밤 테마 전환'); mode.textContent = '🌙';
      mode.addEventListener('click', function () {
        if (typeof window.toggleMode === 'function') window.toggleMode();
        else {
          var night = document.body.classList.toggle('night');
          localStorage.setItem('onjongil-mode', night ? 'night' : 'day');
          mode.textContent = night ? '☀️' : '🌙';
        }
      });
    }
    if (mode) {
      mode.classList.add('global-theme-toggle');
      var hamburger = headerRight && headerRight.querySelector('.hamburger');
      if (headerRight && hamburger && mode.nextElementSibling !== hamburger) headerRight.insertBefore(mode, hamburger);
      else if (headerRight && !mode.parentElement) headerRight.appendChild(mode);
      else if (!headerRight) {
        var slot = document.getElementById('onjongil-global-theme-slot');
        if (!slot) { slot = document.createElement('div'); slot.id = 'onjongil-global-theme-slot'; document.body.appendChild(slot); }
        slot.appendChild(mode);
      }
      mode.textContent = document.body.classList.contains('night') || localStorage.getItem('onjongil-mode') === 'night' ? '☀️' : '🌙';
    }
    document.querySelectorAll('.back-btn').forEach(function (back) {
      if (back.getAttribute('data-one-click-back') === '1') return;
      back.setAttribute('data-one-click-back', '1');
      back.addEventListener('click', function (e) {
        e.preventDefault();
        var fallback = location.pathname.indexOf('/pages/user/') >= 0 ? '../../index.html' : 'index.html';
        try {
          var ref = document.referrer ? new URL(document.referrer) : null;
          var blocked = ref && /\/(?:login|signup|naver-callback)\.html$/.test(ref.pathname);
          var different = ref && (ref.pathname + ref.search !== location.pathname + location.search);
          location.href = ref && ref.origin === location.origin && different && !blocked ? ref.href : fallback;
        } catch (_) { location.href = fallback; }
      }, true);
    });
  }
  if (document.readyState !== 'loading') initNavigation();
  else document.addEventListener('DOMContentLoaded', initNavigation);
})();

/* ============================================================
   온종일 체험단 — PWA (앱 설치 + 업데이트 배너)
   모든 페이지에서 이 스크립트 한 줄만 넣으면 동작.
   경로 자동 계산(루트/pages/user·admin 어디서든).
   ============================================================ */
(function () {
  // 현재 위치 기준 루트까지의 상대 경로
  var depth = (location.pathname.split('/').filter(Boolean).length);
  // file:// 나 서브폴더 배포 대비: pages/xxx/ 면 ../../, 루트면 ./
  var inPages = location.pathname.indexOf('/pages/') >= 0;
  var root = inPages ? '../../' : './';

  // manifest / 아이콘 링크 주입
  function link(rel, href, extra) {
    var l = document.createElement('link'); l.rel = rel; l.href = href;
    if (extra) for (var k in extra) l.setAttribute(k, extra[k]);
    document.head.appendChild(l);
  }
  link('manifest', root + 'manifest.webmanifest');
  link('apple-touch-icon', root + 'assets/icons/onmi-180.png');
  link('icon', root + 'assets/icons/favicon.png', { type: 'image/png' });
  var meta = document.createElement('meta'); meta.name = 'theme-color'; meta.content = '#EC3A66'; document.head.appendChild(meta);

  // ---- 배너 UI ----
  function banner(html) {
    var b = document.createElement('div');
    b.className = 'pwa-banner';
    b.innerHTML = html;
    document.body.appendChild(b);
    if (!document.getElementById('pwa-banner-style')) {
      var s = document.createElement('style'); s.id = 'pwa-banner-style';
      s.textContent = '.pwa-banner{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:9999;'
        + 'display:flex;align-items:center;gap:12px;background:#fff;color:#2A241F;border:1px solid #ECE5D8;'
        + 'box-shadow:0 12px 34px rgba(60,42,20,.18);border-radius:16px;padding:12px 14px;max-width:calc(100vw - 32px);'
        + 'font-family:Pretendard,-apple-system,sans-serif;animation:pwaUp .35s cubic-bezier(.2,.8,.3,1);}'
        + '@keyframes pwaUp{from{opacity:0;transform:translate(-50%,16px)}to{opacity:1;transform:translate(-50%,0)}}'
        + '.pwa-banner img{width:40px;height:40px;border-radius:10px;flex-shrink:0}'
        + '.pwa-banner .pb-txt{font-size:13px;line-height:1.35;font-weight:600}'
        + '.pwa-banner .pb-txt small{display:block;color:#877E72;font-weight:500;font-size:12px;margin-top:1px}'
        + '.pwa-banner .pb-btn{background:linear-gradient(135deg,#EE3E6D,#F4743B);color:#fff;border:none;font-weight:700;'
        + 'font-size:13px;padding:9px 16px;border-radius:999px;cursor:pointer;white-space:nowrap}'
        + '.pwa-banner .pb-x{background:none;border:none;color:#aaa;font-size:20px;cursor:pointer;padding:0 4px;line-height:1}';
      document.head.appendChild(s);
    }
    return b;
  }

  // ---- 앱 설치 유도 ----
  var deferred = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); deferred = e;
    if (localStorage.getItem('onjongil-install-dismiss')) return;
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    var b = banner(
      '<img src="' + root + 'assets/icons/onmi-192.png" alt="온미">'
      + '<div class="pb-txt">온종일 체험단 앱 설치<small>온미를 홈 화면에 추가하고 빠르게 이용해요</small></div>'
      + '<button class="pb-btn" id="pwaInstall">설치</button>'
      + '<button class="pb-x" id="pwaClose">&times;</button>'
    );
    b.querySelector('#pwaInstall').onclick = function () {
      b.remove(); if (deferred) { deferred.prompt(); deferred = null; }
    };
    b.querySelector('#pwaClose').onclick = function () {
      b.remove(); localStorage.setItem('onjongil-install-dismiss', '1');
    };
  });

  // ---- Service Worker 등록 + 업데이트 배너 ----
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register(root + 'sw.js').then(function (reg) {
      // 새 버전 감지
      reg.addEventListener('updatefound', function () {
        var nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', function () {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdate(reg);
          }
        });
      });
    });
    var refreshed = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (refreshed) return; refreshed = true; location.reload();
    });
  }

  function showUpdate(reg) {
    var b = banner(
      '<img src="' + root + 'assets/icons/onmi-192.png" alt="온미">'
      + '<div class="pb-txt">새로운 업데이트가 있어요!<small>눌러서 최신 버전으로 새로고침</small></div>'
      + '<button class="pb-btn" id="pwaUpdate">업데이트</button>'
      + '<button class="pb-x" id="pwaUpX">&times;</button>'
    );
    b.querySelector('#pwaUpdate').onclick = function () {
      b.remove();
      if (reg.waiting) reg.waiting.postMessage('skipWaiting');
      else location.reload();
    };
    b.querySelector('#pwaUpX').onclick = function () { b.remove(); };
  }
})();

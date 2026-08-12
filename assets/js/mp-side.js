/* 온종일 체험단 — 마이페이지 사이드바 아코디언
   대분류(.mp-sec-t) 클릭 → 소분류(.mp-link) 펼침/접힘. 현재 페이지 섹션은 자동 펼침. */
(function () {
  var CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
  function init() {
    var secs = document.querySelectorAll('.mp-side .mp-sec');
    secs.forEach(function (sec) {
      var t = sec.querySelector('.mp-sec-t');
      if (!t || t.dataset.acc) return;
      t.dataset.acc = '1';
      var chev = document.createElement('span');
      chev.className = 'mp-chev';
      chev.innerHTML = CHEV;
      t.appendChild(chev);
      var hasActive = !!sec.querySelector('.mp-link.active');
      var key = 'onjongil-mp-' + (t.textContent || '').replace(/\s+/g, '').slice(0, 12);
      var saved = null; try { saved = localStorage.getItem(key); } catch (e) {}
      var open = (saved === null) ? hasActive : (saved === '1');
      sec.classList.toggle('mp-collapsed', !open);
      t.addEventListener('click', function (e) {
        if (e.target.closest('.mp-mini')) return; // 포인트 배지 링크는 이동 허용
        var willOpen = sec.classList.contains('mp-collapsed');
        sec.classList.toggle('mp-collapsed', !willOpen);
        try { localStorage.setItem(key, willOpen ? '1' : '0'); } catch (e2) {}
      });
    });
  }
  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();

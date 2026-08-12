/* 온종일 체험단 — 회원 광고 팝업
   - 관리자 등록 팝업(활성+기간)을 방문 시 노출
   - "일주일 동안 보지 않기" 체크 후 닫기 → 그 기기에서 7일간 절대 안 뜸
   - 그냥 "닫기" → 다음 방문에 다시 뜸
   OnAuth(supabase) 로드 후 사용 */
(function () {
  if (!window.OnAuth || !OnAuth.activePopups) return;
  function esc(x) { return (x == null ? '' : String(x)).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function hidden(id) {
    try { var t = localStorage.getItem('onjongil_popup_hide_' + id); return t && parseInt(t, 10) > Date.now(); } catch (e) { return false; }
  }
  function injectCSS() {
    if (document.getElementById('ojp-css')) return;
    var st = document.createElement('style'); st.id = 'ojp-css';
    st.textContent = '.ojp-ov{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:20px;animation:ojpin .25s;}'
      + '@keyframes ojpin{from{opacity:0}to{opacity:1}}'
      + '.ojp-card{background:#fff;border-radius:20px;max-width:360px;width:100%;overflow:hidden;box-shadow:0 24px 70px rgba(0,0,0,.45);animation:ojpup .3s cubic-bezier(.2,.8,.2,1);}'
      + '@keyframes ojpup{from{transform:translateY(22px) scale(.96);opacity:0}to{transform:none;opacity:1}}'
      + '.ojp-img{width:100%;display:block;}.ojp-imglink{display:block;}'
      + '.ojp-content{padding:20px 22px 6px;text-align:center;}'
      + '.ojp-emoji{font-size:38px;margin-bottom:6px;line-height:1;}'
      + '.ojp-title{font-size:19px;font-weight:800;color:#1a1a1a;margin-bottom:8px;line-height:1.32;}'
      + '.ojp-body{font-size:14px;color:#555;line-height:1.6;white-space:pre-line;}'
      + '.ojp-cta{display:inline-block;margin-top:14px;background:linear-gradient(135deg,#EE3E6D,#F4743B);color:#fff;font-weight:700;font-size:14px;padding:11px 24px;border-radius:50px;text-decoration:none;}'
      + '.ojp-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 18px;border-top:1px solid #eee;margin-top:14px;}'
      + '.ojp-chk{display:flex;align-items:center;gap:7px;font-size:13px;color:#888;cursor:pointer;user-select:none;}'
      + '.ojp-chk input{width:16px;height:16px;}'
      + '.ojp-close{background:none;border:none;color:#888;font-size:14px;font-weight:700;cursor:pointer;padding:6px 12px;border-radius:8px;}'
      + '.ojp-close:hover{background:#f3f3f3;color:#333;}';
    document.head.appendChild(st);
  }
  function build(pp) {
    injectCSS();
    var ov = document.createElement('div'); ov.className = 'ojp-ov';
    var img = pp.image_url ? '<img class="ojp-img" src="' + esc(pp.image_url) + '" alt="">' : '';
    if (pp.image_url && pp.link_url) img = '<a class="ojp-imglink" href="' + esc(pp.link_url) + '">' + img + '</a>';
    var html = '<div class="ojp-card">' + img + '<div class="ojp-content">';
    if (pp.emoji) html += '<div class="ojp-emoji">' + esc(pp.emoji) + '</div>';
    if (pp.title) html += '<div class="ojp-title">' + esc(pp.title) + '</div>';
    if (pp.body) html += '<div class="ojp-body">' + esc(pp.body) + '</div>';
    if (pp.link_url) html += '<a class="ojp-cta" href="' + esc(pp.link_url) + '">자세히 보기</a>';
    html += '</div><div class="ojp-foot"><label class="ojp-chk"><input type="checkbox" class="ojp-week"> 일주일 동안 보지 않기</label>'
      + '<button class="ojp-close">닫기</button></div></div>';
    ov.innerHTML = html;
    document.body.appendChild(ov);
    function close() {
      if (ov.querySelector('.ojp-week').checked) {
        try { localStorage.setItem('onjongil_popup_hide_' + pp.id, String(Date.now() + 7 * 24 * 60 * 60 * 1000)); } catch (e) {}
      }
      ov.remove();
    }
    ov.querySelector('.ojp-close').addEventListener('click', close);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
  }
  async function run() {
    var list = []; try { list = await OnAuth.activePopups(); } catch (e) { return; }
    for (var i = 0; i < list.length; i++) { if (!hidden(list[i].id)) { build(list[i]); break; } }
  }
  if (document.readyState !== 'loading') run(); else document.addEventListener('DOMContentLoaded', run);
})();

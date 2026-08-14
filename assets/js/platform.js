/* 온종일 체험단 — 전 페이지 공통 성장/운영 레이어 */
(function () {
  'use strict';
  var KEY = 'onjongil-platform-v1';
  function read() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (_) { return {}; } }
  function write(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (_) {} }
  function list(name) { var s = read(); return Array.isArray(s[name]) ? s[name] : []; }
  function setList(name, value) { var s = read(); s[name] = value; write(s); return value; }
  function toggle(name, id) {
    var a = list(name), i = a.indexOf(String(id));
    if (i < 0) a.unshift(String(id)); else a.splice(i, 1);
    setList(name, a.slice(0, 100)); return i < 0;
  }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function campaignIdFrom(href) { try { return new URL(href, location.href).searchParams.get('id'); } catch (_) { return ''; } }
  function toast(message) {
    var old = document.getElementById('ocToast'); if (old) old.remove();
    var el = document.createElement('div'); el.id = 'ocToast'; el.className = 'oc-toast'; el.textContent = message;
    document.body.appendChild(el); requestAnimationFrame(function () { el.classList.add('show'); });
    setTimeout(function () { el.classList.remove('show'); setTimeout(function () { el.remove(); }, 250); }, 1800);
  }
  function enhanceCampaignCards() {
    document.querySelectorAll('a[href*="campaign-detail.html?id="]').forEach(function (card) {
      if (card.dataset.ocEnhanced) return; card.dataset.ocEnhanced = '1';
      var id = campaignIdFrom(card.href); if (!id) return;
      var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'oc-wish';
      btn.setAttribute('aria-label', '캠페인 찜하기'); btn.textContent = list('wishlist').indexOf(id) >= 0 ? '♥' : '♡';
      btn.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); var on = toggle('wishlist', id); btn.textContent = on ? '♥' : '♡'; toast(on ? '찜한 캠페인에 저장했어요.' : '찜에서 삭제했어요.'); if(window.OnAuth){OnAuth.toggleFavorite(id,on).catch(function(){});OnAuth.trackCampaignEvent(id,'favorite',{on:on}).catch(function(){});} });
      card.style.position = 'relative'; card.appendChild(btn);
      var slots = card.querySelector('.camp-slots');
      if (slots) { var m = slots.textContent.match(/(\d+)\s*\/\s*(\d+)/); if (m && +m[2]) { var rate = Math.round(+m[1] / +m[2] * 10) / 10; var b = document.createElement('span'); b.className = 'oc-rate'; b.textContent = rate + ':1'; b.title = '현재 경쟁률'; slots.parentNode.insertBefore(b, slots); } }
    });
  }
  function observeCards() { enhanceCampaignCards(); var mo = new MutationObserver(enhanceCampaignCards); mo.observe(document.body, {childList:true, subtree:true}); }
  function detailTools() {
    if (!/campaign-detail\.html$/.test(location.pathname)) return;
    var id = new URLSearchParams(location.search).get('id'); if (!id) return;
    var recent = list('recent').filter(function (x) { return x !== id; }); recent.unshift(id); setList('recent', recent.slice(0, 20));
    if(window.OnAuth) OnAuth.trackCampaignEvent(id,'detail_view',{path:location.pathname}).catch(function(){});
    var apply = document.getElementById('applyBtn'); if (!apply || document.getElementById('ocDetailTools')) return;
    var box = document.createElement('div'); box.id = 'ocDetailTools'; box.className = 'oc-detail-tools';
    box.innerHTML = '<button type="button" id="ocWishDetail"></button><button type="button" id="ocCalendar">📅 일정 저장</button><button type="button" id="ocShare">↗ 공유</button>';
    apply.parentNode.insertBefore(box, apply);
    function paint() { box.querySelector('#ocWishDetail').textContent = list('wishlist').indexOf(id) >= 0 ? '♥ 찜 완료' : '♡ 찜하기'; } paint();
    box.querySelector('#ocWishDetail').onclick = function () { var on=toggle('wishlist', id); paint(); if(window.OnAuth){OnAuth.toggleFavorite(id,on).catch(function(){});OnAuth.trackCampaignEvent(id,'favorite',{on:on}).catch(function(){});} };
    box.querySelector('#ocShare').onclick = async function () { try { if (navigator.share) await navigator.share({title:document.title,url:location.href}); else { await navigator.clipboard.writeText(location.href); toast('링크를 복사했어요.'); } } catch (_) {} };
    box.querySelector('#ocCalendar').onclick = function () {
      var title = (document.getElementById('dTitle') || {}).textContent || '온종일 체험단';
      var d = (document.getElementById('dDday') || {}).dataset.deadline || '';
      var dt = d ? d.replace(/-/g, '') : new Date().toISOString().slice(0,10).replace(/-/g,'');
      location.href = 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(title + ' 마감') + '&dates=' + dt + '/' + dt + '&details=' + encodeURIComponent(location.href);
    };
  }
  function addGlobalSearch() {
    if (document.getElementById('ocSearch') || /login|signup|reset|callback/.test(location.pathname)) return;
    var nav = document.querySelector('.nav-links, .admin-topbar, .mp-title'); if (!nav) return;
    var wrap = document.createElement('form'); wrap.id = 'ocSearch'; wrap.className = 'oc-search';
    wrap.innerHTML = '<input aria-label="캠페인 통합 검색" placeholder="캠페인 검색" autocomplete="off"><button aria-label="검색">⌕</button>';
    wrap.onsubmit = function (e) { e.preventDefault(); var q = wrap.querySelector('input').value.trim(); if (!q) return; var base = location.pathname.indexOf('/pages/') >= 0 ? 'campaigns.html' : 'pages/user/campaigns.html'; location.href = base + '?q=' + encodeURIComponent(q); };
    nav.appendChild(wrap);
  }
  function installErrorBoundary() {
    window.addEventListener('unhandledrejection', function (e) { console.error('[온종일 체험단]', e.reason); });
    document.querySelectorAll('img:not([loading])').forEach(function (img) { if (!img.closest('.logo')) img.loading = 'lazy'; });
  }
  function adminCommandCenter() {
    if (location.pathname.indexOf('/pages/admin/') < 0 || document.getElementById('ocAdminCmd')) return;
    var main = document.querySelector('.admin-main, main'); if (!main) return;
    var bar = document.createElement('div'); bar.id = 'ocAdminCmd'; bar.className = 'oc-admin-cmd';
    bar.innerHTML = '<strong>🎯 운영 작업함</strong><span>마감·승인·검수·정산을 한 흐름으로 관리하세요.</span><a href="admin-review.html">검수 대기</a><a href="admin-advertisers.html">광고주 승인</a><a href="admin-settlements.html">정산 대기</a><a href="admin-inquiries.html">문의 처리</a>';
    main.insertBefore(bar, main.firstChild);
    if(window.OnAuth) OnAuth.adminWorkQueue().then(function(q){if(!q)return;var links=bar.querySelectorAll('a');var vals=[q.review_check,q.advertisers,q.withdrawals,q.inquiries];links.forEach(function(a,i){if(Number(vals[i])>0)a.innerHTML+=' <b>'+vals[i]+'</b>';});}).catch(function(){});
  }
  async function reviewerTaskBoard() {
    if (!/mypage\.html$/.test(location.pathname) || !window.OnAuth) return;
    var main=document.querySelector('.mp-main'), anchor=main&&main.querySelector('.mp-card'); if(!anchor)return;
    var box=document.createElement('section');box.className='mp-card oc-task-board';box.innerHTML='<h2>오늘 해야 할 일</h2><div class="oc-task-list">불러오는 중…</div>';anchor.parentNode.insertBefore(box,anchor);
    try { var apps=await OnAuth.myApplications(), tasks=[]; (apps||[]).forEach(function(a){var c=a.campaigns||{};if(a.status==='selected')tasks.push({tone:'hot',title:c.title,body:'방문 일정을 확인하고 리뷰를 준비하세요.',link:'#selected'});if(a.status==='reviewing')tasks.push({tone:'warn',title:c.title,body:'제출한 리뷰가 검수 중입니다.',link:'#reviewed'});});
      box.querySelector('.oc-task-list').innerHTML=tasks.length?tasks.slice(0,6).map(function(t){return '<a href="'+t.link+'" class="oc-task '+t.tone+'"><b>'+esc(t.title)+'</b><span>'+esc(t.body)+'</span><i>→</i></a>';}).join(''):'<div class="oc-task-empty">✅ 지금 급한 일정이 없어요. 맞춤 캠페인을 둘러보세요.</div>';
    } catch(_){box.querySelector('.oc-task-list').textContent='일정을 불러오지 못했어요.';}
  }
  async function advertiserReport() {
    if (!/advertiser-dashboard\.html$/.test(location.pathname) || !window.OnAuth) return;
    var app=document.getElementById('adv-app');if(!app)return;
    var section=document.createElement('section');section.className='oc-report';section.innerHTML='<div class="oc-report-head"><div><b>실시간 성과 리포트</b><span>모집부터 리뷰 완료까지 한눈에 확인하세요.</span></div><button type="button" onclick="window.print()">PDF 저장</button></div><div class="oc-report-grid" id="ocReportGrid"><div>불러오는 중…</div></div>';app.insertBefore(section,app.firstChild);
    try{var report=await OnAuth.advertiserPerformance();if(!report)throw new Error('report');var views=Number(report.views||0),apply=Number(report.applications||0),capacity=Number(report.capacity||0),conv=views?Math.round(apply/views*1000)/10:0;
      document.getElementById('ocReportGrid').innerHTML=[['진행 캠페인',Number(report.active||0)+'개'],['상세 조회',views.toLocaleString()],['총 신청',apply.toLocaleString()],['신청 전환율',conv+'%'],['모집 달성률',capacity?Math.round(apply/capacity*100)+'%':'0%'],['선정',Number(report.selected||0).toLocaleString()],['완료 리뷰',Number(report.reviews||0).toLocaleString()],['공유',Number(report.shares||0).toLocaleString()]].map(function(x){return '<div class="oc-metric"><span>'+x[0]+'</span><strong>'+x[1]+'</strong></div>';}).join('');
    }catch(_){document.getElementById('ocReportGrid').innerHTML='<div>성과 데이터를 불러오지 못했어요.</div>';}
  }
  function snsChannelManager(){if(!/sns\.html$/.test(location.pathname)||document.getElementById('ocChannelManager'))return;var main=document.querySelector('.mp-main');if(!main)return;var s=document.createElement('section');s.id='ocChannelManager';s.className='mp-card';s.innerHTML='<h2 style="margin-bottom:6px;">검증된 크리에이터 프로필</h2><p style="color:var(--text-muted);font-size:13px;margin-bottom:14px;">캠페인에 사용할 채널과 공개 범위를 등록하면 맞춤 선정에 활용됩니다.</p><div class="oc-channel-form"><select id="ocChPlatform"><option>네이버 블로그</option><option>인스타그램</option><option>유튜브</option><option>틱톡</option><option>네이버 클립</option></select><input id="ocChUrl" type="url" placeholder="https:// 채널 주소"><input id="ocChTopics" placeholder="관심 주제: 맛집, 뷰티"><button id="ocChSave" type="button">채널 저장</button></div><div id="ocChList"></div>';main.insertBefore(s,main.firstChild);var draw=async function(){var rows=await OnAuth.myChannels();document.getElementById('ocChList').innerHTML=rows.length?rows.map(function(r){return '<div class="oc-channel"><b>'+esc(r.platform)+'</b><a href="'+esc(r.url)+'" target="_blank" rel="noopener">'+esc(r.url)+'</a><span>'+(r.verified_at?'✓ 인증':'인증 대기')+'</span></div>';}).join(''):'';};s.querySelector('#ocChSave').onclick=async function(){var url=s.querySelector('#ocChUrl').value.trim();if(!/^https:\/\//.test(url)){toast('https://로 시작하는 주소를 입력하세요.');return;}var r=await OnAuth.saveChannel({platform:s.querySelector('#ocChPlatform').value,url:url,topics:s.querySelector('#ocChTopics').value.split(',').map(function(x){return x.trim();}).filter(Boolean)});if(r.error)toast('DB 확장 적용 후 저장할 수 있어요.');else{toast('채널을 저장했어요.');draw();}};draw();}
  async function syncCloudState(){if(!window.OnAuth)return;try{var u=await OnAuth.getUser();if(!u)return;var remote=await OnAuth.myFavorites();if(remote.length){setList('wishlist',Array.from(new Set(remote.concat(list('wishlist')))));enhanceCampaignCards();}}catch(_){}}
  window.OnPlatform = { wishlist:function(){return list('wishlist');}, recent:function(){return list('recent');}, toggleWishlist:function(id){return toggle('wishlist',id);}, saveFilters:function(v){var s=read();s.filters=v;write(s);}, filters:function(){return read().filters||{};}, toast:toast, esc:esc, enhanceCampaignCards:enhanceCampaignCards };
  function boot() { observeCards(); detailTools(); addGlobalSearch(); installErrorBoundary(); adminCommandCenter(); reviewerTaskBoard(); advertiserReport(); snsChannelManager(); syncCloudState(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();

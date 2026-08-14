/* ============================================================
   온종일 체험단 — 공용 인증 (Supabase)
   CDN의 supabase-js v2 로드 후 이 파일 사용
   ============================================================ */
(function () {
  var SUPABASE_URL = 'https://vjoqbisnatsugbrtqloh.supabase.co';
  // 네이버 로그인 (Client ID는 authorize URL에 노출되는 공개값 — 시크릿은 서버함수에만 있음)
  var NAVER_CLIENT_ID = 'ymmWLZfSG3VCZFRYNM7F';
  var NAVER_CALLBACK = 'https://vjoqbisnatsugbrtqloh.supabase.co/functions/v1/naver-auth';
  var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqb3FiaXNuYXRzdWdicnRxbG9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1MTQ5MDEsImV4cCI6MjEwMjA5MDkwMX0.Rli0tyr4gHd3vKnoxxZspkE2SZlDIsYtx-PxRBKBr6s';

  if (!window.supabase || !window.supabase.createClient) {
    console.error('[auth] supabase-js 가 로드되지 않았습니다. CDN 스크립트를 먼저 넣어주세요.');
    return;
  }
  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'onjongil-auth' }
  });
  window.sb = sb;

  // 기존 캠페인 중 대표 이미지가 모두 sushi로 저장된 데이터를 화면에서
  // 카테고리/영상 채널에 맞게 보정한다. 관리자가 직접 고른 다른 이미지는 유지한다.
  var CATEGORY_IMAGES = {
    '맛집': 'hanwoo', '식당': 'hanwoo', '카페': 'cafe', '디저트': 'dessert',
    '뷰티': 'skincare', '뷰티·헤어': 'skincare', '피트니스': 'fitness',
    '숙박': 'stay', '숙소': 'stay', '여행': 'oceanview', '반려동물': 'pet',
    '육아': 'baby', '패션': 'fashion', '생활용품': 'living', '디지털': 'digital',
    '건강': 'health', '도서': 'book', '여가활동': 'leisure', '자기관리': 'selfcare',
    '배송형': 'delivery', '방문형': 'visit', '원고형': 'manuscript',
    '릴스형': 'reels', '클립형': 'clip'
  };
  function campaignImageKey(c) {
    c = c || {};
    var channel = String(c.channel || '').toLowerCase();
    var category = String(c.category || '');
    var imageKey = String(c.image_key || '').trim();
    var title = String(c.title || '');
    // 관리자가 지정한 주제별 이미지를 채널 공통 커버보다 우선한다.
    // 실제 스시 캠페인의 sushi 이미지는 유지하고, 잘못 저장된 sushi만 보정한다.
    if (imageKey && imageKey !== 'sushi') return imageKey;
    if (imageKey === 'sushi' && /(스시|초밥|오마카세)/.test(title)) return 'sushi';
    if (channel.indexOf('릴스') >= 0 || channel.indexOf('reels') >= 0 || category === '릴스형') return 'reels';
    if (channel.indexOf('클립') >= 0 || channel.indexOf('clip') >= 0 || category === '클립형') return 'clip';
    return CATEGORY_IMAGES[category] || imageKey || 'visit';
  }
  function normalizeCampaign(c) {
    if (c) c.image_key = campaignImageKey(c);
    return c;
  }
  var expansionCampaignsPromise;
  function loadExpansionCampaigns() {
    if (!expansionCampaignsPromise) {
      expansionCampaignsPromise = fetch('/supabase/seed_campaigns_expansion_20260814.json', { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(function (rows) {
          return (rows || []).map(function (c, i) {
            c.id = 'expansion-20260814-' + (i + 1);
            c.created_at = c.created_at || '2026-08-14T04:30:00+00:00';
            return normalizeCampaign(c);
          });
        }).catch(function () { return []; });
    }
    return expansionCampaignsPromise;
  }

  var Auth = {
    client: sb,

    // 회원가입: 성공 시 즉시 로그인(이메일 확인 off)
    signUp: async function (email, password, meta) {
      var res = await sb.auth.signUp({
        email: email, password: password,
        options: { data: meta || {} }
      });
      return res; // { data, error }
    },

    signIn: async function (email, password) {
      return await sb.auth.signInWithPassword({ email: email, password: password });
    },

    // 네이버 로그인 시작: 네이버 authorize 로 이동 (서버함수 콜백이 세션 발급)
    startNaverLogin: function () {
      var state = Math.random().toString(36).slice(2) + Date.now().toString(36);
      try { sessionStorage.setItem('naver_state', state); } catch (e) {}
      var u = 'https://nid.naver.com/oauth2.0/authorize?response_type=code'
        + '&client_id=' + encodeURIComponent(NAVER_CLIENT_ID)
        + '&redirect_uri=' + encodeURIComponent(NAVER_CALLBACK)
        + '&state=' + encodeURIComponent(state);
      location.href = u;
      return false;
    },

    // 비밀번호 재설정 메일 발송
    resetPassword: async function (email) {
      var redirect = location.origin + location.pathname.replace(/[^\/]+$/, 'reset.html');
      return await sb.auth.resetPasswordForEmail(email, { redirectTo: redirect });
    },

    // 로그인 후 새 비번으로 변경(재설정 링크로 진입한 상태)
    updatePassword: async function (newPw) {
      return await sb.auth.updateUser({ password: newPw });
    },

    // 이메일 찾기: 이름+전화 → 마스킹된 이메일 (서버 함수 find_email)
    findEmail: async function (name, phone) {
      return await sb.rpc('find_email', { p_name: name, p_phone: (phone || '').replace(/[^0-9]/g, '') });
    },

    // 내 프로필 조회
    getProfile: async function () {
      var u = await Auth.getUser(); if (!u) return null;
      var r = await sb.from('profiles').select('*').eq('id', u.id).single();
      return r.data || null;
    },

    // 관리자 전용 페이지 보호: admin 아니면 관리자 로그인으로
    requireAdmin: async function () {
      var u = await Auth.getUser();
      if (!u) { location.href = 'admin-login.html'; return null; }
      var p = await Auth.getProfile();
      if (!p || p.role !== 'admin') { location.href = 'admin-login.html'; return null; }
      return p;
    },

    // 전체 회원 목록 (관리자만 RLS 통과)
    listMembers: async function () {
      return await sb.from('profiles').select('*').neq('role', 'admin').order('created_at', { ascending: false });
    },

    // 총 회원 수
    memberCount: async function () {
      var r = await sb.rpc('member_count');
      return (r && !r.error) ? r.data : null;
    },

    // 내 프로필 수정
    updateProfile: async function (fields) {
      var u = await Auth.getUser(); if (!u) return { error: { message: '로그인이 필요합니다.' } };
      return await sb.from('profiles').update(fields).eq('id', u.id);
    },

    // ── 캠페인 ──────────────────────────────────────────
    // 모집중 캠페인 목록 (HOT 먼저, 마감 임박순)
    listCampaigns: async function () {
      var r = await sb.from('campaigns').select('*')
        .eq('status', 'active')
        .order('is_hot', { ascending: false })
        .order('deadline', { ascending: true });
      if (r && !r.error) {
        (r.data || []).forEach(normalizeCampaign);
        var extra = await loadExpansionCampaigns();
        var titles = {};
        (r.data || []).forEach(function (c) { titles[c.title] = true; });
        r.data = (r.data || []).concat(extra.filter(function (c) { return !titles[c.title]; }));
      }
      return r;
    },
    getCampaign: async function (id) {
      if (String(id || '').indexOf('expansion-20260814-') === 0) {
        var extra = await loadExpansionCampaigns();
        return extra.filter(function (c) { return c.id === id; })[0] || null;
      }
      var r = await sb.from('campaigns').select('*').eq('id', id).single();
      return normalizeCampaign(r.data || null);
    },
    // 캠페인 신청 (서버 검증: 로그인/중복/마감/정원)
    applyCampaign: async function (id) {
      var r = await sb.rpc('apply_campaign', { p_campaign: id });
      if (r.error) return { ok: false, msg: r.error.message };
      return r.data; // { ok, msg }
    },
    applyCampaignDetailed: async function (id, detail) {
      var r=await sb.rpc('apply_campaign_detailed',{p_campaign:id,p_detail:detail||{}});
      if(r.error)return {ok:false,msg:r.error.message}; return r.data;
    },
    // 내가 이 캠페인에 신청했는지
    myApplicationFor: async function (id) {
      var u = await Auth.getUser(); if (!u) return null;
      var r = await sb.from('applications').select('*').eq('campaign_id', id).eq('user_id', u.id).maybeSingle();
      return r.data || null;
    },
    // 내 신청 목록 (+ 캠페인 정보 조인)
    myApplications: async function () {
      var u = await Auth.getUser(); if (!u) return [];
      var r = await sb.from('applications').select('*, campaigns(*)')
        .eq('user_id', u.id).order('created_at', { ascending: false });
      var rows = (r && !r.error) ? (r.data || []) : [];
      rows.forEach(function (x) { if (x.campaigns) normalizeCampaign(x.campaigns); });
      return rows;
    },
    // 손님: 리뷰 URL 제출 (선정된 캠페인) — 단순 저장(폴백)
    submitReview: async function (appId, url) {
      var r = await sb.rpc('submit_review_url', { p_app: appId, p_url: url });
      if (r.error) return { ok: false, msg: r.error.message };
      return r.data;
    },
    // 손님: 리뷰 자동 판정 (Edge Function이 본문 검사)
    checkReview: async function (appId, url, keyword) {
      var sess = await sb.auth.getSession();
      var token = sess && sess.data && sess.data.session ? sess.data.session.access_token : SUPABASE_ANON;
      try {
        var res = await fetch(SUPABASE_URL + '/functions/v1/review-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'apikey': SUPABASE_ANON },
          body: JSON.stringify({ app_id: appId, url: url, keyword: keyword || '' })
        });
        return await res.json();
      } catch (e) { return { ok: false, msg: '네트워크 오류: ' + e.message }; }
    },
    // 손님: 이의신청(재검토 요청)
    submitAppeal: async function (appId, text) {
      var r = await sb.rpc('submit_appeal', { p_app: appId, p_text: text });
      if (r.error) return { ok: false, msg: r.error.message };
      return r.data;
    },
    // 관리자: 이의신청 승인/거절
    resolveAppeal: async function (appId, approve) {
      var r = await sb.rpc('resolve_appeal', { p_app: appId, p_approve: !!approve });
      if (r.error) return { ok: false, msg: r.error.message };
      return r.data;
    },

    // ── 포인트 출금(정산) ────────────────────────────────
    // 손님: 출금 신청
    requestWithdraw: async function (amount, bank, account, holder) {
      var r = await sb.rpc('request_withdraw', { p_amount: amount, p_bank: bank || '', p_account: account || '', p_holder: holder || '' });
      if (r.error) return { ok: false, msg: r.error.message };
      return r.data;
    },
    // 손님: 내 출금 신청 내역
    myWithdrawals: async function () {
      var u = await Auth.getUser(); if (!u) return [];
      var r = await sb.from('withdrawal_requests').select('*').eq('user_id', u.id).order('created_at', { ascending: false });
      return (r && !r.error) ? (r.data || []) : [];
    },
    // 관리자: 출금 신청 전체(+신청자 정보)
    adminListWithdrawals: async function () {
      var r = await sb.rpc('admin_list_withdrawals');
      return (r && !r.error) ? (r.data || []) : [];
    },
    // 관리자: 출금 지급/거절
    processWithdraw: async function (id, action, note) {
      var r = await sb.rpc('process_withdraw', { p_id: id, p_action: action, p_note: note || '' });
      if (r.error) return { ok: false, msg: r.error.message };
      return r.data;
    },

    // ── 통계 리포트 ──────────────────────────────────────
    adminReport: async function () {
      var r = await sb.rpc('admin_report');
      return (r && !r.error) ? r.data : null;
    },

    // ── 시스템 설정 ──────────────────────────────────────
    // 공개 설정 전체(key→value map)
    getSettings: async function () {
      var r = await sb.from('app_settings').select('key,value');
      var m = {};
      if (r && !r.error) (r.data || []).forEach(function (x) { m[x.key] = x.value; });
      return m;
    },
    // 관리자: 설정 저장(객체 전달, 여러 key 한 번에)
    adminSaveSettings: async function (obj) {
      var r = await sb.rpc('admin_save_settings', { p: obj });
      if (r.error) return { ok: false, msg: r.error.message };
      return r.data;
    },

    // ── 1:1 문의 ────────────────────────────────────────
    // 문의 제출(비로그인 포함)
    submitInquiry: async function (type, title, content, name, email) {
      var r = await sb.rpc('submit_inquiry', { p_type: type || '기타', p_title: title || '', p_content: content || '', p_name: name || '', p_email: email || '' });
      if (r.error) return { ok: false, msg: r.error.message };
      return r.data;
    },
    // 손님: 내 문의 내역(답변 포함)
    myInquiries: async function () {
      var u = await Auth.getUser(); if (!u) return [];
      var r = await sb.from('inquiries').select('*').eq('user_id', u.id).order('created_at', { ascending: false });
      return (r && !r.error) ? (r.data || []) : [];
    },
    // 관리자: 문의 전체
    adminListInquiries: async function () {
      var r = await sb.rpc('admin_list_inquiries');
      return (r && !r.error) ? (r.data || []) : [];
    },
    // 관리자: 답변 등록
    answerInquiry: async function (id, answer) {
      var r = await sb.rpc('answer_inquiry', { p_id: id, p_answer: answer || '' });
      if (r.error) return { ok: false, msg: r.error.message };
      return r.data;
    },
    // 관리자: 문의 삭제
    deleteInquiry: async function (id) {
      var r = await sb.rpc('delete_inquiry', { p_id: id });
      if (r.error) return { ok: false, msg: r.error.message };
      return r.data;
    },

    // ── 포인트 ──────────────────────────────────────────
    myPointTx: async function () {
      var u = await Auth.getUser(); if (!u) return [];
      var r = await sb.from('point_transactions').select('*')
        .eq('user_id', u.id).order('created_at', { ascending: false });
      return (r && !r.error) ? (r.data || []) : [];
    },

    // ── 메시지/알림 피드 ─────────────────────────────────
    // 별도 테이블 없이 내 실데이터(신청·문의·출금)에서 알림을 파생해 시간순으로 정렬
    myMessages: async function () {
      var u = await Auth.getUser(); if (!u) return [];
      var out = [];
      try {
        var apps = await Auth.myApplications();
        (apps || []).forEach(function (a) {
          var c = a.campaigns || {};
          var name = c.title || '캠페인';
          var ts = new Date(a.created_at || Date.now()).getTime();
          if (a.status === 'selected') {
            out.push({ cat: '선정', ts: ts, title: '[' + name + '] 캠페인에 선정되셨어요!', desc: '축하드려요 :) 방문 일정을 확인하고 리뷰를 준비해 주세요.' });
          } else if (a.status === 'reviewing') {
            var d = c.complete_days ? ('선정일로부터 ' + c.complete_days + '일 안에 방문·리뷰까지 완료해 주세요.') : '리뷰 작성 기간입니다.';
            out.push({ cat: '일정', ts: ts, title: '[' + name + '] 리뷰 작성을 요청드려요', desc: '당첨되신 캠페인의 리뷰 작성 기간입니다. ' + d });
          } else if (a.status === 'completed') {
            var rp = c.reward_points ? (' ' + Number(c.reward_points).toLocaleString() + 'P가 적립되었어요.') : '';
            out.push({ cat: '선정', ts: ts, title: '[' + name + '] 리뷰 검수가 완료됐어요', desc: '리뷰가 승인되었습니다.' + rp + ' 참여해 주셔서 감사합니다!' });
          } else if (a.status === 'rejected') {
            out.push({ cat: '기타', ts: ts, title: '[' + name + '] 아쉽게 이번엔 선정되지 않았어요', desc: '다음 기회에 다시 도전해 주세요. 더 좋은 캠페인으로 찾아뵐게요.' });
          } else if (a.status === 'applied') {
            out.push({ cat: '기타', ts: ts, title: '[' + name + '] 신청이 접수되었어요', desc: '선정 결과를 기다려 주세요. 결과는 이 메시지함으로 안내드려요.' });
          }
        });
      } catch (e) {}
      try {
        var inqs = await Auth.myInquiries();
        (inqs || []).forEach(function (q) {
          if (q.status === 'answered') {
            var ts = new Date(q.answered_at || q.created_at || Date.now()).getTime();
            out.push({ cat: '기타', ts: ts, title: '문의하신 "' + (q.title || '1:1 문의') + '"에 답변이 등록됐어요', desc: q.answer ? String(q.answer).slice(0, 60) : '1:1 문의하기에서 답변을 확인해 주세요.' });
          }
        });
      } catch (e) {}
      try {
        var wds = await Auth.myWithdrawals();
        (wds || []).forEach(function (w) {
          var ts = new Date(w.updated_at || w.created_at || Date.now()).getTime();
          var amt = Number(w.amount || 0).toLocaleString();
          if (w.status === 'paid') out.push({ cat: '기타', ts: ts, title: '포인트 출금이 완료됐어요', desc: amt + 'P 출금 신청이 지급 처리되었습니다.' });
          else if (w.status === 'rejected') out.push({ cat: '기타', ts: ts, title: '포인트 출금 신청이 반려됐어요', desc: (w.note ? w.note : amt + 'P 출금 신청이 반려되었습니다. 계좌 정보를 확인해 주세요.') });
        });
      } catch (e) {}
      out.sort(function (a, b) { return b.ts - a.ts; });
      return out;
    },

    // ── 관리자 ──────────────────────────────────────────
    grantPoints: async function (userId, amount, title, kind) {
      var r = await sb.rpc('grant_points', { p_user: userId, p_amount: amount, p_title: title || '관리자 지급', p_kind: kind || 'admin' });
      if (r.error) return { ok: false, msg: r.error.message };
      return r.data;
    },
    setAppStatus: async function (appId, status) {
      var r = await sb.rpc('set_application_status', { p_app: appId, p_status: status });
      if (r.error) return { ok: false, msg: r.error.message };
      return r.data;
    },
    listAllApplications: async function () {
      // applications↔profiles FK가 없어 조인 대신 각각 조회 후 결합
      var appRes = await sb.from('applications')
        .select('*, campaigns(title,region,reward_text,reward_points,image_key)')
        .order('created_at', { ascending: false });
      if (appRes.error) return appRes;
      var rows = appRes.data || [];
      var ids = [];
      rows.forEach(function (a) { if (a.user_id && ids.indexOf(a.user_id) < 0) ids.push(a.user_id); });
      var pmap = {};
      if (ids.length) {
        var pr = await sb.from('profiles').select('id,name,email,phone').in('id', ids);
        (pr.data || []).forEach(function (p) { pmap[p.id] = p; });
      }
      rows.forEach(function (a) { a.profiles = pmap[a.user_id] || {}; });
      return { data: rows, error: null };
    },
    // 특정 회원의 신청/포인트 (관리자 RLS 통과)
    memberApplications: async function (userId) {
      var r = await sb.from('applications').select('*, campaigns(title,reward_text,region)')
        .eq('user_id', userId).order('created_at', { ascending: false });
      return (r && !r.error) ? (r.data || []) : [];
    },
    memberPointTx: async function (userId) {
      var r = await sb.from('point_transactions').select('*')
        .eq('user_id', userId).order('created_at', { ascending: false }).limit(50);
      return (r && !r.error) ? (r.data || []) : [];
    },
    setSuspended: async function (userId, on) {
      var r = await sb.rpc('set_member_suspended', { p_user: userId, p_suspend: !!on });
      if (r.error) return { ok: false, msg: r.error.message };
      return r.data;
    },
    // 관리자: 회원 완전 삭제
    deleteMember: async function (userId) {
      var r = await sb.rpc('delete_member', { p_user: userId });
      if (r.error) return { ok: false, msg: r.error.message };
      return r.data;
    },
    // 관리자: 대시보드 통계
    adminStats: async function () {
      var r = await sb.rpc('admin_stats');
      if (r.error) return { ok: false, msg: r.error.message };
      return r.data;
    },
    // 관리자: 최근 캠페인 N개
    recentCampaigns: async function (n) {
      var r = await sb.from('campaigns').select('title,store_name,region,status')
        .order('created_at', { ascending: false }).limit(n || 5);
      return (r && !r.error) ? (r.data || []) : [];
    },

    // ── 관리자: 캠페인 CRUD (RLS가 admin만 통과) ──
    adminListCampaigns: async function () {
      return await sb.from('campaigns').select('*').order('created_at', { ascending: false });
    },
    createCampaign: async function (fields) {
      return await sb.from('campaigns').insert(fields).select().single();
    },
    updateCampaign: async function (id, fields) {
      return await sb.from('campaigns').update(fields).eq('id', id).select().single();
    },
    deleteCampaign: async function (id) {
      return await sb.from('campaigns').delete().eq('id', id);
    },

    // ── 광고 팝업 ──
    // 공개: 지금 노출할 활성 팝업 (RLS가 기간/활성 필터)
    activePopups: async function () {
      var r = await sb.from('popups').select('*').order('created_at', { ascending: false });
      return (r && !r.error) ? (r.data || []) : [];
    },
    // 관리자: 전체 팝업
    adminListPopups: async function () {
      return await sb.from('popups').select('*').order('created_at', { ascending: false });
    },
    createPopup: async function (fields) {
      return await sb.from('popups').insert(fields).select().single();
    },
    updatePopup: async function (id, fields) {
      return await sb.from('popups').update(fields).eq('id', id).select().single();
    },
    deletePopup: async function (id) {
      return await sb.from('popups').delete().eq('id', id);
    },
    // 관리자: 팝업 이미지 업로드 → 공개 URL 반환
    uploadPopupImage: async function (file) {
      var ext = (file.name.split('.').pop() || 'png').toLowerCase();
      var path = 'popup_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.' + ext;
      var up = await sb.storage.from('popups').upload(path, file, { cacheControl: '3600', upsert: false });
      if (up.error) return { error: up.error };
      var pub = sb.storage.from('popups').getPublicUrl(path);
      return { url: pub.data.publicUrl };
    },

    // ── 광고 슬라이드 (메인 캐러셀 카드) ──
    activeSlides: async function () {
      var r = await sb.from('ad_slides').select('*').eq('is_active', true)
        .order('sort_order', { ascending: true }).order('created_at', { ascending: false });
      var rows = (r && !r.error) ? (r.data || []) : [];
      var today = new Date().toISOString().slice(0, 10);
      return rows.filter(function (s) {
        return (!s.start_at || s.start_at <= today) && (!s.end_at || s.end_at >= today);
      });
    },
    adminListSlides: async function () {
      return await sb.from('ad_slides').select('*')
        .order('sort_order', { ascending: true }).order('created_at', { ascending: false });
    },
    createSlide: async function (fields) { return await sb.from('ad_slides').insert(fields).select().single(); },
    updateSlide: async function (id, fields) { return await sb.from('ad_slides').update(fields).eq('id', id).select().single(); },
    deleteSlide: async function (id) { return await sb.from('ad_slides').delete().eq('id', id); },

    // ── 광고주 ──────────────────────────────────────────
    // 로그인된 사용자를 광고주로 등록/승격 (RPC가 role='advertiser' 세팅)
    registerAdvertiser: async function (biz, category, region, phone) {
      var r = await sb.rpc('register_advertiser', {
        p_biz: biz || '', p_category: category || '', p_region: region || '',
        p_phone: (phone || '').replace(/[^0-9]/g, '')
      });
      if (r.error) return { ok: false, msg: r.error.message };
      return r.data; // { ok, approved }
    },
    // 광고주 전용 페이지 보호: 광고주 아니면 로그인으로. 관리자는 미리보기 허용(is_preview=true). 반환값에 approved 포함
    requireAdvertiser: async function () {
      var u = await Auth.getUser();
      if (!u) { location.href = 'login.html?next=advertiser-dashboard.html'; return null; }
      var p = await Auth.getProfile();
      if (!p || (p.role !== 'advertiser' && p.role !== 'admin')) {
        alert('광고주 계정으로 로그인해주세요.');
        location.href = 'login.html';
        return null;
      }
      if (p.suspended) { await sb.auth.signOut(); alert('이용이 정지된 계정입니다.'); location.href = 'login.html'; return null; }
      if (p.role === 'admin') { p.is_preview = true; p.approved = true; } // 관리자 미리보기 모드
      return p; // { ...profile, approved, biz_name, is_preview, ... }
    },
    // 관리자: 광고주 목록 (+캠페인/신청 집계)
    adminListAdvertisers: async function () {
      var r = await sb.rpc('admin_list_advertisers');
      return (r && !r.error) ? (r.data || []) : [];
    },
    // 관리자: 특정 광고주가 소유한 캠페인 (admin RLS 통과)
    adminAdvertiserCampaigns: async function (advId) {
      var r = await sb.from('campaigns').select('*').eq('owner_id', advId).order('created_at', { ascending: false });
      return (r && !r.error) ? (r.data || []) : [];
    },
    // 관리자: 광고주 승인/취소
    setAdvertiserApproved: async function (userId, ok) {
      var r = await sb.rpc('set_advertiser_approved', { p_user: userId, p_ok: !!ok });
      if (r.error) return { ok: false, msg: r.error.message };
      return r.data;
    },

    // 광고주: 내 캠페인 목록 (owner_id = 본인, RLS 통과)
    advMyCampaigns: async function () {
      var u = await Auth.getUser(); if (!u) return [];
      var r = await sb.from('campaigns').select('*').eq('owner_id', u.id).order('created_at', { ascending: false });
      return (r && !r.error) ? (r.data || []) : [];
    },
    // 광고주: 캠페인 등록 (owner_id 자동 = 본인)
    advCreateCampaign: async function (fields) {
      var u = await Auth.getUser(); if (!u) return { error: { message: '로그인이 필요합니다.' } };
      fields = fields || {}; fields.owner_id = u.id;
      return await sb.from('campaigns').insert(fields).select().single();
    },
    advUpdateCampaign: async function (id, fields) {
      var u = await Auth.getUser(); if (!u) return { error: { message: '로그인이 필요합니다.' } };
      return await sb.from('campaigns').update(fields).eq('id', id).eq('owner_id', u.id).select().single();
    },
    advDeleteCampaign: async function (id) {
      var u = await Auth.getUser(); if (!u) return { error: { message: '로그인이 필요합니다.' } };
      return await sb.from('campaigns').delete().eq('id', id).eq('owner_id', u.id);
    },
    // 광고주: 특정 캠페인 신청자 목록 (+프로필 결합, 본인 캠페인만 RPC가 검증)
    advApplicants: async function (campaignId) {
      var r = await sb.rpc('advertiser_campaign_applicants', { p_campaign: campaignId });
      return (r && !r.error) ? (r.data || []) : [];
    },
    advApplicationDetails: async function (campaignId) {
      var r=await sb.rpc('advertiser_application_details',{p_campaign:campaignId});
      return (r&&!r.error)?(r.data||[]):[];
    },
    advSchedules: async function (campaignId) {
      var r=await sb.rpc('advertiser_campaign_schedules',{p_campaign:campaignId}); return (r&&!r.error)?(r.data||[]):[];
    },
    advConfirmSchedule: async function (scheduleId, ok, startsAt) {
      var r=await sb.rpc('advertiser_confirm_schedule',{p_schedule:scheduleId,p_confirm:!!ok,p_starts_at:startsAt||null});
      if(r.error)return {ok:false,msg:r.error.message};return r.data;
    },
    // 광고주: 신청 선정/탈락/대기 (selected/rejected/applied) · 리뷰 승인/보완 (completed/reviewing)
    advSelect: async function (appId, status) {
      var r = await sb.rpc('advertiser_select', { p_app: appId, p_status: status });
      if (r.error) return { ok: false, msg: r.error.message };
      return r.data;
    },
    // 캠페인 이미지 업로드 → 공개 URL
    uploadCampaignImage: async function (file) {
      var ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      var path = 'camp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.' + ext;
      var up = await sb.storage.from('campaigns').upload(path, file, { cacheControl: '3600', upsert: false });
      if (up.error) return { error: up.error };
      var pub = sb.storage.from('campaigns').getPublicUrl(path);
      return { url: pub.data.publicUrl };
    },

    // ── 운영 OS 확장 기능 ──────────────────────────────
    // 확장 스키마가 아직 적용되지 않은 운영 환경에서는 error를 반환하고
    // 화면의 localStorage 폴백이 계속 동작하도록 한다.
    toggleFavorite: async function (campaignId, on) {
      var u = await Auth.getUser(); if (!u) return { error: { message: '로그인이 필요합니다.' } };
      if (on) return await sb.from('campaign_favorites').upsert({ user_id: u.id, campaign_id: campaignId });
      return await sb.from('campaign_favorites').delete().eq('user_id', u.id).eq('campaign_id', campaignId);
    },
    myFavorites: async function () {
      var u = await Auth.getUser(); if (!u) return [];
      var r = await sb.from('campaign_favorites').select('campaign_id').eq('user_id', u.id).order('created_at', { ascending: false });
      return (r && !r.error) ? (r.data || []).map(function (x) { return String(x.campaign_id); }) : [];
    },
    saveSearch: async function (name, filters) {
      var u = await Auth.getUser(); if (!u) return { error: { message: '로그인이 필요합니다.' } };
      return await sb.from('saved_searches').insert({ user_id:u.id, name:name||'맞춤 체험단', filters:filters||{} }).select().single();
    },
    listNotifications: async function () {
      var u = await Auth.getUser(); if (!u) return [];
      var r = await sb.from('notifications').select('*').eq('user_id',u.id).order('created_at',{ascending:false}).limit(100);
      return (r && !r.error) ? (r.data || []) : [];
    },
    markNotificationRead: async function (id) {
      var u = await Auth.getUser(); if (!u) return;
      return await sb.from('notifications').update({read_at:new Date().toISOString()}).eq('id',id).eq('user_id',u.id);
    },
    trackCampaignEvent: async function (campaignId, eventType, metadata) {
      if (!campaignId || String(campaignId).indexOf('expansion-') === 0) return { ok:true, local:true };
      var r = await sb.rpc('track_campaign_event',{p_campaign:campaignId,p_event:eventType,p_meta:metadata||{}});
      return r.error ? {ok:false,msg:r.error.message} : {ok:!!r.data};
    },
    myChannels: async function () {
      var u=await Auth.getUser(); if(!u)return [];
      var r=await sb.from('reviewer_channels').select('*').eq('user_id',u.id).order('created_at',{ascending:false});
      return (r&&!r.error)?(r.data||[]):[];
    },
    saveChannel: async function (fields) {
      var u=await Auth.getUser(); if(!u)return {error:{message:'로그인이 필요합니다.'}};
      fields=fields||{}; fields.user_id=u.id; return await sb.from('reviewer_channels').upsert(fields).select().single();
    },
    requestSchedule: async function (applicationId, startsAt, note) {
      var u=await Auth.getUser(); if(!u)return {error:{message:'로그인이 필요합니다.'}};
      return await sb.from('campaign_schedules').insert({application_id:applicationId,user_id:u.id,starts_at:startsAt,note:note||''}).select().single();
    },
    advertiserPerformance: async function () {
      var r=await sb.rpc('advertiser_performance_report'); return (r&&!r.error)?r.data:null;
    },
    adminWorkQueue: async function () {
      var r=await sb.rpc('admin_work_queue'); return (r&&!r.error)?r.data:null;
    },
    reviewerReputation: async function () {
      var r=await sb.rpc('reviewer_reputation',{}); return (r&&!r.error)?r.data:null;
    },

    signOut: async function () {
      await sb.auth.signOut();
      location.href = resolve('index.html', true);
    },

    getUser: async function () {
      var r = await sb.auth.getUser();
      return (r && r.data) ? r.data.user : null;
    },

    // 로그인 필요한 페이지 보호: 미로그인 시 로그인 페이지로, 정지 회원은 로그아웃
    requireAuth: async function () {
      var u = await Auth.getUser();
      if (!u) {
        var next = encodeURIComponent(location.pathname.split('/').pop());
        location.href = 'login.html?next=' + next;
        return null;
      }
      try {
        var p = await Auth.getProfile();
        if (p && p.suspended) {
          await sb.auth.signOut();
          alert('이용이 정지된 계정입니다. 고객센터로 문의해주세요.');
          location.href = 'login.html';
          return null;
        }
      } catch (e) {}
      return u;
    },

    // 헤더의 로그인/가입 vs 아바타 상태 갱신
    reflectHeader: async function () {
      var u = await Auth.getUser();
      var loginBtns = document.querySelectorAll('[data-auth="guest"]');
      var userBtns = document.querySelectorAll('[data-auth="user"]');
      loginBtns.forEach(function (el) { el.style.display = u ? 'none' : ''; });
      userBtns.forEach(function (el) { el.style.display = u ? '' : 'none'; });
      // 닉네임 표시
      if (u) {
        var nm = (u.user_metadata && (u.user_metadata.nickname || u.user_metadata.name)) || u.email.split('@')[0];
        document.querySelectorAll('[data-user-name]').forEach(function (el) { el.textContent = nm; });
      }
      return u;
    }
  };

  function resolve(path, fromUserPage) {
    // pages/user/*.html 기준 상대경로 보정
    return fromUserPage ? '../../' + path : path;
  }

  // 헤더 알림벨 배지: 선정되어 리뷰 작성이 필요한 신청 개수 (없으면 숨김)
  Auth.refreshNotifBadge = async function () {
    var el = document.getElementById('hNotifBadge');
    if (!el) return;
    try {
      var u = await Auth.getUser();
      if (!u) { el.style.display = 'none'; return; }
      var apps = await Auth.myApplications();
      var n = (apps || []).filter(function (a) { return a.status === 'selected'; }).length;
      if (n > 0) { el.textContent = n > 99 ? '99+' : String(n); el.style.display = el.getAttribute('data-disp') || ''; }
      else { el.style.display = 'none'; }
    } catch (e) { el.style.display = 'none'; }
  };
  if (document.readyState !== 'loading') Auth.refreshNotifBadge();
  else document.addEventListener('DOMContentLoaded', function () { Auth.refreshNotifBadge(); });

  // 사이드바 '나의 메시지' 안읽음 배지 (.mp-cnt): 마지막으로 메시지함을 본 시각 이후에 생긴 알림 개수
  var MSG_SEEN_KEY = 'onjongil-msg-seen';
  Auth.getMsgSeen = function () { try { return parseInt(localStorage.getItem(MSG_SEEN_KEY) || '0', 10) || 0; } catch (e) { return 0; } };
  Auth.markMsgSeen = function () { try { localStorage.setItem(MSG_SEEN_KEY, String(Date.now())); } catch (e) {} };
  Auth.refreshMsgCount = async function () {
    var els = document.querySelectorAll('.mp-cnt');
    if (!els.length) return;
    var n = 0;
    try {
      var u = await Auth.getUser();
      if (u) {
        var msgs = await Auth.myMessages();
        var seen = Auth.getMsgSeen();
        n = (msgs || []).filter(function (m) { return m.ts > seen; }).length;
      }
    } catch (e) { n = 0; }
    els.forEach(function (el) {
      if (n > 0) { el.textContent = n > 99 ? '99+' : String(n); el.style.display = ''; }
      else { el.style.display = 'none'; }
    });
  };
  if (document.readyState !== 'loading') Auth.refreshMsgCount();
  else document.addEventListener('DOMContentLoaded', function () { Auth.refreshMsgCount(); });

  window.OnAuth = Auth;
})();

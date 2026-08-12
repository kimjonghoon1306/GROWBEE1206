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
      return await sb.from('campaigns').select('*')
        .eq('status', 'active')
        .order('is_hot', { ascending: false })
        .order('deadline', { ascending: true });
    },
    getCampaign: async function (id) {
      var r = await sb.from('campaigns').select('*').eq('id', id).single();
      return r.data || null;
    },
    // 캠페인 신청 (서버 검증: 로그인/중복/마감/정원)
    applyCampaign: async function (id) {
      var r = await sb.rpc('apply_campaign', { p_campaign: id });
      if (r.error) return { ok: false, msg: r.error.message };
      return r.data; // { ok, msg }
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
      return (r && !r.error) ? (r.data || []) : [];
    },

    // ── 포인트 ──────────────────────────────────────────
    myPointTx: async function () {
      var u = await Auth.getUser(); if (!u) return [];
      var r = await sb.from('point_transactions').select('*')
        .eq('user_id', u.id).order('created_at', { ascending: false });
      return (r && !r.error) ? (r.data || []) : [];
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
      return await sb.from('applications').select('*, campaigns(title), profiles(name,email)')
        .order('created_at', { ascending: false });
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

  window.OnAuth = Auth;
})();

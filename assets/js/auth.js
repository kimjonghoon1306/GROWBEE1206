/* ============================================================
   온종일 체험단 — 공용 인증 (Supabase)
   CDN의 supabase-js v2 로드 후 이 파일 사용
   ============================================================ */
(function () {
  var SUPABASE_URL = 'https://vjoqbisnatsugbrtqloh.supabase.co';
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

    signOut: async function () {
      await sb.auth.signOut();
      location.href = resolve('index.html', true);
    },

    getUser: async function () {
      var r = await sb.auth.getUser();
      return (r && r.data) ? r.data.user : null;
    },

    // 로그인 필요한 페이지 보호: 미로그인 시 로그인 페이지로
    requireAuth: async function () {
      var u = await Auth.getUser();
      if (!u) {
        var next = encodeURIComponent(location.pathname.split('/').pop());
        location.href = 'login.html?next=' + next;
        return null;
      }
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

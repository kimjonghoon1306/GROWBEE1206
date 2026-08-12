// 온종일 체험단 — 네이버 로그인 콜백 (Supabase Edge Function)
// 흐름: 프론트 네이버버튼 → 네이버 authorize → (여기)code수신 → 토큰교환 → 프로필조회
//       → 회원 find-or-create → 매직링크로 세션 발급 → naver-callback.html 로 리다이렉트
// 비밀값은 전부 Supabase Function Secrets 에서 읽음 (코드/깃에 노출 없음).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!            // Supabase 자동주입
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')! // Supabase 자동주입
const NAVER_ID = Deno.env.get('NAVER_CLIENT_ID') ?? ''
const NAVER_SECRET = Deno.env.get('NAVER_CLIENT_SECRET') ?? ''
const SITE = Deno.env.get('SITE_URL') ?? 'https://pick.xn--zk5biyyw.com'
const LOGIN = SITE + '/pages/user/login.html'
const CB = SITE + '/pages/user/naver-callback.html'

function fail(reason: string) {
  return Response.redirect(LOGIN + '?err=' + encodeURIComponent(reason), 302)
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state') ?? ''
    if (!code) return fail('naver_no_code')

    // 1) 인가코드 → 네이버 액세스 토큰
    const tRes = await fetch('https://nid.naver.com/oauth2.0/token?' + new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: NAVER_ID, client_secret: NAVER_SECRET, code, state,
    }))
    const tok = await tRes.json()
    if (!tok.access_token) return fail('naver_token')

    // 2) 네이버 프로필
    const pRes = await fetch('https://openapi.naver.com/v1/nid/me', {
      headers: { Authorization: 'Bearer ' + tok.access_token },
    })
    const prof = (await pRes.json())?.response
    const email: string | undefined = prof?.email
    if (!email) return fail('naver_email')
    const name = prof?.name || prof?.nickname || email.split('@')[0]
    const nickname = prof?.nickname || name

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // 3) 신규면 회원 생성(트리거가 profiles 자동생성), 기존이면 email_exists 무시
    await admin.auth.admin.createUser({
      email, email_confirm: true,
      user_metadata: { name, nickname, provider: 'naver' },
    })

    // 4) 매직링크 발급 → 그 링크로 302 (Supabase가 세션 심고 콜백페이지 해시로 토큰 전달)
    const { data: link, error: lErr } = await admin.auth.admin.generateLink({
      type: 'magiclink', email,
      options: { redirectTo: CB },
    })
    if (lErr || !link?.properties?.action_link) return fail('naver_link')
    return Response.redirect(link.properties.action_link, 302)
  } catch (_e) {
    return fail('naver_exc')
  }
})

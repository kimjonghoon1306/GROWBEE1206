// 온종일 체험단 — 리뷰 자동 판정 (Supabase Edge Function)
// 손님이 낸 블로그 URL 본문을 서버가 읽어 미션 충족 여부를 검사한다.
// 요청: POST { app_id, url }  (Authorization: 로그인 유저 토큰)
// 처리: 캠페인 규칙 조회 → 본문 fetch → 글자수/이미지/영상/키워드/배너 카운트
//       → applications.auto_result/auto_passed 저장, 통과 시 status='reviewing'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

// 네이버 블로그는 모바일 주소가 본문을 그대로 담고 있어 잘 읽힘
function toReadableUrl(u: string): string {
  try {
    const url = new URL(u)
    if (url.hostname === 'blog.naver.com') {
      url.hostname = 'm.blog.naver.com'
      return url.toString()
    }
    return u
  } catch { return u }
}

async function fetchBody(u: string): Promise<string> {
  const res = await fetch(toReadableUrl(u), {
    headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile Safari/604.1' },
    redirect: 'follow',
  })
  let html = await res.text()
  // 네이버: 본문이 iframe(mainFrame) 안에 있으면 그 주소를 한 번 더 가져온다
  const m = html.match(/<iframe[^>]+id=["']?mainFrame["']?[^>]*src=["']([^"']+)["']/i)
  if (m) {
    let src = m[1]
    if (src.startsWith('/')) src = 'https://blog.naver.com' + src
    try { html += '\n' + await (await fetch(toReadableUrl(src), { headers: { 'User-Agent': 'Mozilla/5.0' } })).text() } catch { /* noop */ }
  }
  return html
}

function analyze(html: string, rule: any, keyword: string) {
  const imgCount = (html.match(/<img\b/gi) || []).length
  // 영상: iframe(유튜브/네이버tv) + video 태그 + se-video 모듈
  const videoCount =
    (html.match(/youtube\.com\/embed|youtu\.be|player\.vimeo|tv\.naver|se-module-video|<video\b/gi) || []).length
  // 텍스트만 추출(태그/스크립트/스타일 제거)
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const charCount = text.replace(/\s/g, '').length // 공백 제외 글자수
  // 키워드: 띄어쓰기까지 동일하게 반복 횟수
  let kwCount = 0
  if (keyword) {
    const safe = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    kwCount = (text.match(new RegExp(safe, 'g')) || []).length
  }
  const hasBanner = /review_banner\.png|온종일\s*체험단/i.test(html)

  const need = {
    chars: rule.min_chars ?? 1000,
    images: rule.min_images ?? 15,
    videos: rule.min_videos ?? 2,
    keyword: rule.keyword_min ?? 5,
    banner: rule.require_banner !== false,
  }
  const checks = {
    chars: { need: need.chars, got: charCount, ok: charCount >= need.chars },
    images: { need: need.images, got: imgCount, ok: imgCount >= need.images },
    videos: { need: need.videos, got: videoCount, ok: videoCount >= need.videos },
    keyword: { word: keyword, need: need.keyword, got: kwCount, ok: !keyword || kwCount >= need.keyword },
    banner: { need: need.banner, got: hasBanner, ok: !need.banner || hasBanner },
  }
  const passed = Object.values(checks).every((c: any) => c.ok)
  return { passed, checks, readable: charCount > 50 }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ ok: false, msg: 'POST only' }, 405)
  try {
    const { app_id, url, keyword } = await req.json()
    if (!app_id || !url) return json({ ok: false, msg: 'app_id, url 필요' }, 400)

    const auth = req.headers.get('Authorization') || ''
    const asUser = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } })
    const { data: ures } = await asUser.auth.getUser()
    const uid = ures?.user?.id
    if (!uid) return json({ ok: false, msg: '로그인이 필요합니다.' }, 401)

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })
    const { data: app } = await admin.from('applications').select('*, campaigns(*)').eq('id', app_id).single()
    if (!app || app.user_id !== uid) return json({ ok: false, msg: '본인 신청만 가능합니다.' }, 403)
    if (!['selected', 'reviewing'].includes(app.status)) return json({ ok: false, msg: '선정된 캠페인만 리뷰를 제출할 수 있습니다.' }, 400)

    const rule = app.campaigns || {}
    let html = ''
    try { html = await fetchBody(url) } catch { /* noop */ }
    const result = analyze(html, rule, keyword || '')

    const patch: any = {
      review_url: url,
      auto_result: { ...result, checked_at: new Date().toISOString(), keyword },
      auto_passed: result.passed,
    }
    // 통과 시 리뷰 접수(reviewing). 실패해도 URL은 저장하되 status는 그대로.
    if (result.passed) patch.status = 'reviewing'
    await admin.from('applications').update(patch).eq('id', app_id)

    return json({ ok: true, passed: result.passed, readable: result.readable, checks: result.checks })
  } catch (e) {
    return json({ ok: false, msg: '검사 중 오류: ' + (e as Error).message }, 500)
  }
})

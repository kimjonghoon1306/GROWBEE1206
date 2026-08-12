// 온종일 체험단 — 리뷰 자동 판정 (Supabase Edge Function)
// rank-checker(kimjonghoon1306/rank-checker)의 검증된 방식 이식:
//  · 본문: 네이버 RSS + 모바일/PostView 다중 시도로 글 HTML 확보
//  · 순위: 네이버 공식 검색 API(openapi.naver.com/v1/search/blog.json)
// 요청: POST { app_id, url, keyword }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const NAVER_ID = Deno.env.get('NAVER_SEARCH_ID') ?? ''
const NAVER_SECRET = Deno.env.get('NAVER_SEARCH_SECRET') ?? ''

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

const PC_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'

// URL에서 blogId, logNo 추출
function parseNaver(u: string): { blogId?: string; logNo?: string } {
  try {
    const url = new URL(u)
    const qp = url.searchParams
    if (qp.get('blogId')) return { blogId: qp.get('blogId')!, logNo: qp.get('logNo') || undefined }
    // /blogId/logNo  또는 /blogId
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length >= 2 && /^\d{8,}$/.test(parts[1])) return { blogId: parts[0], logNo: parts[1] }
    if (parts.length >= 1) return { blogId: parts[0] }
    return {}
  } catch { return {} }
}

// 글 HTML 확보: 모바일 → PostView(신) → PostView(구) → 직접 URL
async function fetchPostHtml(blogId: string, logNo: string, rawUrl: string): Promise<string> {
  const attempts = [
    { url: `https://m.blog.naver.com/${blogId}/${logNo}`, ua: MOBILE_UA },
    { url: `https://blog.naver.com/PostView.naver?blogId=${blogId}&logNo=${logNo}&isHttpsRedirect=true`, ua: PC_UA },
    { url: `https://blog.naver.com/PostView.nhn?blogId=${blogId}&logNo=${logNo}&redirect=Dlog&widgetTypeCall=true`, ua: PC_UA },
    { url: rawUrl, ua: MOBILE_UA },
  ]
  for (const a of attempts) {
    try {
      const res = await fetch(a.url, { headers: { 'User-Agent': a.ua, 'Accept-Language': 'ko-KR,ko;q=0.9', Referer: `https://blog.naver.com/${blogId}` } })
      const html = await res.text()
      if (html && html.length > 3000 && /se-|post|blog/i.test(html)) return html
    } catch { /* next */ }
  }
  return ''
}

// RSS로 해당 글의 description(요약 본문) 확보 — 본문 HTML 실패 시 보조
async function fetchRssItem(blogId: string, logNo: string): Promise<string> {
  try {
    const res = await fetch(`https://rss.blog.naver.com/${blogId}.xml`, { headers: { 'User-Agent': PC_UA } })
    const xml = await res.text()
    const items = xml.split(/<item>/i)
    for (const it of items) {
      if (logNo && !it.includes(logNo)) continue
      const desc = (it.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || '')
        .replace(/<!\[CDATA\[|\]\]>/g, '')
      const title = (it.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/<!\[CDATA\[|\]\]>/g, '')
      if (desc || title) return title + ' ' + desc
    }
  } catch { /* noop */ }
  return ''
}

function analyze(html: string, rule: any, keyword: string) {
  const imgCount = (html.match(/<img\b/gi) || []).length
  const videoCount = (html.match(/youtube\.com\/embed|youtu\.be|player\.vimeo|tv\.naver|se-module-video|se-video|<video\b/gi) || []).length
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const charCount = text.replace(/\s/g, '').length
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
  const checks: any = {
    chars: { need: need.chars, got: charCount, ok: charCount >= need.chars },
    images: { need: need.images, got: imgCount, ok: imgCount >= need.images },
    videos: { need: need.videos, got: videoCount, ok: videoCount >= need.videos },
    keyword: { word: keyword, need: need.keyword, got: kwCount, ok: !keyword || kwCount >= need.keyword },
    banner: { need: need.banner, got: hasBanner, ok: !need.banner || hasBanner },
  }
  return { checks, charCount, readable: charCount > 50 }
}

// 네이버 검색 API로 키워드 검색 순위 확인
async function checkRank(keyword: string, blogId: string, logNo: string) {
  if (!NAVER_ID || !NAVER_SECRET || !keyword) return { rank: null, found: false, checked: false }
  try {
    const u = 'https://openapi.naver.com/v1/search/blog.json?' + new URLSearchParams({ query: keyword, display: '100', start: '1', sort: 'sim' })
    const res = await fetch(u, { headers: { 'X-Naver-Client-Id': NAVER_ID, 'X-Naver-Client-Secret': NAVER_SECRET } })
    const data = await res.json()
    const items = data.items || []
    for (let i = 0; i < items.length; i++) {
      const link = (items[i].link || '').toLowerCase()
      const bl = (items[i].bloggerlink || '').toLowerCase()
      const sameBlog = bl.includes(blogId.toLowerCase()) || link.includes('blog.naver.com/' + blogId.toLowerCase())
      const samePost = logNo ? link.includes(logNo) : sameBlog
      if (sameBlog && samePost) return { rank: i + 1, found: true, checked: true, total: data.total || 0 }
    }
    return { rank: null, found: false, checked: true, total: data.total || 0 }
  } catch { return { rank: null, found: false, checked: false } }
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
    const { blogId, logNo } = parseNaver(url)

    // 본문 확보
    let html = ''
    if (blogId && logNo) html = await fetchPostHtml(blogId, logNo, url)
    if (!html) { try { html = await (await fetch(url, { headers: { 'User-Agent': MOBILE_UA } })).text() } catch { /* noop */ } }
    let rssText = ''
    if (blogId) rssText = await fetchRssItem(blogId, logNo || '')
    const combined = html + '\n' + rssText

    const kw = keyword || ''
    const a = analyze(combined, rule, kw)

    // 순위 확인
    const rankInfo = (blogId) ? await checkRank(kw, blogId, logNo || '') : { rank: null, found: false, checked: false }
    a.checks.rank = { checked: rankInfo.checked, found: rankInfo.found, rank: rankInfo.rank, ok: !rankInfo.checked || rankInfo.found }

    const passed = Object.values(a.checks).every((c: any) => c.ok)

    const patch: any = {
      review_url: url,
      auto_result: { ...a, rank: rankInfo, checked_at: new Date().toISOString(), keyword: kw, blogId, logNo },
      auto_passed: passed,
    }
    if (passed) patch.status = 'reviewing'
    await admin.from('applications').update(patch).eq('id', app_id)

    return json({ ok: true, passed, readable: a.readable, checks: a.checks, rank: rankInfo })
  } catch (e) {
    return json({ ok: false, msg: '검사 중 오류: ' + (e as Error).message }, 500)
  }
})

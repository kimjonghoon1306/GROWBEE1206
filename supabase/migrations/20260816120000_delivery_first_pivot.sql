-- 배송 퍼스트 피벗: 캠페인 유형(배송/방문/원고)을 category(주제)와 분리된 독립 축으로 승격
-- + 방문형 전역 "곧 출시" 잠금 스위치(app_settings.visit_enabled)
-- 배경: 기존엔 campaigns.category 한 필드에 주제(맛집/뷰티/생활용품…)와
--       유형(배송형/방문형/원고형/릴스형/클립형)이 섞여 "생활용품 × 배송" 조합이 불가능했음.

-- 1) 유형 컬럼 신설 (기본 delivery). 배송·원고 = 활성, visit = 곧 출시 잠금 대상
alter table public.campaigns
  add column if not exists campaign_type text not null default 'delivery'
    check (campaign_type in ('delivery','visit','manuscript'));

-- 2) 기존 데이터 백필 — category에 섞여있던 값에서 유형 추론
--    (2-1) 명시적 유형 카테고리
update public.campaigns set campaign_type='delivery'   where category = '배송형';
update public.campaigns set campaign_type='manuscript' where category = '원고형';
update public.campaigns set campaign_type='visit'      where category = '방문형';
--    (2-2) 방문성 주제(매장 방문이 본질) → visit (곧 출시로 잠김)
update public.campaigns set campaign_type='visit'
  where category in ('맛집','식당','카페','디저트','뷰티','뷰티·헤어','피트니스',
                     '숙박','숙소','여행','여가활동','자기관리');
--    (2-3) 그 외(생활용품·디지털·반려동물·육아·패션·건강·도서·릴스형·클립형·기타)는 기본 delivery 유지

-- 3) 필터/집계 인덱스
create index if not exists idx_campaigns_type_status on public.campaigns(campaign_type, status);

-- 3-1) 리뷰어 기본 배송지 (배송형 신청 마찰 제거 — 가입 시 미리 받아 재사용)
alter table public.profiles
  add column if not exists postal_code    text,
  add column if not exists address        text,
  add column if not exists address_detail text;

-- 4) 방문형 전역 잠금 스위치 (관리자 시스템설정에서 토글). 'false' = 곧 출시(잠금)
insert into public.app_settings(key, value)
values ('visit_enabled', 'false')
on conflict (key) do nothing;
insert into public.app_settings(key, value)
values ('visit_teaser', '지역 리뷰어를 모으는 중이에요. 우리 동네 방문 체험단이 열리면 가장 먼저 알려드릴게요!')
on conflict (key) do nothing;

-- 캠페인 전략·추천 선정·운영 위험 탐지
create table if not exists public.campaign_briefs (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  objective text not null default 'awareness' check(objective in ('awareness','visit','search','shortform','purchase','content')),
  campaign_type text not null default 'visit' check(campaign_type in ('visit','shipping','payback','reporter','shortform','purchase')),
  budget integer not null default 0 check(budget>=0), target_topics text[] not null default '{}', target_region text,
  usage_rights boolean not null default false, usage_days integer not null default 0 check(usage_days between 0 and 3650),
  disclosure_template text not null default '이 콘텐츠는 업체로부터 제품 또는 서비스를 제공받아 작성했습니다.',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.campaign_briefs enable row level security;
do $$ begin create policy "brief owner read" on public.campaign_briefs for select using(auth.uid()=owner_id); exception when duplicate_object then null; end $$;
do $$ begin create policy "brief owner write" on public.campaign_briefs for all using(auth.uid()=owner_id) with check(auth.uid()=owner_id); exception when duplicate_object then null; end $$;

create table if not exists public.risk_flags (
  id uuid primary key default gen_random_uuid(), kind text not null, severity text not null default 'medium',
  user_id uuid references auth.users(id) on delete set null, related_id text, reason text not null,
  evidence jsonb not null default '{}', status text not null default 'open', assigned_to uuid references auth.users(id),
  created_at timestamptz not null default now(), resolved_at timestamptz
);
alter table public.risk_flags enable row level security;

create or replace function public.upsert_campaign_brief(p_campaign uuid,p_brief jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid();
begin
  if not exists(select 1 from campaigns where id=p_campaign and owner_id=uid) then raise exception '캠페인 소유자만 수정할 수 있습니다.'; end if;
  insert into campaign_briefs(campaign_id,owner_id,objective,campaign_type,budget,target_topics,target_region,usage_rights,usage_days,disclosure_template)
  values(p_campaign,uid,coalesce(p_brief->>'objective','awareness'),coalesce(p_brief->>'campaign_type','visit'),greatest(0,coalesce((p_brief->>'budget')::integer,0)),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_brief->'target_topics','[]'))),'{}'),nullif(p_brief->>'target_region',''),
    coalesce((p_brief->>'usage_rights')::boolean,false),greatest(0,least(3650,coalesce((p_brief->>'usage_days')::integer,0))),coalesce(nullif(p_brief->>'disclosure_template',''),'이 콘텐츠는 업체로부터 제품 또는 서비스를 제공받아 작성했습니다.'))
  on conflict(campaign_id) do update set objective=excluded.objective,campaign_type=excluded.campaign_type,budget=excluded.budget,
    target_topics=excluded.target_topics,target_region=excluded.target_region,usage_rights=excluded.usage_rights,usage_days=excluded.usage_days,
    disclosure_template=excluded.disclosure_template,updated_at=now();
  return jsonb_build_object('ok',true);
end $$;
grant execute on function public.upsert_campaign_brief(uuid,jsonb) to authenticated;

create or replace function public.get_campaign_brief(p_campaign uuid) returns jsonb
language sql security definer set search_path=public stable as $$
  select coalesce((select to_jsonb(b)-'owner_id' from campaign_briefs b join campaigns c on c.id=b.campaign_id
    where b.campaign_id=p_campaign and (c.owner_id=auth.uid() or exists(select 1 from profiles where id=auth.uid() and role='admin'))),'{}'::jsonb)
$$;
grant execute on function public.get_campaign_brief(uuid) to authenticated;

create or replace function public.advertiser_applicant_scores(p_campaign uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from campaigns where id=p_campaign and owner_id=auth.uid())
     and not exists(select 1 from profiles where id=auth.uid() and role='admin') then raise exception '권한이 없습니다.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('application_id',a.id,'score',least(100,
    40 + least(25,(select count(*) from applications x where x.user_id=a.user_id and x.status='completed')*5)
    + case when exists(select 1 from reviewer_channels rc where rc.user_id=a.user_id and rc.verified_at is not null) then 20 else 0 end
    + case when d.message is not null and length(d.message)>=30 then 10 else 0 end
    + case when d.preferred_at is not null then 5 else 0 end),
    'completed',(select count(*) from applications x where x.user_id=a.user_id and x.status='completed'),
    'verified_channel',exists(select 1 from reviewer_channels rc where rc.user_id=a.user_id and rc.verified_at is not null)))
    from applications a left join application_details d on d.application_id=a.id where a.campaign_id=p_campaign),'[]'::jsonb);
end $$;
grant execute on function public.advertiser_applicant_scores(uuid) to authenticated;

create or replace function public.admin_risk_report() returns jsonb
language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from profiles where id=auth.uid() and role='admin') then raise exception '관리자 권한이 필요합니다.'; end if;
  return jsonb_build_object(
    'open_flags',(select count(*) from risk_flags where status='open'),
    'duplicate_phones',(select count(*) from (select phone from profiles where coalesce(phone,'')<>'' group by phone having count(*)>1) q),
    'duplicate_accounts',(select count(*) from (select account from withdrawal_requests where coalesce(account,'')<>'' group by account having count(distinct user_id)>1) q),
    'failed_reviews',(select count(*) from applications where auto_passed=false and status='reviewing'),
    'deleted_reviews',(select count(*) from review_audits where risk in ('deleted','unreachable'))
  );
end $$;
grant execute on function public.admin_risk_report() to authenticated;

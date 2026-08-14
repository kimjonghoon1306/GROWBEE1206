-- 온종일 체험단 운영 OS 1차 스키마 (Supabase SQL Editor에서 1회 실행)
-- 기존 테이블을 변경하지 않고 확장 테이블만 추가한다.
create extension if not exists pgcrypto;

create table if not exists public.campaign_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id,campaign_id)
);
create table if not exists public.saved_searches (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '맞춤 체험단', filters jsonb not null default '{}', notify boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'system', title text not null, body text not null default '', link_url text,
  read_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.reviewer_channels (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null, handle text, url text not null, verified_at timestamptz,
  followers integer not null default 0, avg_views integer not null default 0, engagement numeric(7,2) not null default 0,
  topics text[] not null default '{}', metrics_updated_at timestamptz, is_public boolean not null default true,
  unique(user_id,platform,url)
);
create table if not exists public.campaign_schedules (
  id uuid primary key default gen_random_uuid(), application_id uuid not null references public.applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, kind text not null default 'visit',
  starts_at timestamptz, confirmed_at timestamptz, status text not null default 'requested', note text,
  created_at timestamptz not null default now()
);
create table if not exists public.campaign_events (
  id bigint generated always as identity primary key, campaign_id uuid references public.campaigns(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null, event_type text not null,
  channel text, metadata jsonb not null default '{}', created_at timestamptz not null default now()
);
create index if not exists campaign_events_campaign_time on public.campaign_events(campaign_id,created_at desc);
create table if not exists public.review_audits (
  id uuid primary key default gen_random_uuid(), application_id uuid not null references public.applications(id) on delete cascade,
  checks jsonb not null default '{}', score integer not null default 0, risk text not null default 'review',
  disclosure_ok boolean, duplicate_risk numeric(5,2), checked_at timestamptz not null default now(), checked_by uuid references auth.users(id)
);
create table if not exists public.reputation_events (
  id bigint generated always as identity primary key, user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid references public.applications(id) on delete set null, delta integer not null, reason text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.advertiser_ratings (
  id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.campaigns(id) on delete cascade,
  reviewer_id uuid not null references auth.users(id) on delete cascade, score smallint not null check(score between 1 and 5),
  tags text[] not null default '{}', comment text, created_at timestamptz not null default now(), unique(campaign_id,reviewer_id)
);
create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key, admin_id uuid not null references auth.users(id), action text not null,
  target_type text not null, target_id text, before_data jsonb, after_data jsonb, created_at timestamptz not null default now()
);

alter table public.campaign_favorites enable row level security; alter table public.saved_searches enable row level security;
alter table public.notifications enable row level security; alter table public.reviewer_channels enable row level security;
alter table public.campaign_schedules enable row level security; alter table public.campaign_events enable row level security;
alter table public.review_audits enable row level security; alter table public.reputation_events enable row level security;
alter table public.advertiser_ratings enable row level security; alter table public.admin_audit_log enable row level security;

do $$ begin
  create policy "favorites own" on public.campaign_favorites for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
  create policy "searches own" on public.saved_searches for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
  create policy "notifications own" on public.notifications for select using(auth.uid()=user_id);
  create policy "channels own" on public.reviewer_channels for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
  create policy "schedules own" on public.campaign_schedules for select using(auth.uid()=user_id);
  create policy "events insert" on public.campaign_events for insert with check(auth.uid()=user_id or user_id is null);
  create policy "ratings own" on public.advertiser_ratings for all using(auth.uid()=reviewer_id) with check(auth.uid()=reviewer_id);
exception when duplicate_object then null; end $$;

create or replace function public.track_campaign_event(p_campaign uuid,p_event text,p_meta jsonb default '{}') returns boolean
language plpgsql security definer set search_path=public as $$ begin
  if p_event not in ('impression','detail_view','favorite','apply_start','apply_complete','share','outbound_click') then return false; end if;
  insert into campaign_events(campaign_id,user_id,event_type,metadata) values(p_campaign,auth.uid(),p_event,coalesce(p_meta,'{}'));
  return true;
end $$;
grant execute on function public.track_campaign_event(uuid,text,jsonb) to anon,authenticated;

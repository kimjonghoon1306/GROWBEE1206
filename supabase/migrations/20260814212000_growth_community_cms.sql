-- 성장 루프·커뮤니티·콘텐츠 사용권·CMS
create table if not exists public.missions (
  id uuid primary key default gen_random_uuid(), title text not null, description text not null default '', kind text not null,
  target integer not null default 1, reward_points integer not null default 0, starts_at timestamptz, ends_at timestamptz,
  is_active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.mission_progress (
  mission_id uuid references missions(id) on delete cascade, user_id uuid references auth.users(id) on delete cascade,
  progress integer not null default 0, completed_at timestamptz, claimed_at timestamptz, primary key(mission_id,user_id)
);
create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  category text not null default '노하우', title text not null, body text not null, status text not null default 'published',
  like_count integer not null default 0, comment_count integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.community_comments (
  id uuid primary key default gen_random_uuid(), post_id uuid not null references community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, body text not null, status text not null default 'published', created_at timestamptz not null default now()
);
create table if not exists public.content_licenses (
  id uuid primary key default gen_random_uuid(), application_id uuid not null references applications(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade, advertiser_id uuid not null references auth.users(id) on delete cascade,
  reviewer_id uuid not null references auth.users(id) on delete cascade, review_url text not null, usage_scope text[] not null default '{}',
  starts_at timestamptz not null default now(), ends_at timestamptz, status text not null default 'active', created_at timestamptz not null default now(), unique(application_id)
);
create table if not exists public.cms_content (
  id uuid primary key default gen_random_uuid(), content_type text not null, slug text not null, title text not null,
  body text not null default '', audience text not null default 'all', status text not null default 'draft',
  starts_at timestamptz, ends_at timestamptz, created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(content_type,slug)
);
create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade, in_app boolean not null default true,
  email boolean not null default true, web_push boolean not null default false, marketing boolean not null default false, updated_at timestamptz not null default now()
);

alter table missions enable row level security; alter table mission_progress enable row level security;
alter table community_posts enable row level security; alter table community_comments enable row level security;
alter table content_licenses enable row level security; alter table cms_content enable row level security; alter table notification_preferences enable row level security;
do $$ begin create policy "missions public read" on missions for select using(is_active=true); exception when duplicate_object then null; end $$;
do $$ begin create policy "progress own read" on mission_progress for select using(auth.uid()=user_id); exception when duplicate_object then null; end $$;
do $$ begin create policy "community public read" on community_posts for select using(status='published'); exception when duplicate_object then null; end $$;
do $$ begin create policy "community own write" on community_posts for insert with check(auth.uid()=user_id); exception when duplicate_object then null; end $$;
do $$ begin create policy "community own update" on community_posts for update using(auth.uid()=user_id) with check(auth.uid()=user_id); exception when duplicate_object then null; end $$;
do $$ begin create policy "comments public read" on community_comments for select using(status='published'); exception when duplicate_object then null; end $$;
do $$ begin create policy "comments own write" on community_comments for insert with check(auth.uid()=user_id); exception when duplicate_object then null; end $$;
do $$ begin create policy "licenses participants read" on content_licenses for select using(auth.uid() in (advertiser_id,reviewer_id)); exception when duplicate_object then null; end $$;
do $$ begin create policy "cms published read" on cms_content for select using(status='published' and (starts_at is null or starts_at<=now()) and (ends_at is null or ends_at>=now())); exception when duplicate_object then null; end $$;
do $$ begin create policy "preferences own" on notification_preferences for all using(auth.uid()=user_id) with check(auth.uid()=user_id); exception when duplicate_object then null; end $$;

create or replace function public.my_missions() returns jsonb language sql security definer set search_path=public stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'title',m.title,'description',m.description,'kind',m.kind,'target',m.target,
    'reward_points',m.reward_points,'progress',least(m.target,coalesce(p.progress,0)),'completed',p.completed_at is not null,'claimed',p.claimed_at is not null)
    order by p.completed_at nulls first,m.created_at desc),'[]'::jsonb)
  from missions m left join mission_progress p on p.mission_id=m.id and p.user_id=auth.uid()
  where m.is_active and (m.starts_at is null or m.starts_at<=now()) and (m.ends_at is null or m.ends_at>=now())
$$;
grant execute on function public.my_missions() to authenticated;

create or replace function public.list_community_posts(p_category text default null,p_limit integer default 30) returns jsonb
language sql security definer set search_path=public stable as $$
  select coalesce(jsonb_agg(x order by x.created_at desc),'[]'::jsonb) from (
    select p.id,p.category,p.title,p.body,p.like_count,p.comment_count,p.created_at,coalesce(pr.nickname,pr.name,'회원') author
    from community_posts p left join profiles pr on pr.id=p.user_id where p.status='published' and (p_category is null or p.category=p_category)
    order by p.created_at desc limit least(greatest(p_limit,1),100)) x
$$;
grant execute on function public.list_community_posts(text,integer) to anon,authenticated;

create or replace function public.create_community_post(p_category text,p_title text,p_body text) returns jsonb
language plpgsql security definer set search_path=public as $$ declare pid uuid; begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'msg','로그인이 필요합니다.'); end if;
  if length(trim(p_title))<3 or length(trim(p_body))<10 then return jsonb_build_object('ok',false,'msg','제목과 내용을 조금 더 자세히 작성해 주세요.'); end if;
  insert into community_posts(user_id,category,title,body) values(auth.uid(),coalesce(nullif(p_category,''),'노하우'),left(trim(p_title),120),left(trim(p_body),5000)) returning id into pid;
  return jsonb_build_object('ok',true,'id',pid); end $$;
grant execute on function public.create_community_post(text,text,text) to authenticated;

create or replace function public.my_content_licenses() returns jsonb language sql security definer set search_path=public stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'campaign_id',l.campaign_id,'title',c.title,'review_url',l.review_url,'usage_scope',l.usage_scope,'starts_at',l.starts_at,'ends_at',l.ends_at,'status',l.status) order by l.created_at desc),'[]'::jsonb)
  from content_licenses l join campaigns c on c.id=l.campaign_id where l.advertiser_id=auth.uid()
$$;
grant execute on function public.my_content_licenses() to authenticated;

insert into missions(title,description,kind,target,reward_points,is_active)
select * from (values
  ('첫 체험단 완료','첫 번째 리뷰 검수를 완료해 보세요.','review_complete',1,1000,true),
  ('성실 리뷰어 3회','기한 내 리뷰를 3회 완료해 보세요.','review_complete',3,2000,true),
  ('프로필 완성','SNS 채널을 등록하고 프로필을 완성해 보세요.','profile_complete',1,500,true)
) v(title,description,kind,target,reward_points,is_active)
where not exists(select 1 from missions);

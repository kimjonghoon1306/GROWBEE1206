-- 커뮤니티 운영·미션 보상·푸시 구독·관리자 CMS
create table if not exists public.community_reports (
  id uuid primary key default gen_random_uuid(), reporter_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid references community_posts(id) on delete cascade, comment_id uuid references community_comments(id) on delete cascade,
  reason text not null, status text not null default 'open', created_at timestamptz not null default now(),
  check((post_id is not null)::integer+(comment_id is not null)::integer=1), unique(reporter_id,post_id,comment_id)
);
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique, subscription jsonb not null, user_agent text, active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table community_reports enable row level security;alter table push_subscriptions enable row level security;
do $$ begin create policy "reports own insert" on community_reports for insert with check(auth.uid()=reporter_id); exception when duplicate_object then null; end $$;
do $$ begin create policy "push own" on push_subscriptions for all using(auth.uid()=user_id) with check(auth.uid()=user_id); exception when duplicate_object then null; end $$;

create or replace function public.community_post_detail(p_post uuid) returns jsonb language sql security definer set search_path=public stable as $$
 select jsonb_build_object('post',(select to_jsonb(x) from(select p.id,p.category,p.title,p.body,p.created_at,coalesce(pr.nickname,pr.name,'회원') author from community_posts p left join profiles pr on pr.id=p.user_id where p.id=p_post and p.status='published')x),
 'comments',coalesce((select jsonb_agg(x order by x.created_at) from(select c.id,c.body,c.created_at,coalesce(pr.nickname,pr.name,'회원') author from community_comments c left join profiles pr on pr.id=c.user_id where c.post_id=p_post and c.status='published')x),'[]'::jsonb))
$$;grant execute on function public.community_post_detail(uuid) to anon,authenticated;
create or replace function public.create_community_comment(p_post uuid,p_body text) returns jsonb language plpgsql security definer set search_path=public as $$begin
 if auth.uid() is null then return jsonb_build_object('ok',false,'msg','로그인이 필요합니다.');end if;if length(trim(p_body))<2 then return jsonb_build_object('ok',false,'msg','댓글을 입력해 주세요.');end if;
 insert into community_comments(post_id,user_id,body) values(p_post,auth.uid(),left(trim(p_body),1000));update community_posts set comment_count=comment_count+1 where id=p_post;return jsonb_build_object('ok',true);end$$;
grant execute on function public.create_community_comment(uuid,text) to authenticated;
create or replace function public.report_community(p_post uuid,p_comment uuid,p_reason text) returns jsonb language plpgsql security definer set search_path=public as $$begin
 insert into community_reports(reporter_id,post_id,comment_id,reason) values(auth.uid(),p_post,p_comment,left(trim(p_reason),500)) on conflict do nothing;return jsonb_build_object('ok',true);end$$;
grant execute on function public.report_community(uuid,uuid,text) to authenticated;

create or replace function public.claim_mission_reward(p_mission uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare mp mission_progress;m missions;begin select * into mp from mission_progress where mission_id=p_mission and user_id=auth.uid() for update;select * into m from missions where id=p_mission;
 if mp.completed_at is null then return jsonb_build_object('ok',false,'msg','아직 미션을 완료하지 않았습니다.');end if;if mp.claimed_at is not null then return jsonb_build_object('ok',false,'msg','이미 수령한 보상입니다.');end if;
 update mission_progress set claimed_at=now() where mission_id=p_mission and user_id=auth.uid();
 insert into point_transactions(user_id,amount,title,kind) values(auth.uid(),m.reward_points,'미션 보상 · '||m.title,'reward');
 update profiles set points=coalesce(points,0)+m.reward_points where id=auth.uid();
 insert into notifications(user_id,kind,title,body,link_url) values(auth.uid(),'reward','미션 보상이 지급됐어요',m.title||' 보상 '||m.reward_points||'P가 적립됐습니다.','/pages/user/points.html');
 return jsonb_build_object('ok',true,'points',m.reward_points);end$$;
grant execute on function public.claim_mission_reward(uuid) to authenticated;

create or replace function public.admin_save_cms(p_id uuid,p_content jsonb) returns jsonb language plpgsql security definer set search_path=public as $$declare cid uuid;begin
 if not exists(select 1 from profiles where id=auth.uid() and role='admin')then raise exception '관리자 권한이 필요합니다.';end if;
 if p_id is null then insert into cms_content(content_type,slug,title,body,audience,status,starts_at,ends_at,created_by) values(coalesce(p_content->>'content_type','notice'),coalesce(nullif(p_content->>'slug',''),'content-'||extract(epoch from now())::bigint),p_content->>'title',coalesce(p_content->>'body',''),coalesce(p_content->>'audience','all'),coalesce(p_content->>'status','draft'),nullif(p_content->>'starts_at','')::timestamptz,nullif(p_content->>'ends_at','')::timestamptz,auth.uid()) returning id into cid;
 else update cms_content set title=p_content->>'title',body=coalesce(p_content->>'body',''),audience=coalesce(p_content->>'audience','all'),status=coalesce(p_content->>'status','draft'),starts_at=nullif(p_content->>'starts_at','')::timestamptz,ends_at=nullif(p_content->>'ends_at','')::timestamptz,updated_at=now() where id=p_id returning id into cid;end if;return jsonb_build_object('ok',true,'id',cid);end$$;
grant execute on function public.admin_save_cms(uuid,jsonb) to authenticated;
create or replace function public.admin_list_cms() returns jsonb language plpgsql security definer set search_path=public as $$begin if not exists(select 1 from profiles where id=auth.uid() and role='admin')then raise exception '관리자 권한이 필요합니다.';end if;return coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at desc)from cms_content c),'[]'::jsonb);end$$;
grant execute on function public.admin_list_cms() to authenticated;
create or replace function public.admin_moderation_queue() returns jsonb language plpgsql security definer set search_path=public as $$begin if not exists(select 1 from profiles where id=auth.uid() and role='admin')then raise exception '관리자 권한이 필요합니다.';end if;return coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc)from community_reports r where status='open'),'[]'::jsonb);end$$;
grant execute on function public.admin_moderation_queue() to authenticated;

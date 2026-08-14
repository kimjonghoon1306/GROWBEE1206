-- 운영 자동화: 상태 알림, 광고주 퍼널, 관리자 작업 큐
create or replace function public.notify_application_status() returns trigger
language plpgsql security definer set search_path=public as $$
declare ctitle text; ntitle text; nbody text;
begin
  if new.status is not distinct from old.status then return new; end if;
  select title into ctitle from campaigns where id=new.campaign_id;
  case new.status
    when 'selected' then ntitle := '['||coalesce(ctitle,'캠페인')||'] 선정되었어요'; nbody := '방문 일정과 리뷰 미션을 확인해 주세요.';
    when 'reviewing' then ntitle := '['||coalesce(ctitle,'캠페인')||'] 리뷰가 접수됐어요'; nbody := '검수 결과를 알림으로 안내해 드릴게요.';
    when 'completed' then ntitle := '['||coalesce(ctitle,'캠페인')||'] 리뷰 검수가 완료됐어요'; nbody := '리워드 내역을 확인해 주세요.';
    when 'rejected' then ntitle := '['||coalesce(ctitle,'캠페인')||'] 선정 결과 안내'; nbody := '이번에는 선정되지 않았어요. 다른 맞춤 캠페인을 확인해 보세요.';
    else return new;
  end case;
  insert into notifications(user_id,kind,title,body,link_url)
  values(new.user_id,'application',ntitle,nbody,'/pages/user/mypage.html');
  return new;
end $$;
drop trigger if exists trg_notify_application_status on public.applications;
create trigger trg_notify_application_status after update of status on public.applications
for each row execute function public.notify_application_status();

create or replace function public.advertiser_performance_report()
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  select jsonb_build_object(
    'campaigns',(select count(*) from campaigns where owner_id=auth.uid()),
    'active',(select count(*) from campaigns where owner_id=auth.uid() and status='active'),
    'capacity',(select coalesce(sum(capacity),0) from campaigns where owner_id=auth.uid()),
    'applications',(select count(*) from applications a join campaigns c on c.id=a.campaign_id where c.owner_id=auth.uid()),
    'selected',(select count(*) from applications a join campaigns c on c.id=a.campaign_id where c.owner_id=auth.uid() and a.status in ('selected','reviewing','completed')),
    'reviews',(select count(*) from applications a join campaigns c on c.id=a.campaign_id where c.owner_id=auth.uid() and a.status='completed'),
    'views',(select count(*) from campaign_events e join campaigns c2 on c2.id=e.campaign_id where c2.owner_id=auth.uid() and e.event_type='detail_view'),
    'shares',(select count(*) from campaign_events e join campaigns c2 on c2.id=e.campaign_id where c2.owner_id=auth.uid() and e.event_type='share')
  ) into result;
  return coalesce(result,'{}'::jsonb);
end $$;
grant execute on function public.advertiser_performance_report() to authenticated;

create or replace function public.admin_work_queue()
returns jsonb language plpgsql security definer set search_path=public as $$
declare is_admin boolean; result jsonb;
begin
  select exists(select 1 from profiles where id=auth.uid() and role='admin') into is_admin;
  if not is_admin then raise exception '관리자 권한이 필요합니다.'; end if;
  select jsonb_build_object(
    'campaign_review',(select count(*) from campaigns where status in ('pending','review')),
    'review_check',(select count(*) from applications where status='reviewing'),
    'appeals',(select count(*) from applications where appeal_status='pending'),
    'advertisers',(select count(*) from profiles where role='advertiser' and coalesce(approved,false)=false),
    'withdrawals',(select count(*) from withdrawal_requests where status='pending'),
    'inquiries',(select count(*) from inquiries where status in ('open','pending'))
  ) into result;
  return result;
end $$;
grant execute on function public.admin_work_queue() to authenticated;

create or replace function public.reviewer_reputation(p_user uuid default auth.uid())
returns jsonb language sql security definer set search_path=public stable as $$
  select jsonb_build_object(
    'score',greatest(0,100 + coalesce((select sum(delta) from reputation_events where user_id=p_user),0)),
    'completed',(select count(*) from applications where user_id=p_user and status='completed'),
    'selected',(select count(*) from applications where user_id=p_user and status in ('selected','reviewing','completed')),
    'completion_rate',case when (select count(*) from applications where user_id=p_user and status in ('selected','reviewing','completed'))=0 then 0 else round(100.0*(select count(*) from applications where user_id=p_user and status='completed')/(select count(*) from applications where user_id=p_user and status in ('selected','reviewing','completed')),1) end
  )
$$;
grant execute on function public.reviewer_reputation(uuid) to authenticated;

-- 광고주 방문 일정 확인·확정
create or replace function public.advertiser_campaign_schedules(p_campaign uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from campaigns where id=p_campaign and owner_id=auth.uid())
     and not exists(select 1 from profiles where id=auth.uid() and role='admin') then raise exception '권한이 없습니다.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'application_id',s.application_id,'starts_at',s.starts_at,'status',s.status,'note',s.note))
    from campaign_schedules s join applications a on a.id=s.application_id where a.campaign_id=p_campaign),'[]'::jsonb);
end $$;
grant execute on function public.advertiser_campaign_schedules(uuid) to authenticated;

create or replace function public.advertiser_confirm_schedule(p_schedule uuid,p_confirm boolean,p_starts_at timestamptz default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare s campaign_schedules; camp campaigns; app applications;
begin
  select * into s from campaign_schedules where id=p_schedule; if s.id is null then return jsonb_build_object('ok',false,'msg','일정을 찾을 수 없습니다.'); end if;
  select * into app from applications where id=s.application_id; select * into camp from campaigns where id=app.campaign_id;
  if camp.owner_id<>auth.uid() and not exists(select 1 from profiles where id=auth.uid() and role='admin') then raise exception '권한이 없습니다.'; end if;
  update campaign_schedules set status=case when p_confirm then 'confirmed' else 'rejected' end,
    starts_at=coalesce(p_starts_at,starts_at),confirmed_at=case when p_confirm then now() else null end where id=p_schedule;
  insert into notifications(user_id,kind,title,body,link_url) values(app.user_id,'schedule','['||camp.title||'] 방문 일정 안내',
    case when p_confirm then to_char(coalesce(p_starts_at,s.starts_at) at time zone 'Asia/Seoul','YYYY.MM.DD HH24:MI')||' 방문 일정이 확정됐어요.' else '요청한 방문 일정을 확정하지 못했어요. 다른 일정을 요청해 주세요.' end,
    '/pages/user/mypage.html');
  return jsonb_build_object('ok',true);
end $$;
grant execute on function public.advertiser_confirm_schedule(uuid,boolean,timestamptz) to authenticated;

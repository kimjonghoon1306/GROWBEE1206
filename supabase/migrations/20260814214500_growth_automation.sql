-- 미션 진행도와 콘텐츠 사용권 자동 생성
create or replace function public.update_growth_on_application() returns trigger language plpgsql security definer set search_path=public as $$
declare m missions; b campaign_briefs; c campaigns;
begin
  if new.status='completed' and old.status is distinct from 'completed' then
    for m in select * from missions where is_active and kind='review_complete' loop
      insert into mission_progress(mission_id,user_id,progress,completed_at)
      values(m.id,new.user_id,1,case when 1>=m.target then now() else null end)
      on conflict(mission_id,user_id) do update set progress=mission_progress.progress+1,
        completed_at=case when mission_progress.progress+1>=m.target then coalesce(mission_progress.completed_at,now()) else mission_progress.completed_at end;
    end loop;
    select * into b from campaign_briefs where campaign_id=new.campaign_id; select * into c from campaigns where id=new.campaign_id;
    if b.usage_rights and c.owner_id is not null and coalesce(new.review_url,'')<>'' then
      insert into content_licenses(application_id,campaign_id,advertiser_id,reviewer_id,review_url,usage_scope,ends_at)
      values(new.id,new.campaign_id,c.owner_id,new.user_id,new.review_url,array['SNS 광고','브랜드 채널'],case when b.usage_days>0 then now()+(b.usage_days||' days')::interval else null end)
      on conflict(application_id) do update set review_url=excluded.review_url,ends_at=excluded.ends_at,status='active';
    end if;
  end if; return new;
end $$;
drop trigger if exists trg_growth_application on applications;
create trigger trg_growth_application after update of status on applications for each row execute function public.update_growth_on_application();

create or replace function public.update_profile_mission_on_channel() returns trigger language plpgsql security definer set search_path=public as $$
declare m missions; begin
  for m in select * from missions where is_active and kind='profile_complete' loop
    insert into mission_progress(mission_id,user_id,progress,completed_at) values(m.id,new.user_id,1,now())
    on conflict(mission_id,user_id) do update set progress=greatest(mission_progress.progress,1),completed_at=coalesce(mission_progress.completed_at,now());
  end loop; return new;
end $$;
drop trigger if exists trg_growth_channel on reviewer_channels;
create trigger trg_growth_channel after insert on reviewer_channels for each row execute function public.update_profile_mission_on_channel();

-- 상세 신청서·방문 예약·배송 정보
create table if not exists public.application_details (
  application_id uuid primary key references public.applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  message text, preferred_at timestamptz, companion_count smallint not null default 1 check(companion_count between 1 and 20),
  channel_id uuid references public.reviewer_channels(id) on delete set null,
  fulfillment_type text not null default 'visit' check(fulfillment_type in ('visit','shipping','online')),
  recipient text, phone text, postal_code text, address text, address_detail text,
  privacy_agreed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.application_details enable row level security;
do $$ begin create policy "application details own" on public.application_details for select using(auth.uid()=user_id); exception when duplicate_object then null; end $$;
do $$ begin create policy "application details own insert" on public.application_details for insert with check(auth.uid()=user_id); exception when duplicate_object then null; end $$;
do $$ begin create policy "application details own update" on public.application_details for update using(auth.uid()=user_id) with check(auth.uid()=user_id); exception when duplicate_object then null; end $$;

create or replace function public.apply_campaign_detailed(p_campaign uuid,p_detail jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public as $$
declare base jsonb; aid uuid; uid uuid:=auth.uid();
begin
  if uid is null then return jsonb_build_object('ok',false,'msg','로그인이 필요합니다.'); end if;
  base:=apply_campaign(p_campaign);
  if coalesce((base->>'ok')::boolean,false)=false then return base; end if;
  select id into aid from applications where campaign_id=p_campaign and user_id=uid order by created_at desc limit 1;
  insert into application_details(application_id,user_id,message,preferred_at,companion_count,channel_id,fulfillment_type,recipient,phone,postal_code,address,address_detail,privacy_agreed_at)
  values(aid,uid,nullif(p_detail->>'message',''),nullif(p_detail->>'preferred_at','')::timestamptz,
    greatest(1,least(20,coalesce((p_detail->>'companion_count')::smallint,1))),nullif(p_detail->>'channel_id','')::uuid,
    case when p_detail->>'fulfillment_type' in ('visit','shipping','online') then p_detail->>'fulfillment_type' else 'visit' end,
    nullif(p_detail->>'recipient',''),nullif(p_detail->>'phone',''),nullif(p_detail->>'postal_code',''),nullif(p_detail->>'address',''),nullif(p_detail->>'address_detail',''),now())
  on conflict(application_id) do update set message=excluded.message,preferred_at=excluded.preferred_at,companion_count=excluded.companion_count,
    channel_id=excluded.channel_id,fulfillment_type=excluded.fulfillment_type,recipient=excluded.recipient,phone=excluded.phone,
    postal_code=excluded.postal_code,address=excluded.address,address_detail=excluded.address_detail,updated_at=now();
  insert into campaign_events(campaign_id,user_id,event_type,metadata) values(p_campaign,uid,'apply_complete',jsonb_build_object('application_id',aid));
  return base||jsonb_build_object('application_id',aid);
end $$;
grant execute on function public.apply_campaign_detailed(uuid,jsonb) to authenticated;

create or replace function public.advertiser_application_details(p_campaign uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from campaigns where id=p_campaign and owner_id=auth.uid())
     and not exists(select 1 from profiles where id=auth.uid() and role='admin') then raise exception '권한이 없습니다.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('application_id',d.application_id,'message',d.message,'preferred_at',d.preferred_at,
    'companion_count',d.companion_count,'channel_id',d.channel_id,'fulfillment_type',d.fulfillment_type,'recipient',d.recipient,
    'phone',d.phone,'postal_code',d.postal_code,'address',d.address,'address_detail',d.address_detail))
    from application_details d join applications a on a.id=d.application_id where a.campaign_id=p_campaign),'[]'::jsonb);
end $$;
grant execute on function public.advertiser_application_details(uuid) to authenticated;

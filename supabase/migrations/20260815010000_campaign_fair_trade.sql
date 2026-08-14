-- 체험단 공정거래표: 광고주 조건 입력, 관리자 검증, 신청 시 조건 동의 스냅샷
alter table public.campaigns
  add column if not exists fair_retail_value integer check(fair_retail_value is null or fair_retail_value>=0),
  add column if not exists fair_extra_cost integer not null default 0 check(fair_extra_cost>=0),
  add column if not exists fair_work_minutes integer check(fair_work_minutes is null or fair_work_minutes between 0 and 10080),
  add column if not exists fair_maintenance_days integer check(fair_maintenance_days is null or fair_maintenance_days between 0 and 3650),
  add column if not exists fair_revision_limit integer not null default 0 check(fair_revision_limit between 0 and 20),
  add column if not exists fair_revision_scope text not null default '사실 오류에 한해 수정 요청 가능',
  add column if not exists fair_usage_scope text not null default '사용 안 함',
  add column if not exists fair_usage_days integer not null default 0 check(fair_usage_days between 0 and 3650),
  add column if not exists fair_cancel_policy text,
  add column if not exists fair_verified boolean not null default false,
  add column if not exists fair_verified_at timestamptz,
  add column if not exists fair_verified_by uuid references auth.users(id) on delete set null,
  add column if not exists fair_verification_note text,
  add column if not exists fair_terms_version text not null default '2026-08-15';

alter table public.application_details
  add column if not exists fair_terms_agreed_at timestamptz,
  add column if not exists fair_terms_version text,
  add column if not exists fair_terms_snapshot jsonb not null default '{}';

create or replace function public.reset_campaign_fair_verification() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if old.fair_retail_value is distinct from new.fair_retail_value
    or old.fair_extra_cost is distinct from new.fair_extra_cost
    or old.fair_work_minutes is distinct from new.fair_work_minutes
    or old.fair_maintenance_days is distinct from new.fair_maintenance_days
    or old.fair_revision_limit is distinct from new.fair_revision_limit
    or old.fair_revision_scope is distinct from new.fair_revision_scope
    or old.fair_usage_scope is distinct from new.fair_usage_scope
    or old.fair_usage_days is distinct from new.fair_usage_days
    or old.fair_cancel_policy is distinct from new.fair_cancel_policy then
    new.fair_verified:=false; new.fair_verified_at:=null; new.fair_verified_by:=null;
  end if;
  return new;
end $$;
drop trigger if exists trg_reset_campaign_fair_verification on public.campaigns;
create trigger trg_reset_campaign_fair_verification before update on public.campaigns
for each row execute function public.reset_campaign_fair_verification();

create or replace function public.admin_verify_campaign_fairness(p_campaign uuid,p_ok boolean,p_note text default null) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from profiles where id=auth.uid() and role='admin') then raise exception '관리자 권한이 필요합니다.'; end if;
  update campaigns set fair_verified=coalesce(p_ok,false),fair_verified_at=case when p_ok then now() else null end,
    fair_verified_by=case when p_ok then auth.uid() else null end,fair_verification_note=nullif(left(trim(coalesce(p_note,'')),500),'')
  where id=p_campaign;
  return jsonb_build_object('ok',found,'verified',coalesce(p_ok,false));
end $$;
grant execute on function public.admin_verify_campaign_fairness(uuid,boolean,text) to authenticated;

create or replace function public.apply_campaign_detailed(p_campaign uuid,p_detail jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public as $$
declare base jsonb; aid uuid; uid uuid:=auth.uid(); camp campaigns%rowtype; snap jsonb;
begin
  if uid is null then return jsonb_build_object('ok',false,'msg','로그인이 필요합니다.'); end if;
  if coalesce((p_detail->>'fair_terms_agreed')::boolean,false)=false then return jsonb_build_object('ok',false,'msg','공정거래 조건 확인과 동의가 필요합니다.'); end if;
  select * into camp from campaigns where id=p_campaign;
  snap:=jsonb_build_object('version',camp.fair_terms_version,'retail_value',camp.fair_retail_value,'extra_cost',camp.fair_extra_cost,
    'work_minutes',camp.fair_work_minutes,'maintenance_days',camp.fair_maintenance_days,'revision_limit',camp.fair_revision_limit,
    'revision_scope',camp.fair_revision_scope,'usage_scope',camp.fair_usage_scope,'usage_days',camp.fair_usage_days,
    'cancel_policy',camp.fair_cancel_policy,'verified',camp.fair_verified);
  base:=apply_campaign(p_campaign);
  if coalesce((base->>'ok')::boolean,false)=false then return base; end if;
  select id into aid from applications where campaign_id=p_campaign and user_id=uid order by created_at desc limit 1;
  insert into application_details(application_id,user_id,message,preferred_at,companion_count,channel_id,fulfillment_type,recipient,phone,postal_code,address,address_detail,privacy_agreed_at,fair_terms_agreed_at,fair_terms_version,fair_terms_snapshot)
  values(aid,uid,nullif(p_detail->>'message',''),nullif(p_detail->>'preferred_at','')::timestamptz,
    greatest(1,least(20,coalesce((p_detail->>'companion_count')::smallint,1))),nullif(p_detail->>'channel_id','')::uuid,
    case when p_detail->>'fulfillment_type' in ('visit','shipping','online') then p_detail->>'fulfillment_type' else 'visit' end,
    nullif(p_detail->>'recipient',''),nullif(p_detail->>'phone',''),nullif(p_detail->>'postal_code',''),nullif(p_detail->>'address',''),nullif(p_detail->>'address_detail',''),now(),now(),camp.fair_terms_version,snap)
  on conflict(application_id) do update set message=excluded.message,preferred_at=excluded.preferred_at,companion_count=excluded.companion_count,
    channel_id=excluded.channel_id,fulfillment_type=excluded.fulfillment_type,recipient=excluded.recipient,phone=excluded.phone,
    postal_code=excluded.postal_code,address=excluded.address,address_detail=excluded.address_detail,privacy_agreed_at=now(),
    fair_terms_agreed_at=now(),fair_terms_version=excluded.fair_terms_version,fair_terms_snapshot=excluded.fair_terms_snapshot,updated_at=now();
  insert into campaign_events(campaign_id,user_id,event_type,metadata) values(p_campaign,uid,'apply_complete',jsonb_build_object('application_id',aid,'fair_terms_version',camp.fair_terms_version));
  return base||jsonb_build_object('application_id',aid);
end $$;
grant execute on function public.apply_campaign_detailed(uuid,jsonb) to authenticated;

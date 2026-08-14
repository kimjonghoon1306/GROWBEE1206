-- 배송 개인정보는 선정 이후에만 광고주에게 제공
create or replace function public.advertiser_application_details(p_campaign uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from campaigns where id=p_campaign and owner_id=auth.uid())
     and not exists(select 1 from profiles where id=auth.uid() and role='admin') then raise exception '권한이 없습니다.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'application_id',d.application_id,'message',d.message,'preferred_at',d.preferred_at,'companion_count',d.companion_count,
    'channel_id',d.channel_id,'fulfillment_type',d.fulfillment_type,
    'recipient',case when a.status in ('selected','reviewing','completed') then d.recipient else null end,
    'phone',case when a.status in ('selected','reviewing','completed') then d.phone else null end,
    'postal_code',case when a.status in ('selected','reviewing','completed') then d.postal_code else null end,
    'address',case when a.status in ('selected','reviewing','completed') then d.address else null end,
    'address_detail',case when a.status in ('selected','reviewing','completed') then d.address_detail else null end))
    from application_details d join applications a on a.id=d.application_id where a.campaign_id=p_campaign),'[]'::jsonb);
end $$;

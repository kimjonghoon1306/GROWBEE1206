-- 출금 신청 이상징후 자동 기록(지급 자체는 기존 관리자 승인 절차 유지)
create or replace function public.flag_withdrawal_risk() returns trigger
language plpgsql security definer set search_path=public as $$
declare shared_count integer;
begin
  select count(distinct user_id) into shared_count from withdrawal_requests where account=new.account and user_id<>new.user_id;
  if shared_count>0 then
    insert into risk_flags(kind,severity,user_id,related_id,reason,evidence)
    values('withdrawal','high',new.user_id,new.id::text,'서로 다른 회원이 동일 출금계좌를 사용했습니다.',jsonb_build_object('account_tail',right(coalesce(new.account,''),4),'other_users',shared_count));
  end if;
  if new.amount>=500000 then
    insert into risk_flags(kind,severity,user_id,related_id,reason,evidence)
    values('withdrawal','medium',new.user_id,new.id::text,'고액 출금 신청입니다.',jsonb_build_object('amount',new.amount));
  end if;
  return new;
end $$;
drop trigger if exists trg_flag_withdrawal_risk on public.withdrawal_requests;
create trigger trg_flag_withdrawal_risk after insert on public.withdrawal_requests for each row execute function public.flag_withdrawal_risk();

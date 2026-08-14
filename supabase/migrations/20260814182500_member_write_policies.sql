-- 회원 확장 기능의 최소 쓰기 권한 보완
do $$ begin
  create policy "notifications mark own read" on public.notifications
    for update using(auth.uid()=user_id) with check(auth.uid()=user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "schedules insert own" on public.campaign_schedules
    for insert with check(auth.uid()=user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "schedules update own" on public.campaign_schedules
    for update using(auth.uid()=user_id) with check(auth.uid()=user_id);
exception when duplicate_object then null; end $$;

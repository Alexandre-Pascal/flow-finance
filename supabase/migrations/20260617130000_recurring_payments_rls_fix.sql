-- Fix RLS: explicit WITH CHECK required for INSERT on recurring_payments

drop policy if exists "recurring_payments_all_own" on public.recurring_payments;

create policy "recurring_payments_all_own" on public.recurring_payments
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

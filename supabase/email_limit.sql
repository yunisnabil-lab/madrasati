-- Daily email allowance per staff member.
-- The send-report-email function writes one row here for every email it sends
-- and refuses to send once a person has used up the last 24 hours' allowance
-- (150 emails, or 500 for the admin — the numbers are in the function code).
-- Nobody can delete or edit these rows from the website, so the count can't be
-- reset. Safe to run more than once; changes no existing data.

create table if not exists public.email_send_log (
  id bigint generated always as identity primary key,
  staff_id uuid not null default auth.uid(),
  sent_at timestamptz not null default now()
);

create index if not exists email_send_log_staff_time on public.email_send_log (staff_id, sent_at desc);

alter table public.email_send_log enable row level security;

drop policy if exists "staff can read own email log" on public.email_send_log;
create policy "staff can read own email log"
  on public.email_send_log for select
  using (staff_id = auth.uid());

drop policy if exists "staff can add own email log" on public.email_send_log;
create policy "staff can add own email log"
  on public.email_send_log for insert
  with check (staff_id = auth.uid());

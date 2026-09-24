-- Security hardening (safe to run more than once; changes no data).
--
-- 1. contact_requests: a teacher could insert a request that is already
--    "approved", and could read every teacher's requests. Now a new request
--    must start as pending, and each person sees only their own requests
--    (admin / supervisor / edari still see all of them).
-- 2. morning_lateness: any staff member (even a teacher) could read the whole
--    school's lateness log. Now only admin / supervisor / edari / viewer.
-- 3. Length limits on free-text fields so nobody can push huge texts into the
--    database (existing rows are not checked, only new ones).

-- 1) contact_requests --------------------------------------------------------
drop policy if exists "staff can create own contact requests" on public.contact_requests;
create policy "staff can create own contact requests"
  on public.contact_requests for insert
  with check (
    school_id = my_school_id()
    and requested_by = auth.uid()
    and status = 'pending'
    and reviewed_by is null
  );

drop policy if exists "staff can view own school contact requests" on public.contact_requests;
drop policy if exists "view contact requests" on public.contact_requests;
create policy "view contact requests"
  on public.contact_requests for select
  using (
    school_id = my_school_id()
    and (
      get_my_staff_role() in ('admin', 'supervisor', 'edari')
      or requested_by = auth.uid()
    )
  );

-- 2) morning_lateness ---------------------------------------------------------
drop policy if exists "school staff can view lateness" on public.morning_lateness;
drop policy if exists "reviewers can view lateness" on public.morning_lateness;
create policy "reviewers can view lateness"
  on public.morning_lateness for select
  using (
    school_id = my_school_id()
    and get_my_staff_role() in ('admin', 'supervisor', 'edari', 'viewer')
  );

-- 3) length limits (NOT VALID = applies to new/changed rows only) --------------
alter table public.behavior_violations drop constraint if exists behavior_violations_description_len;
alter table public.behavior_violations
  add constraint behavior_violations_description_len check (char_length(description) <= 2000) not valid;

alter table public.morning_lateness drop constraint if exists morning_lateness_description_len;
alter table public.morning_lateness
  add constraint morning_lateness_description_len check (char_length(description) <= 2000) not valid;

alter table public.contact_requests drop constraint if exists contact_requests_message_len;
alter table public.contact_requests
  add constraint contact_requests_message_len check (char_length(message) <= 4000) not valid;

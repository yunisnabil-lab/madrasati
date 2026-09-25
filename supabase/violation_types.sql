-- Lets the admin add his own violation types to the list (the seven built-in types
-- stay in the code). A custom type gets a generated key (c_...) that is stored in
-- behavior_violations.violation_type like the built-in keys are; its name comes
-- from this table. behavior_violations has no check on violation_type, so nothing
-- else needs to change. Hiding a type (is_active = false) only stops it being
-- offered for new violations. Safe to run more than once; changes no existing data.

create table if not exists public.violation_types (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  key text not null,
  name_ar text not null,
  name_en text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (school_id, key)
);

alter table public.violation_types enable row level security;

drop policy if exists "staff can view own school violation types" on public.violation_types;
create policy "staff can view own school violation types" on public.violation_types
  for select using (school_id = (select my_school_id()));

drop policy if exists "admin manages own school violation types" on public.violation_types;
create policy "admin manages own school violation types" on public.violation_types
  for all
  using (school_id = (select my_school_id()) and (select get_my_staff_role()) = 'admin')
  with check (school_id = (select my_school_id()) and (select get_my_staff_role()) = 'admin');

revoke all on public.violation_types from anon;
grant select, insert, update, delete on public.violation_types to authenticated;

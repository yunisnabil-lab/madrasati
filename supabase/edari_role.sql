-- The staff.role check constraint did not list 'edari', so the database refused
-- to give anyone the Edari role. Adds it. Safe to run more than once; changes
-- no data.
alter table public.staff drop constraint if exists staff_role_check;
alter table public.staff
  add constraint staff_role_check
  check (role is null or role in ('viewer', 'recorder', 'admin', 'supervisor', 'edari'));

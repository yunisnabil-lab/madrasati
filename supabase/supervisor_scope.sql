-- Locks the supervisor to the sections linked to them (staff_sections), inside
-- the database itself — until now this limit only existed in the website.
-- A supervisor with no linked sections will see no students at all, so link
-- every supervisor to their sections first (Staff assignments page).
-- Admin, edari and viewer still see everything; teachers (recorder) and
-- supervisors see only their own sections. Safe to run more than once;
-- changes no data.

create or replace function public.staff_allowed_section(sec uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when get_my_staff_role() in ('admin', 'edari', 'viewer') then true
    when get_my_staff_role() in ('recorder', 'supervisor') then exists (
      select 1 from staff_sections ss where ss.section_id = sec and ss.staff_id = auth.uid())
    else false
  end;
$$;

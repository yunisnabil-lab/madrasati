-- Locks the supervisor and the edari to the sections linked to them (staff_sections), inside
-- the database itself — until now this limit only existed in the website.
-- A supervisor or edari with no linked sections will see no students at all,
-- so link every supervisor and edari to their sections first (Staff assignments page).
-- Only admin and viewer see everything; teachers (recorder), supervisors and
-- edari see only their own sections. Safe to run more than once;
-- changes no data.

create or replace function public.staff_allowed_section(sec uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when get_my_staff_role() in ('admin', 'viewer') then true
    when get_my_staff_role() in ('recorder', 'supervisor', 'edari') then exists (
      select 1 from staff_sections ss where ss.section_id = sec and ss.staff_id = auth.uid())
    else false
  end;
$$;

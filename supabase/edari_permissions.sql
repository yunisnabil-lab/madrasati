-- صلاحيات الإداري (edari): كل حاجة ما عدا حذف الحضور وإعادة ضبطه وإدارة الموظفين وطلبات التواصل.
-- آمن لو اتشغّل أكتر من مرة.

begin;

create or replace function public.staff_allowed_section(sec uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when get_my_staff_role() in ('admin', 'edari', 'viewer', 'supervisor') then true
    when get_my_staff_role() = 'recorder' then exists (
      select 1 from staff_sections ss where ss.section_id = sec and ss.staff_id = auth.uid())
    else false
  end;
$$;

create or replace function public.staff_allowed_student(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select staff_allowed_section(st.section_id) from students st where st.id = sid), false);
$$;

drop policy if exists "edari can add own school students" on public.students;
create policy "edari can add own school students" on public.students
  for insert with check (school_id = my_school_id() and get_my_staff_role() = 'edari');

drop policy if exists "edari can edit own school students" on public.students;
create policy "edari can edit own school students" on public.students
  for update using (school_id = my_school_id() and get_my_staff_role() = 'edari')
  with check (school_id = my_school_id() and get_my_staff_role() = 'edari');

alter policy "school staff can view violations" on public.behavior_violations
  using (school_id = my_school_id() and get_my_staff_role() in ('admin', 'supervisor', 'edari', 'viewer'));
alter policy "admin and supervisor manage violations" on public.behavior_violations
  using (school_id = my_school_id() and get_my_staff_role() in ('admin', 'supervisor', 'edari'))
  with check (school_id = my_school_id() and get_my_staff_role() in ('admin', 'supervisor', 'edari'));

alter policy "admin and supervisor manage lateness" on public.morning_lateness
  using (school_id = my_school_id() and get_my_staff_role() in ('admin', 'supervisor', 'edari'))
  with check (school_id = my_school_id() and get_my_staff_role() in ('admin', 'supervisor', 'edari'));

drop policy if exists "staff can view own school colleagues" on public.staff;
create policy "staff can view own school colleagues" on public.staff
  for select using (school_id = my_school_id());

commit;

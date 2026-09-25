-- Makes reading attendance and students fast on a big school, without changing who
-- can see what.
--
-- Before: for EVERY attendance row the database ran staff_allowed_student(), which
-- looks the student up and checks the caller's role again (several lookups per row —
-- with 240,000 rows every page that reads attendance became slow).
-- Now: the school and the role are worked out ONCE per query ((select ...)), admin and
-- viewer are let through straight away, and only teacher / supervisor / edari still go
-- through the per-student section check. The visible rows are exactly the same.
--
-- Rollback (old rules):
--   alter policy "staff can view own school attendance" on public.attendance_records
--     using ((school_id = my_school_id()) and staff_allowed_student(student_id));
--   alter policy "staff can view own school students" on public.students
--     using ((school_id = my_school_id()) and staff_allowed_section(section_id));

begin;

create or replace function public.staff_allowed_section(sec uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when x.r in ('admin', 'viewer') then true
    when x.r in ('recorder', 'supervisor', 'edari') then exists (
      select 1 from staff_sections ss where ss.section_id = sec and ss.staff_id = auth.uid())
    else false
  end
  from (select get_my_staff_role() as r) x;
$$;

alter policy "staff can view own school attendance" on public.attendance_records
  using (
    school_id = (select my_school_id())
    and (
      (select get_my_staff_role()) in ('admin', 'viewer')
      or staff_allowed_student(student_id)
    )
  );

alter policy "staff can view own school students" on public.students
  using (
    school_id = (select my_school_id())
    and (
      (select get_my_staff_role()) in ('admin', 'viewer')
      or staff_allowed_section(section_id)
    )
  );

commit;

-- indexes for the big attendance table (it only had the primary key and the
-- student+date+period key, so any query by date read every row)
create index if not exists attendance_records_date_student_idx on public.attendance_records (date, student_id);
create index if not exists attendance_records_school_created_idx on public.attendance_records (school_id, created_at desc);

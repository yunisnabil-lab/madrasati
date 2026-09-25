-- The "recording follow-up" page (متابعة التسجيل): for one day, how many students of
-- each section were recorded in each period, and which students were absent in which
-- periods — counted inside the database, so the browser doesn't download every period
-- row of the day (17,000+ rows for a big school).
-- Scope: admin/viewer see the whole school; supervisor/edari/teacher only their
-- sections (checked once per student, not per attendance row). Anonymous callers are
-- refused. Changes no data. Safe to run more than once.

create or replace function public.recording_status_day(p_date date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with stu as (
    select s.id, s.section_id from public.students s
    where s.school_id = public.my_school_id() and s.is_active and s.section_id is not null
      and public.staff_allowed_section(s.section_id)
  ),
  per as (
    select distinct on (ar.student_id, ar.period)
      ar.student_id, ar.period, ar.status::text as status
    from public.attendance_records ar
    join stu on stu.id = ar.student_id
    where ar.date = p_date and ar.period is not null
    order by ar.student_id, ar.period, ar.id desc
  ),
  cnt as (
    select stu.section_id, per.period, count(*) as c
    from per join stu on stu.id = per.student_id
    group by stu.section_id, per.period
  ),
  ab as (
    select per.student_id, array_agg(per.period order by per.period) as periods
    from per where per.status = 'absent'
    group by per.student_id
  )
  select jsonb_build_object(
    'counts', coalesce((select jsonb_agg(jsonb_build_object('section_id', section_id, 'period', period, 'c', c)) from cnt), '[]'::jsonb),
    'absentees', coalesce((select jsonb_agg(jsonb_build_object('student_id', student_id, 'periods', periods)) from ab), '[]'::jsonb)
  );
$$;

revoke all on function public.recording_status_day(date) from public, anon;
grant execute on function public.recording_status_day(date) to authenticated;

-- indexes that speed up the profile counts ("records I saved") and lookups by saver
create index if not exists attendance_records_recorded_by_idx on public.attendance_records (recorded_by, created_at desc);

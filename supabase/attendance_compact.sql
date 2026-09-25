-- Attendance for some sections and a date range in one compact answer, for the daily
-- and period reports: { student_id: { "2026-09-21": "PPPAPPPP", ... }, ... } where each
-- letter is one period (P present, A absent, L late, E excused, - not recorded) and
-- "=absent" style values are old whole-day records. Instead of downloading one row per
-- student per period (tens of thousands of rows, 1000 per request) the browser gets a
-- few hundred KB in a single call.
-- Scope: only students of the given sections that the caller is allowed to see
-- (admin/viewer all, others their linked sections — checked once per student).
-- Anonymous callers are refused. Changes no data. Safe to run more than once.

create or replace function public.attendance_compact(p_from date, p_to date, p_section_ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with stu as (
    select s.id from public.students s
    where s.school_id = public.my_school_id()
      and s.section_id = any(p_section_ids)
      and public.staff_allowed_section(s.section_id)
  ),
  per as (
    select distinct on (ar.student_id, ar.date, ar.period)
      ar.student_id, ar.date, ar.period, ar.status::text as status,
      case ar.status::text when 'present' then 'P' when 'absent' then 'A' when 'late' then 'L' when 'excused' then 'E' else '?' end as code
    from public.attendance_records ar
    join stu on stu.id = ar.student_id
    where ar.date between p_from and p_to
    order by ar.student_id, ar.date, ar.period, ar.id desc
  ),
  day as (
    select student_id, date,
      max(status) filter (where period is null) as legacy,
      concat(
        coalesce(max(code) filter (where period = 1), '-'),
        coalesce(max(code) filter (where period = 2), '-'),
        coalesce(max(code) filter (where period = 3), '-'),
        coalesce(max(code) filter (where period = 4), '-'),
        coalesce(max(code) filter (where period = 5), '-'),
        coalesce(max(code) filter (where period = 6), '-'),
        coalesce(max(code) filter (where period = 7), '-'),
        coalesce(max(code) filter (where period = 8), '-')
      ) as s
    from per
    group by student_id, date
  ),
  per_student as (
    select student_id::text as sid,
           jsonb_object_agg(date::text, case when legacy is not null then '=' || legacy else s end) as days
    from day
    group by student_id
  )
  select coalesce(jsonb_object_agg(sid, days), '{}'::jsonb) from per_student;
$$;

revoke all on function public.attendance_compact(date, date, uuid[]) from public, anon;
grant execute on function public.attendance_compact(date, date, uuid[]) to authenticated;

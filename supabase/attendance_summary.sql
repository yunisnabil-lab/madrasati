-- Per-student attendance summary for a date range, calculated inside the
-- database (the early-warning list and the monthly report use it, so the
-- browser never has to download hundreds of thousands of period rows).
--
-- It applies the same rule as src/lib/attendanceDerive.js:
--   * one row per student + date + period (a double save counts once)
--   * attended = present / late / excused
--   * a day is "present" when attended * 8 >= 5 * recorded periods, else "absent"
--   * fewer than 3 recorded periods = no verdict (not counted either way)
--   * a legacy row (period is null) is used as-is for that day
--
-- The function runs with the caller's own permissions (security invoker), so
-- the existing row-level security still decides which students each person
-- can see. It changes no data. Safe to run more than once.

create or replace function public.student_attendance_summary(p_from date, p_to date)
returns table (
  student_id public.students.id%type,
  present_days integer,
  absent_days integer,
  late_periods integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with per as (
    select distinct on (ar.student_id, ar.date, ar.period)
      ar.student_id, ar.date, ar.period, ar.status::text as status
    from public.attendance_records ar
    where ar.date between p_from and p_to
    order by ar.student_id, ar.date, ar.period, ar.id desc
  ),
  day as (
    select
      student_id,
      date,
      max(status) filter (where period is null) as legacy_status,
      count(*) filter (where period is not null and status in ('present', 'absent', 'late', 'excused')) as recorded,
      count(*) filter (where period is not null and status in ('present', 'late', 'excused')) as attended,
      count(*) filter (where period is not null and status = 'late') as late_n
    from per
    group by student_id, date
  ),
  verdict as (
    select
      student_id,
      late_n,
      case
        when legacy_status is not null then
          case when legacy_status = 'absent' then 'absent' else 'present' end
        when recorded < 3 then null
        when attended * 8 >= 5 * recorded then 'present'
        else 'absent'
      end as v
    from day
  )
  select
    student_id,
    (count(*) filter (where v = 'present'))::integer,
    (count(*) filter (where v = 'absent'))::integer,
    (coalesce(sum(late_n), 0))::integer
  from verdict
  group by student_id;
$$;

grant execute on function public.student_attendance_summary(date, date) to authenticated;

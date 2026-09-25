-- Makes the dashboard fast on a big school: the absence chart and the "today"
-- cards are counted inside the database instead of downloading tens of
-- thousands of period rows into the browser (1000 rows per request).
-- Same rule as src/lib/attendanceDerive.js:
--   * one row per student + date + period
--   * attended = present / late / excused
--   * a day is "present" when attended * 8 >= 5 * recorded periods, else "absent"
--   * fewer than 3 recorded periods = no verdict
-- Both functions run with the caller's own permissions (security invoker), so the
-- existing row-level security still limits what each person sees.
-- They change no data. Safe to run more than once.

create or replace function public.dashboard_absence_series(p_from date, p_to date)
returns table (day date, total bigint, absent bigint)
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
  d as (
    select student_id, date,
      max(status) filter (where period is null) as legacy_status,
      count(*) filter (where period is not null and status in ('present', 'absent', 'late', 'excused')) as recorded,
      count(*) filter (where period is not null and status in ('present', 'late', 'excused')) as attended
    from per
    group by student_id, date
  ),
  v as (
    select date,
      case
        when legacy_status is not null then case when legacy_status = 'absent' then 'absent' else 'present' end
        when recorded < 3 then null
        when attended * 8 >= 5 * recorded then 'present'
        else 'absent'
      end as verdict
    from d
  )
  select date, count(*) filter (where verdict is not null), count(*) filter (where verdict = 'absent')
  from v
  group by date
  order by date;
$$;

create or replace function public.dashboard_today(p_date date, p_periods integer)
returns table (done bigint, total bigint, absent bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with stu as (
    select id, section_id from public.students where is_active and section_id is not null
  ),
  sec_total as (
    select section_id, count(*) as n from stu group by section_id
  ),
  per as (
    select distinct on (ar.student_id, ar.period)
      ar.student_id, ar.period, ar.status::text as status
    from public.attendance_records ar
    where ar.date = p_date and ar.period is not null
    order by ar.student_id, ar.period, ar.id desc
  ),
  cnt as (
    select s.section_id, per.period, count(*) as c
    from per join stu s on s.id = per.student_id
    group by s.section_id, per.period
  )
  select
    (select count(*) from cnt join sec_total st on st.section_id = cnt.section_id
      where cnt.period between 1 and p_periods and cnt.c >= st.n),
    (select count(*) from sec_total) * p_periods::bigint,
    (select count(distinct per.student_id) from per join stu s on s.id = per.student_id where per.status = 'absent');
$$;

grant execute on function public.dashboard_absence_series(date, date) to authenticated;
grant execute on function public.dashboard_today(date, integer) to authenticated;

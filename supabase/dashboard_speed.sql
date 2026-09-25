-- Makes the dashboard, the early-warning list and the monthly report fast on a big
-- school: the numbers are counted inside the database instead of downloading tens of
-- thousands of period rows into the browser.
--
-- Why "security definer" (not invoker) with the scope checked by hand: with row-level
-- security on, the database re-checks the caller's permission for EVERY attendance row
-- (hundreds of thousands), which is what made these pages time out. Here the scope is
-- worked out once per STUDENT (admin/viewer: all, teacher/supervisor/edari: only the
-- sections linked to them — same rule as staff_allowed_section) and the attendance rows
-- are then joined to that list. The result for each person is the same as before.
-- Anonymous visitors cannot call these functions (execute is revoked from public/anon).
--
-- Rule (same as src/lib/attendanceDerive.js): one row per student + date + period;
-- attended = present / late / excused; a day is "present" when attended * 8 >= 5 *
-- recorded periods, else "absent"; fewer than 3 recorded periods = no verdict.
-- They change no data. Safe to run more than once.

create or replace function public.student_attendance_summary(p_from date, p_to date)
returns table (
  student_id public.students.id%type,
  present_days integer,
  absent_days integer,
  late_periods integer
)
language sql
stable
security definer
set search_path = public
as $$
  with stu as (
    select s.id from public.students s
    where s.school_id = public.my_school_id() and public.staff_allowed_section(s.section_id)
  ),
  per as (
    select distinct on (ar.student_id, ar.date, ar.period)
      ar.student_id, ar.date, ar.period, ar.status::text as status
    from public.attendance_records ar
    join stu on stu.id = ar.student_id
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

create or replace function public.dashboard_absence_series(p_from date, p_to date)
returns table (day date, total bigint, absent bigint)
language sql
stable
security definer
set search_path = public
as $$
  with stu as (
    select s.id from public.students s
    where s.school_id = public.my_school_id() and s.is_active and public.staff_allowed_section(s.section_id)
  ),
  per as (
    select distinct on (ar.student_id, ar.date, ar.period)
      ar.student_id, ar.date, ar.period, ar.status::text as status
    from public.attendance_records ar
    join stu on stu.id = ar.student_id
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
security definer
set search_path = public
as $$
  with stu as (
    select s.id, s.section_id from public.students s
    where s.school_id = public.my_school_id() and s.is_active and s.section_id is not null
      and public.staff_allowed_section(s.section_id)
  ),
  sec_total as (
    select section_id, count(*) as n from stu group by section_id
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
  )
  select
    (select count(*) from cnt join sec_total st on st.section_id = cnt.section_id
      where cnt.period between 1 and p_periods and cnt.c >= st.n),
    (select count(*) from sec_total) * p_periods::bigint,
    (select count(distinct per.student_id) from per where per.status = 'absent');
$$;

-- the "latest attendance activity" list on the dashboard (newest records first)
create or replace function public.dashboard_recent(p_limit integer default 5)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(r order by r.created_at desc nulls last), '[]'::jsonb)
  from (
    select x.status, x.date, x.created_at,
      jsonb_build_object(
        'name_ar', s.name_ar, 'name_en', s.name_en,
        'sections', jsonb_build_object(
          'grade_name', sec.grade_name, 'grade_name_en', sec.grade_name_en,
          'section_name', sec.section_name, 'stream', sec.stream, 'section_number', sec.section_number)
      ) as students
    from (
      select ar.student_id, ar.status, ar.date, ar.created_at
      from public.attendance_records ar
      where ar.school_id = public.my_school_id()
      order by ar.created_at desc nulls last
      limit 60
    ) x
    join public.students s on s.id = x.student_id
    left join public.sections sec on sec.id = s.section_id
    where public.staff_allowed_section(s.section_id)
    order by x.created_at desc nulls last
    limit p_limit
  ) r;
$$;

revoke all on function public.student_attendance_summary(date, date) from public, anon;
revoke all on function public.dashboard_absence_series(date, date) from public, anon;
revoke all on function public.dashboard_today(date, integer) from public, anon;
revoke all on function public.dashboard_recent(integer) from public, anon;
grant execute on function public.student_attendance_summary(date, date) to authenticated;
grant execute on function public.dashboard_absence_series(date, date) to authenticated;
grant execute on function public.dashboard_today(date, integer) to authenticated;
grant execute on function public.dashboard_recent(integer) to authenticated;

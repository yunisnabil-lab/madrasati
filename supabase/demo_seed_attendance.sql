-- Demo data for presentations: attendance for the last ~3 weeks on the EXISTING students.
-- Insert-only (skips any student/date/period that already has a record) and every row
-- gets created_at = 2000-01-01, so demo_reset.sql can remove exactly these rows later.
-- Run it twice (it is big): once with the OLDER range, once with the NEWER range —
-- change the two numbers marked "RANGE" below:
--   run 1:  current_date - 20  ..  current_date - 11
--   run 2:  current_date - 10  ..  current_date

with cfg as (
  select (select id from staff where role = 'admin' order by created_at limit 1) as admin_id
),
days as (
  select g.d::date as d
  from generate_series(current_date - 20, current_date - 11, interval '1 day') as g(d)   -- RANGE
  where extract(isodow from g.d) not in (6, 7)
),
last_day as (
  select max(g.d::date) as d
  from generate_series(current_date - 6, current_date, interval '1 day') as g(d)
  where extract(isodow from g.d) not in (6, 7)
),
sec_hash as (
  select id as section_id, (hashtext(id::text) & 2147483647) as h from sections
)
insert into attendance_records (id, school_id, student_id, date, status, recorded_by, created_at, period)
select gen_random_uuid(), s.school_id, s.id, dy.d, x.status,
       (select admin_id from cfg), timestamptz '2000-01-01 00:00:00+00', p.p
from students s
join sec_hash sh on sh.section_id = s.section_id
cross join days dy
cross join lateral generate_series(1, case when extract(isodow from dy.d) = 5 then 4 else 8 end) as p(p)
cross join lateral (
  select (hashtext(s.id::text || dy.d::text) & 2147483647) % 1000 as dr,
         (hashtext(s.id::text || dy.d::text || p.p::text) & 2147483647) % 1000 as rp,
         ((hashtext(s.id::text) & 2147483647) % 40 = 0) as chronic
) h
cross join lateral (
  select case
    when h.dr < (case when h.chronic then 260 else 40 end) then 'absent'
    when h.dr < (case when h.chronic then 260 else 40 end) + 15 and p.p >= 6 then 'absent'
    when h.rp < 8 then 'late'
    when h.rp < 18 then 'excused'
    else 'present'
  end as status
) x
where s.is_active
  -- on the latest school day, a quarter of the sections are only partly recorded
  and not (dy.d = (select d from last_day) and sh.h % 4 = 0 and p.p > 2)
  and not exists (
    select 1 from attendance_records a
    where a.student_id = s.id and a.date = dy.d and a.period = p.p
  );

-- Removes ONLY the demo rows made by demo_seed_attendance.sql and demo_seed_other.sql
-- (they are the rows whose created_at is exactly 2000-01-01 00:00:00 UTC).
-- Real records are never created with that timestamp, so they are not touched.
-- First run the "count" block to see what will be removed; then run the delete block.

-- count (read only)
select 'attendance_records' as tbl, count(*) from attendance_records where created_at = timestamptz '2000-01-01 00:00:00+00'
union all select 'behavior_violations', count(*) from behavior_violations where created_at = timestamptz '2000-01-01 00:00:00+00'
union all select 'morning_lateness', count(*) from morning_lateness where created_at = timestamptz '2000-01-01 00:00:00+00'
union all select 'contact_requests', count(*) from contact_requests where created_at = timestamptz '2000-01-01 00:00:00+00';

-- delete
-- begin;
-- delete from contact_requests   where created_at = timestamptz '2000-01-01 00:00:00+00';
-- delete from morning_lateness   where created_at = timestamptz '2000-01-01 00:00:00+00';
-- delete from behavior_violations where created_at = timestamptz '2000-01-01 00:00:00+00';
-- delete from attendance_records where created_at = timestamptz '2000-01-01 00:00:00+00';
-- commit;

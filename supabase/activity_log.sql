-- سجل نشاط الموظفين (Activity log)
-- بيتسجل من قاعدة البيانات نفسها (تريجرز)، فمفيش طريقة لتجاوزه من الموقع.
-- الأدمن بس هو اللي يقرأ السجل. شغّله مرة واحدة في Supabase SQL Editor.

begin;

create table if not exists public.activity_log (
  id bigint generated always as identity primary key,
  school_id uuid not null,
  staff_id uuid,
  actor_name text,
  action text not null,
  entity text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_log_school_created_idx on public.activity_log (school_id, created_at desc);
create index if not exists activity_log_staff_created_idx on public.activity_log (staff_id, created_at desc);

alter table public.activity_log enable row level security;

drop policy if exists "admin reads activity log" on public.activity_log;
create policy "admin reads activity log"
  on public.activity_log for select
  using (school_id = my_school_id() and get_my_staff_role() = 'admin');
-- مفيش سياسة insert/update/delete: مفيش حد يكتب أو يمسح من الموقع، التسجيل بس من التريجرز

-- ---------- دالة التسجيل ----------
create or replace function public.log_activity(p_action text, p_entity text, p_details jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_school uuid;
  v_name text;
begin
  if v_uid is null then return; end if;  -- تغييرات من SQL Editor مش بتتسجل
  select school_id, full_name into v_school, v_name from staff where id = v_uid;
  if v_school is null then return; end if;
  insert into activity_log (school_id, staff_id, actor_name, action, entity, details)
  values (v_school, v_uid, v_name, p_action, p_entity, coalesce(p_details, '{}'::jsonb));
end;
$$;
revoke all on function public.log_activity(text, text, jsonb) from public, anon, authenticated;

-- ---------- الحضور (سطر واحد لكل حفظ، مش لكل طالب) ----------
create or replace function public.trg_log_attendance_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare d jsonb;
begin
  select jsonb_build_object(
    'date', min(n.date), 'period', min(n.period), 'count', count(*),
    'present', count(*) filter (where n.status = 'present'),
    'absent', count(*) filter (where n.status = 'absent'),
    'late', count(*) filter (where n.status = 'late'),
    'excused', count(*) filter (where n.status = 'excused'),
    'sections', (
      select coalesce(jsonb_agg(distinct sec.section_name), '[]'::jsonb)
      from students st join sections sec on sec.id = st.section_id
      where st.id in (select student_id from new_rows)
    )
  ) into d from new_rows n;
  if (d->>'count')::int > 0 then perform log_activity('attendance_save', 'attendance', d); end if;
  return null;
end;
$$;

create or replace function public.trg_log_attendance_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare d jsonb;
begin
  with ch as (
    select st.name_ar as student, o.status as from_s, n.status as to_s, n.date as dt, n.period as pr,
           row_number() over () as rn
    from old_rows o
    join new_rows n on n.id = o.id
    join students st on st.id = n.student_id
    where o.status is distinct from n.status
  )
  select jsonb_build_object(
    'count', (select count(*) from ch),
    'changes', coalesce((select jsonb_agg(jsonb_build_object('student', student, 'from', from_s, 'to', to_s, 'date', dt, 'period', pr)) from ch where rn <= 10), '[]'::jsonb)
  ) into d;
  if (d->>'count')::int > 0 then perform log_activity('attendance_change', 'attendance', d); end if;
  return null;
end;
$$;

create or replace function public.trg_log_attendance_delete()
returns trigger language plpgsql security definer set search_path = public as $$
declare d jsonb;
begin
  select jsonb_build_object('count', count(*), 'date', min(o.date), 'period', min(o.period))
  into d from old_rows o;
  if (d->>'count')::int > 0 then perform log_activity('attendance_delete', 'attendance', d); end if;
  return null;
end;
$$;

drop trigger if exists log_attendance_insert on public.attendance_records;
create trigger log_attendance_insert after insert on public.attendance_records
  referencing new table as new_rows for each statement execute function public.trg_log_attendance_insert();

drop trigger if exists log_attendance_update on public.attendance_records;
create trigger log_attendance_update after update on public.attendance_records
  referencing old table as old_rows new table as new_rows for each statement execute function public.trg_log_attendance_update();

drop trigger if exists log_attendance_delete on public.attendance_records;
create trigger log_attendance_delete after delete on public.attendance_records
  referencing old table as old_rows for each statement execute function public.trg_log_attendance_delete();

-- ---------- المخالفات ----------
create or replace function public.trg_log_violation()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text; r public.behavior_violations;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  select name_ar into v_name from students where id = r.student_id;
  if tg_op = 'INSERT' then
    perform log_activity('violation_add', 'violation', jsonb_build_object('student', v_name, 'type', r.violation_type, 'status', r.status));
  elsif tg_op = 'UPDATE' then
    if old.status is distinct from new.status then
      perform log_activity('violation_review', 'violation', jsonb_build_object('student', v_name, 'type', r.violation_type, 'from', old.status, 'to', new.status));
    end if;
  else
    perform log_activity('violation_delete', 'violation', jsonb_build_object('student', v_name, 'type', r.violation_type));
  end if;
  return null;
end;
$$;

drop trigger if exists log_violation on public.behavior_violations;
create trigger log_violation after insert or update or delete on public.behavior_violations
  for each row execute function public.trg_log_violation();

-- ---------- التأخير الصباحي ----------
create or replace function public.trg_log_lateness()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text; r public.morning_lateness;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  select name_ar into v_name from students where id = r.student_id;
  perform log_activity(case when tg_op = 'DELETE' then 'lateness_delete' else 'lateness_add' end, 'lateness',
    jsonb_build_object('student', v_name, 'date', r.date));
  return null;
end;
$$;

drop trigger if exists log_lateness on public.morning_lateness;
create trigger log_lateness after insert or delete on public.morning_lateness
  for each row execute function public.trg_log_lateness();

-- ---------- الطلاب ----------
create or replace function public.trg_log_student()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform log_activity('student_add', 'student', jsonb_build_object('student', new.name_ar));
  elsif tg_op = 'DELETE' then
    perform log_activity('student_delete', 'student', jsonb_build_object('student', old.name_ar));
  elsif old.is_active is distinct from new.is_active then
    perform log_activity(case when new.is_active then 'student_restore' else 'student_deactivate' end, 'student', jsonb_build_object('student', new.name_ar));
  end if;
  return null;
end;
$$;

drop trigger if exists log_student on public.students;
create trigger log_student after insert or update or delete on public.students
  for each row execute function public.trg_log_student();

-- ---------- تغييرات الموظفين (الدور والحالة) ----------
create or replace function public.trg_log_staff_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.role::text is distinct from new.role::text or old.status::text is distinct from new.status::text then
    perform log_activity('staff_change', 'staff', jsonb_build_object(
      'staff', new.full_name, 'role_from', old.role::text, 'role_to', new.role::text,
      'status_from', old.status::text, 'status_to', new.status::text));
  end if;
  return null;
end;
$$;

drop trigger if exists log_staff_change on public.staff;
create trigger log_staff_change after update on public.staff
  for each row execute function public.trg_log_staff_change();

-- ---------- التواصل مع أولياء الأمور ----------
create or replace function public.trg_log_parent_contact()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  select name_ar into v_name from students where id = new.student_id;
  perform log_activity('parent_contact', 'contact', jsonb_build_object('student', v_name, 'channel', new.channel, 'context', new.context));
  return null;
end;
$$;

drop trigger if exists log_parent_contact on public.parent_contacts;
create trigger log_parent_contact after insert on public.parent_contacts
  for each row execute function public.trg_log_parent_contact();

-- ---------- ملخص الموظفين: آخر دخول ونشاط آخر 7 أيام (للأدمن بس) ----------
create or replace function public.staff_activity_summary()
returns table (staff_id uuid, full_name text, role text, last_sign_in_at timestamptz, actions_7d bigint, last_action_at timestamptz)
language sql
security definer
set search_path = public, auth
as $$
  select s.id, s.full_name, s.role::text, u.last_sign_in_at,
         (select count(*) from activity_log a where a.staff_id = s.id and a.created_at > now() - interval '7 days'),
         (select max(a.created_at) from activity_log a where a.staff_id = s.id)
  from staff s
  left join auth.users u on u.id = s.id
  where s.school_id = my_school_id()
    and get_my_staff_role() = 'admin'
    and s.status::text = 'approved'
  order by u.last_sign_in_at desc nulls last;
$$;
revoke all on function public.staff_activity_summary() from public, anon;
grant execute on function public.staff_activity_summary() to authenticated;

commit;

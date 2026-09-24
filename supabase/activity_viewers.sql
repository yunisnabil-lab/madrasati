-- صلاحية مشاهدة نشاط الموظفين للإداريين (الأدمن يحدد لكل إداري مين يقدر يشوف نشاطه)
-- شغّله مرة واحدة في Supabase SQL Editor، بعد ما تكون شغّلت supabase/activity_log.sql

begin;

create table if not exists public.activity_viewers (
  id bigint generated always as identity primary key,
  school_id uuid not null,
  viewer_id uuid not null,   -- الإداري
  target_id uuid not null,   -- الموظف اللي يقدر الإداري يشوف نشاطه
  created_at timestamptz not null default now(),
  unique (viewer_id, target_id)
);

create index if not exists activity_viewers_viewer_idx on public.activity_viewers (viewer_id);

alter table public.activity_viewers enable row level security;

drop policy if exists "admin manages activity viewers" on public.activity_viewers;
create policy "admin manages activity viewers"
  on public.activity_viewers for all
  using (school_id = my_school_id() and get_my_staff_role() = 'admin')
  with check (school_id = my_school_id() and get_my_staff_role() = 'admin');

drop policy if exists "viewer sees own grants" on public.activity_viewers;
create policy "viewer sees own grants"
  on public.activity_viewers for select
  using (viewer_id = auth.uid());

-- السجل: الأدمن يقرأ الكل، والإداري يقرأ نشاط الموظفين اللي الأدمن حدده له بس
drop policy if exists "admin reads activity log" on public.activity_log;
drop policy if exists "read activity log" on public.activity_log;
create policy "read activity log"
  on public.activity_log for select
  using (
    school_id = my_school_id()
    and (
      get_my_staff_role() = 'admin'
      or (
        get_my_staff_role() = 'edari'
        and exists (
          select 1 from public.activity_viewers v
          where v.viewer_id = auth.uid() and v.target_id = activity_log.staff_id
        )
      )
    )
  );

-- ملخص الموظفين (آخر دخول + عدد الإجراءات): نفس القاعدة
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
    and s.status::text = 'approved'
    and (
      get_my_staff_role() = 'admin'
      or (
        get_my_staff_role() = 'edari'
        and s.id in (select v.target_id from activity_viewers v where v.viewer_id = auth.uid())
      )
    )
  order by u.last_sign_in_at desc nulls last;
$$;
revoke all on function public.staff_activity_summary() from public, anon;
grant execute on function public.staff_activity_summary() to authenticated;

commit;

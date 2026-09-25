-- Dashboard numbers that follow the viewer's scope: admin and viewer see the whole
-- school; a teacher, supervisor or edari sees only the sections linked to them
-- (students in those sections, the other staff working in them, the sections
-- themselves). Read-only function, changes no data. Safe to run more than once.

create or replace function public.dashboard_counts()
returns table (students bigint, staff_count bigint, sections bigint)
language sql stable security definer set search_path = public as $$
  with me as (
    select auth.uid() as uid, get_my_staff_role() as role, my_school_id() as sid
  ),
  my_secs as (
    select s.id
    from sections s, me
    where s.school_id = me.sid
      and (
        me.role in ('admin', 'viewer')
        or exists (select 1 from staff_sections ss where ss.section_id = s.id and ss.staff_id = me.uid)
      )
  )
  select
    (select count(*) from students st where st.is_active and st.section_id in (select id from my_secs)),
    (select count(*) from staff f, me
       where f.status::text = 'approved'
         and f.school_id = me.sid
         and (
           me.role in ('admin', 'viewer')
           or (f.id <> me.uid
               and exists (select 1 from staff_sections ss
                           where ss.staff_id = f.id and ss.section_id in (select id from my_secs)))
         )),
    (select count(*) from my_secs);
$$;

revoke all on function public.dashboard_counts() from public, anon;
grant execute on function public.dashboard_counts() to authenticated;

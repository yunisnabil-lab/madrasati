-- Demo data for presentations, part 2: behaviour violations, morning lateness and
-- parent-contact requests on the EXISTING students. Insert-only; every row gets
-- created_at = 2000-01-01 so demo_reset.sql can remove exactly these rows later.
-- Parent e-mails in contact requests are the students' own placeholder addresses
-- (example.com), so nothing real can be sent.

begin;

create temp table _seed_days on commit drop as
select g.d::date as d, row_number() over (order by g.d) as rn
from generate_series(current_date - 20, current_date, interval '1 day') as g(d)
where extract(isodow from g.d) not in (6, 7);

create temp table _seed_students on commit drop as
select id, school_id, parent_email,
       row_number() over (order by hashtext(id::text), id) as rn
from students
where is_active;

create temp table _seed_cfg on commit drop as
select (select id from staff where role = 'admin' order by created_at limit 1) as admin_id;

-- 1) behaviour violations (about 90; a few students have two)
insert into behavior_violations
  (id, school_id, student_id, staff_id, violation_type, description, date, created_at, period,
   teacher_action, supervisor_action, status, reviewed_by, reviewed_at)
select gen_random_uuid(), st.school_id, st.id, (select admin_id from _seed_cfg),
       vt.t,
       case vt.t
         when 'fighting'    then 'شجار مع زميل أثناء الفسحة'
         when 'phone'       then 'استخدام الهاتف المحمول داخل الحصة'
         when 'no_homework' then 'عدم إحضار الواجب المنزلي للمرة الثانية'
         when 'disrespect'  then 'رفع الصوت على المعلم وعدم الالتزام بالتعليمات'
         when 'uniform'     then 'عدم الالتزام بالزي المدرسي'
         when 'bullying'    then 'مضايقة زميل بالكلام أمام الطلاب'
         else 'إخلال بنظام الطابور الصباحي'
       end,
       dy.d, timestamptz '2000-01-01 00:00:00+00', 1 + g.g % 4,
       case g.g % 3 when 0 then 'تنبيه شفهي للطالب' when 1 then 'إبلاغ المشرف' else null end,
       case when stt.status = 'approved' then
         (array['استدعاء ولي الأمر', 'تعهد خطي من الطالب', 'إنذار شفهي', 'حرمان من الفسحة ليوم'])[1 + g.g % 4]
       else null end,
       stt.status,
       case when stt.status = 'pending' then null else (select admin_id from _seed_cfg) end,
       case when stt.status = 'pending' then null else dy.d::timestamptz + interval '13 hours' end
from generate_series(1, 90) as g(g)
join _seed_students st on st.rn = 1 + (g.g * 7) % 55
join _seed_days dy on dy.rn = 1 + (g.g * 3) % (select count(*) from _seed_days)
cross join lateral (
  select (array['phone','phone','uniform','uniform','no_homework','no_homework','disrespect','disrespect','fighting','bullying','other'])[1 + (g.g * 3) % 11] as t
) vt
cross join lateral (
  select case when g.g % 8 in (0, 1) then 'pending' when g.g % 17 = 0 then 'rejected' else 'approved' end as status
) stt;

-- 2) morning lateness (160 rows, about 70 students late more than once)
insert into morning_lateness (id, school_id, student_id, staff_id, date, description, created_at)
select gen_random_uuid(), st.school_id, st.id, (select admin_id from _seed_cfg), dy.d,
       (array['تأخر عن الطابور الصباحي', 'وصل بعد بدء الحصة الأولى', 'تأخر بسبب المواصلات', 'تأخر بدون عذر'])[1 + g.g % 4],
       timestamptz '2000-01-01 00:00:00+00'
from generate_series(1, 160) as g(g)
join _seed_students st on st.rn = 100 + (g.g * 11) % 90
join _seed_days dy on dy.rn = 1 + (g.g * 7 + g.g / 90) % (select count(*) from _seed_days);

-- 3) parent-contact requests (20: 6 waiting, 12 approved, 2 rejected)
insert into contact_requests
  (id, school_id, student_id, requested_by, channel, recipient, message, status, reviewed_by, reviewed_at, created_at)
select gen_random_uuid(), st.school_id, st.id, (select admin_id from _seed_cfg),
       case when g.g % 2 = 0 then 'email' else 'whatsapp' end,
       case when g.g % 2 = 0 then st.parent_email else '0500000000' end,
       (array[
         'نود إبلاغكم بتكرار غياب الطالب في الأيام الماضية، ونرجو التواصل مع إدارة المجمع لمعرفة السبب.',
         'نلفت انتباهكم إلى تأخر الطالب المتكرر عن الطابور الصباحي، ونرجو متابعته في المنزل.',
         'نود إبلاغكم بتسجيل مخالفة سلوكية على الطالب، ونرجو التواصل مع إدارة المجمع.',
         'نشكركم على تعاونكم، ونود إبلاغكم بتحسّن انتظام الطالب في الحضور.'
       ])[1 + g.g % 4],
       case when g.g <= 6 then 'pending' when g.g in (7, 15) then 'rejected' else 'approved' end,
       case when g.g <= 6 then null else (select admin_id from _seed_cfg) end,
       case when g.g <= 6 then null else now() - (g.g || ' hours')::interval end,
       timestamptz '2000-01-01 00:00:00+00'
from generate_series(1, 20) as g(g)
join _seed_students st on st.rn = 200 + g.g * 13;

commit;

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fetchAllRows } from '../lib/fetchAll';
import { exportXlsxSheets } from '../lib/exportXlsx';
import { sectionLabel } from '../lib/sections';
import { cardFloating } from '../lib/theme';
import { useDialogs } from '../lib/Dialogs';

const SEC = 'sections(grade_name, grade_name_en, section_name, stream, section_number)';

function todayStr() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
// start of the current school year (1 August)
function yearStartStr() {
  const d = new Date();
  const y = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-08-01`;
}

// Admin-only: download the school's data as Excel files, as a safety copy.
export default function BackupExport({ t, lang, dark }) {
  const { notify } = useDialogs();
  const [busy, setBusy] = useState(false);
  const [from, setFrom] = useState(yearStartStr());
  const [to, setTo] = useState(todayStr());
  const ar = lang === 'ar';

  const secText = (s) => (s ? sectionLabel(s, lang) : '');

  const jobs = {
    students: {
      label: t.backupStudents,
      run: async () => {
        const { data, error } = await fetchAllRows(() => supabase.from('students')
          .select(`sis_no, name_ar, name_en, email, parent_email, is_active, ${SEC}`).order('id'));
        if (error) throw error;
        return [
          [ar ? 'رقم الطالب' : 'Student ID', ar ? 'الاسم بالعربي' : 'Arabic name', ar ? 'الاسم بالإنجليزي' : 'English name', ar ? 'الصف والشعبة' : 'Grade & section', ar ? 'إيميل الطالب' : 'Student email', ar ? 'إيميل ولي الأمر' : 'Parent email', ar ? 'نشط' : 'Active'],
          ...data.map((s) => [s.sis_no, s.name_ar, s.name_en, secText(s.sections), s.email || '', s.parent_email || '', s.is_active ? (ar ? 'نعم' : 'Yes') : (ar ? 'لا' : 'No')]),
        ];
      },
    },
    violations: {
      label: t.backupViolations,
      run: async () => {
        const { data, error } = await fetchAllRows(() => supabase.from('behavior_violations')
          .select(`date, period, violation_type, status, description, teacher_action, supervisor_action, students!behavior_violations_student_id_fkey(sis_no, name_ar, ${SEC}), staff(full_name)`).order('id'));
        if (error) throw error;
        return [
          [ar ? 'التاريخ' : 'Date', ar ? 'الحصة' : 'Period', ar ? 'رقم الطالب' : 'Student ID', ar ? 'الطالب' : 'Student', ar ? 'الصف والشعبة' : 'Grade & section', ar ? 'نوع المخالفة' : 'Type', ar ? 'الحالة' : 'Status', ar ? 'التفاصيل' : 'Details', ar ? 'إجراء المعلم' : 'Teacher action', ar ? 'إجراء المشرف' : 'Supervisor action', ar ? 'سجّلها' : 'Recorded by'],
          ...data.map((v) => [v.date, v.period || '', v.students?.sis_no || '', v.students?.name_ar || '', secText(v.students?.sections), t.violationTypeNames[v.violation_type] || v.violation_type, v.status, v.description || '', v.teacher_action || '', v.supervisor_action || '', v.staff?.full_name || '']),
        ];
      },
    },
    lateness: {
      label: t.backupLateness,
      run: async () => {
        const { data, error } = await fetchAllRows(() => supabase.from('morning_lateness')
          .select(`date, description, students(sis_no, name_ar, ${SEC}), staff(full_name)`).order('id'));
        if (error) throw error;
        return [
          [ar ? 'التاريخ' : 'Date', ar ? 'رقم الطالب' : 'Student ID', ar ? 'الطالب' : 'Student', ar ? 'الصف والشعبة' : 'Grade & section', ar ? 'ملاحظات' : 'Notes', ar ? 'سجّلها' : 'Recorded by'],
          ...data.map((l) => [l.date, l.students?.sis_no || '', l.students?.name_ar || '', secText(l.students?.sections), l.description || '', l.staff?.full_name || '']),
        ];
      },
    },
    attendance: {
      label: t.backupAttendance,
      run: async () => {
        const { data, error } = await fetchAllRows(() => supabase.from('attendance_records')
          .select(`date, period, status, students(sis_no, name_ar, ${SEC})`).gte('date', from).lte('date', to).order('id'));
        if (error) throw error;
        const status = { present: ar ? 'حاضر' : 'Present', absent: ar ? 'غائب' : 'Absent', late: ar ? 'متأخر' : 'Late', excused: ar ? 'إذن' : 'Excused' };
        return [
          [ar ? 'التاريخ' : 'Date', ar ? 'الحصة' : 'Period', ar ? 'رقم الطالب' : 'Student ID', ar ? 'الطالب' : 'Student', ar ? 'الصف والشعبة' : 'Grade & section', ar ? 'الحالة' : 'Status'],
          ...data.map((r) => [r.date, r.period ?? '', r.students?.sis_no || '', r.students?.name_ar || '', secText(r.students?.sections), status[r.status] || r.status]),
        ];
      },
    },
  };

  const download = async () => {
    setBusy(true);
    try {
      const names = ar
        ? { students: 'الطلاب', violations: 'المخالفات', lateness: 'التأخير الصباحي', attendance: 'الحضور' }
        : { students: 'Students', violations: 'Violations', lateness: 'Morning lateness', attendance: 'Attendance' };
      const sheets = [];
      let total = 0;
      for (const key of ['students', 'violations', 'lateness', 'attendance']) {
        const rows = await jobs[key].run();
        total += rows.length - 1;
        sheets.push({ name: names[key], rows });
      }
      exportXlsxSheets(`madrasati-backup-${todayStr()}.xlsx`, sheets, { lang });
      notify(t.backupDone.replace('{n}', total), 'success');
    } catch {
      notify(t.backupError, 'error');
    }
    setBusy(false);
  };

  const inputCls = `rounded-lg px-3 py-2 text-sm outline-none border font-en ${dark ? 'bg-navy border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'}`;
  const btnCls = `flex items-center gap-2 text-sm font-medium px-4 py-2.5 rounded-lg border disabled:opacity-60 ${dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`;

  return (
    <div className={cardFloating(dark, 'p-5 mb-6')}>
      <h3 className={`text-sm font-semibold mb-1 ${dark ? 'text-white' : 'text-slate-900'}`}>{t.backupTitle}</h3>
      <p className={`text-xs mb-4 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.backupSub}</p>

      <div className="flex flex-wrap items-end gap-2.5">
        <div>
          <label className={`block text-xs font-medium mb-1.5 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.backupAttFrom}</label>
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={`block text-xs font-medium mb-1.5 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.backupAttTo}</label>
          <input type="date" value={to} min={from} max={todayStr()} onChange={(e) => setTo(e.target.value)} className={inputCls} />
        </div>
        <button onClick={download} disabled={busy || !from || !to} className={`${btnCls} bg-royal text-white border-royal hover:bg-royal-light`}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} {busy ? t.backupBusy : t.backupAll}
        </button>
      </div>
    </div>
  );
}

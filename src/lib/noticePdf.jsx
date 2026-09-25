import { supabase } from './supabase';
import { PrintSheet, PrintTable } from '../components/PrintSheet';
import { reportName } from './print';
import { sheetToPdfBase64 } from './pdfReport';

function todayStr() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// The PDF that goes with a behaviour / lateness message to a parent: the
// student's details and the list of recorded cases, in the same print layout
// as the reports. kind: 'violation' (approved violations) | 'lateness'.
// Returns { filename, contentBase64 } for the send-report-email function.
export async function buildNoticePdf({ kind, studentId, name, sisNo, sectionLabel, t, lang }) {
  let rows;
  let columns;
  let title;
  let countLabel;

  if (kind === 'violation') {
    const { data, error } = await supabase
      .from('behavior_violations')
      .select('id, violation_type, description, date, supervisor_action')
      .eq('student_id', studentId)
      .eq('status', 'approved')
      .order('date', { ascending: false })
      .limit(100);
    if (error) throw error;
    rows = data || [];
    title = t.noticeViolationTitle;
    countLabel = t.noticeViolationCount;
    columns = [
      { label: t.dateLabel, width: '78px', className: 'font-en', render: (r) => r.date },
      { label: t.colIncidentType, width: '130px', render: (r) => (t.violationTypeNames && t.violationTypeNames[r.violation_type]) || r.violation_type },
      { label: t.colDetail, render: (r) => r.description || '—' },
      { label: t.colActionTaken, render: (r) => r.supervisor_action || '—' },
    ];
  } else {
    const { data, error } = await supabase
      .from('morning_lateness')
      .select('id, date, description')
      .eq('student_id', studentId)
      .order('date', { ascending: false })
      .limit(100);
    if (error) throw error;
    rows = data || [];
    title = t.noticeLatenessTitle;
    countLabel = t.noticeLatenessCount;
    columns = [
      { label: t.dateLabel, width: '90px', className: 'font-en', render: (r) => r.date },
      { label: t.colDetail, render: (r) => r.description || '—' },
    ];
  }

  const { renderToStaticMarkup } = await import('react-dom/server');
  const html = renderToStaticMarkup(
    <PrintSheet
      t={t}
      lang={lang}
      title={`${title} — ${name}`}
      meta={[
        [t.colStudentName, name],
        [t.colStudentNo, sisNo],
        [t.colGradeSection, sectionLabel],
      ]}
      stats={[{ label: countLabel, value: rows.length }]}
      signatures={[t.signGuardian, { text: t.signSchoolAdmin }]}
    >
      <PrintTable columns={columns} groups={[{ rows }]} />
    </PrintSheet>,
  );

  const holder = document.createElement('div');
  holder.innerHTML = html;
  const contentBase64 = await sheetToPdfBase64(holder.querySelector('.ps-sheet'));
  return { filename: `${reportName(title, name, todayStr())}.pdf`, contentBase64 };
}

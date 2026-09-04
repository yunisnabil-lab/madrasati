import { distinctGrades, distinctStreams, sectionsFor, streamLabel } from '../lib/sections';

// Controlled cascading picker: grade -> stream (only if the grade has one) -> section number.
// Reports the resolved section_id via onChange(sectionId).
// If allowAll is true, an extra "all sections in this grade/stream" option appears
// (value: '__ALL__', combined with allSectionIds via onChange for convenience).
export default function SectionPicker({
  sections, lang, dark,
  grade, stream, sectionId,
  onGradeChange, onStreamChange, onSectionChange,
  allowAll = false,
  inputCls,
}) {
  const grades = distinctGrades(sections);
  const streams = grade ? distinctStreams(sections, grade) : [];
  const options = grade ? sectionsFor(sections, grade, streams.length ? stream : null) : [];

  const t = {
    chooseGrade: lang === 'ar' ? '— اختر الصف —' : '— Choose grade —',
    chooseStream: lang === 'ar' ? '— اختر المسار —' : '— Choose stream —',
    chooseSection: lang === 'ar' ? '— اختر الشعبة —' : '— Choose section —',
    section: lang === 'ar' ? 'شعبة' : 'Section',
    allSections: lang === 'ar' ? 'كل الشعب' : 'All sections',
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <select
        value={grade}
        onChange={(e) => onGradeChange(e.target.value)}
        className={inputCls}
      >
        <option value="">{t.chooseGrade}</option>
        {grades.map((g) => (
          <option key={g.grade_name} value={g.grade_name}>{(lang === 'en' && g.grade_name_en) ? g.grade_name_en : g.grade_name}</option>
        ))}
      </select>

      <select
        value={stream}
        onChange={(e) => onStreamChange(e.target.value)}
        disabled={!grade || streams.length === 0}
        className={`${inputCls} disabled:opacity-50`}
      >
        <option value="">{streams.length ? t.chooseStream : '—'}</option>
        {streams.map((s) => (
          <option key={s} value={s}>{streamLabel(s, lang)}</option>
        ))}
      </select>

      <select
        value={sectionId}
        onChange={(e) => onSectionChange(e.target.value)}
        disabled={!grade || (streams.length > 0 && !stream)}
        className={`${inputCls} disabled:opacity-50`}
      >
        <option value="">{t.chooseSection}</option>
        {allowAll && options.length > 0 && (
          <option value="__ALL__">{t.allSections}</option>
        )}
        {options.map((s) => (
          <option key={s.id} value={s.id}>{s.section_name ?? '—'}</option>
        ))}
      </select>
    </div>
  );
}

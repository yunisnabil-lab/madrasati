import { useEffect } from 'react';
import { distinctGrades, distinctStreams, sectionsFor, streamLabel, gradeLabel } from '../lib/sections';

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
  // Only a grade with an Advanced track needs a stream choice. Every other
  // grade is "General" (its sections may still be "General - 3rd Language"),
  // so the stream is shown fixed and all its sections are listed right away.
  const needsStream = streams.some((s) => /advanced/i.test(s));
  const options = grade ? sectionsFor(sections, grade, needsStream ? stream : null) : [];

  // A grade whose only track is Advanced: select it automatically instead of
  // making the user open a dropdown that has exactly one option.
  useEffect(() => {
    if (needsStream && streams.length === 1 && stream !== streams[0]) {
      onStreamChange(streams[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grade, needsStream && streams.length === 1 ? streams[0] : null]);

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
          <option key={g.grade_name} value={g.grade_name}>{gradeLabel(g.grade_name, g.grade_name_en, lang)}</option>
        ))}
      </select>

      {grade && !needsStream ? (
        <select value="General" disabled className={`${inputCls} disabled:opacity-70`}>
          <option value="General">{streamLabel('General', lang)}</option>
        </select>
      ) : (
        <select
          value={stream}
          onChange={(e) => onStreamChange(e.target.value)}
          disabled={!grade || streams.length <= 1}
          className={`${inputCls} disabled:opacity-50`}
        >
          <option value="">{streams.length ? t.chooseStream : '—'}</option>
          {streams.map((s) => (
            <option key={s} value={s}>{streamLabel(s, lang)}</option>
          ))}
        </select>
      )}

      <select
        value={sectionId}
        onChange={(e) => onSectionChange(e.target.value)}
        disabled={!grade || (needsStream && !stream)}
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

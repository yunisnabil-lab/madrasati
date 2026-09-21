import { STATUS_META } from '../lib/status';
import { PERIODS_PER_DAY } from '../lib/attendanceDerive';

// A compact row of period chips (1..PERIODS_PER_DAY), colored by that
// period's recorded status. An empty/unrecorded period shows as a plain
// outlined chip. Used anywhere we need to show which specific periods a
// student was marked absent/present/late/excused in for a given day.
export default function PeriodBreakdown({ periods, lang, dark }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {[...Array(PERIODS_PER_DAY)].map((_, i) => {
        const p = i + 1;
        const status = periods ? periods[p] : null;
        const meta = status ? STATUS_META[status] : null;
        return (
          <span
            key={p}
            title={`${lang === 'ar' ? 'الحصة' : 'Period'} ${p}${meta ? ' — ' : ''}`}
            className={`inline-flex items-center justify-center h-7 w-7 rounded-md text-[11px] font-semibold font-en border ${
              meta ? '' : (dark ? 'border-slate-700 text-slate-600' : 'border-slate-200 text-slate-300')
            }`}
            style={meta ? { backgroundColor: meta.color + '20', color: meta.color, borderColor: meta.color + '80' } : {}}
          >
            {p}
          </span>
        );
      })}
    </div>
  );
}

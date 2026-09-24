import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

// Shared chart blocks. The point of both: every number is written out in
// plain, readable text (never squeezed onto the drawing), so a chart looks
// right whatever the data, language or screen width.

// Ring with the total in the middle, and a legend list beside it giving each
// slice's name, value and share.
// data: [{ name, value, color }]
export function DonutChart({ data, dark, totalLabel }) {
  const items = data.filter((d) => d.value > 0);
  const total = items.reduce((n, d) => n + d.value, 0);
  const muted = dark ? 'text-slate-300' : 'text-slate-500';
  if (total === 0) return null;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-10">
      <div className="relative h-48 w-48 shrink-0" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={items} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={62} outerRadius={90} paddingAngle={items.length > 1 ? 3 : 0} stroke="none" startAngle={90} endAngle={-270}>
              {items.map((d) => <Cell key={d.name} fill={d.color} />)}
            </Pie>
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 10, border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,.15)', background: dark ? '#1e293b' : '#fff', color: dark ? '#e2e8f0' : '#1e293b' }}
              formatter={(v, n) => [v, n]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className={`text-3xl font-bold font-en leading-none ${dark ? 'text-white' : 'text-navy'}`}>{total.toLocaleString('en-US')}</div>
          {totalLabel && <div className={`text-xs mt-1.5 ${muted}`}>{totalLabel}</div>}
        </div>
      </div>

      <ul className="w-full sm:flex-1 space-y-2.5">
        {items.map((d) => (
          <li key={d.name} className="flex items-center gap-3 text-sm">
            <span className="h-3 w-3 rounded-full shrink-0" style={{ background: d.color }} />
            <span className="flex-1 min-w-0 truncate">{d.name}</span>
            <span className="font-bold font-en tabular-nums">{d.value.toLocaleString('en-US')}</span>
            <span className={`w-11 text-end text-xs font-en tabular-nums ${muted}`}>{Math.round((d.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Horizontal bars, one per row, with the value written at the end of the bar.
// data: [{ key, name, value, color }]
export function BarList({ data, dark }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="space-y-3.5">
      {data.map((d) => (
        <li key={d.key ?? d.name}>
          <div className="flex items-center justify-between text-sm mb-1.5">
            <span className={dark ? 'text-slate-200' : 'text-slate-600'}>{d.name}</span>
            <span className="font-bold font-en tabular-nums" style={{ color: d.color }}>{d.value.toLocaleString('en-US')}</span>
          </div>
          <div className={`h-2.5 rounded-full overflow-hidden ${dark ? 'bg-white/10' : 'bg-slate-100'}`}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${d.value > 0 ? Math.max(3, (d.value / max) * 100) : 0}%`, background: d.color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

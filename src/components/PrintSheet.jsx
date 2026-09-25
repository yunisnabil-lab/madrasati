import { printedNow } from '../lib/print';

// The printed / "Save as PDF" version of every report. It is a separate,
// print-only layout (hidden on screen), so what comes out on paper never
// depends on how the screen version is arranged: an official header, the
// key numbers, compact tables that repeat their header on every page, and
// signature lines. Fixed A4 portrait, small type, no wasted margins.
//
// <PrintSheet t lang title meta={[[label, value]]} stats={[{label, value, color}]} signatures={[label]}>
//   <PrintTable columns groups />
// </PrintSheet>
export function PrintSheet({ t, lang, title, meta = [], stats = [], signatures = [], children }) {
  return (
    <div className="ps-sheet hidden print:block text-black bg-white">
      <div className="ps-head">
        <div>
          <div className="ps-school">{t.school} — {t.schoolSub}</div>
          <div className="ps-muted">{t.printOfficialLine}</div>
        </div>
        <div className="ps-muted ps-end">{t.printedOn}: {printedNow(lang)}</div>
      </div>

      <h1 className="ps-title">{title}</h1>

      {meta.filter((m) => m[1]).length > 0 && (
        <div className="ps-meta">
          {meta.filter((m) => m[1]).map(([label, value]) => (
            <span key={label}><span className="ps-muted">{label}: </span><b>{value}</b></span>
          ))}
        </div>
      )}

      {stats.length > 0 && (
        <div className="ps-stats" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
          {stats.map((s) => (
            <div key={s.label} className="ps-stat" style={{ borderTopColor: s.color || '#0f1b3c' }}>
              <div className="ps-stat-value" style={{ color: s.color || '#0f1b3c' }}>{s.value}</div>
              <div className="ps-stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {children}

      {signatures.length > 0 && (
        <div className="ps-signs">
          {signatures.map((sig) => (
            typeof sig === 'string'
              ? <div key={sig} className="ps-sign"><span>{sig}:</span><i /></div>
              // { text }: an electronic signature — just the name, no line to sign
              : <div key={sig.text} className="ps-esign">{sig.text}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// A small heading between blocks inside a sheet.
export function PrintHeading({ children }) {
  return <h2 className="ps-h2">{children}</h2>;
}

// Coloured status label (present / absent / late ...).
export function StatusPill({ label, color }) {
  return <span className="ps-pill" style={{ background: color }}>{label}</span>;
}

// One table for a whole report. groups = [{ label?, rows }]: a group with a
// label starts with a shaded heading row (e.g. the section and its count) and
// its rows are numbered from 1 again.
// columns = [{ label, key? , render?(row, index), width?, align?: 'center', className? }]
export function PrintTable({ columns, groups, numbered = true }) {
  const cols = [
    ...(numbered ? [{ label: '#', width: '30px', align: 'center', numbered: true }] : []),
    ...columns,
  ];
  return (
    <table className="ps-table">
      <thead>
        <tr>
          {cols.map((c, i) => (
            <th key={i} style={{ width: c.width, textAlign: c.align === 'center' ? 'center' : 'start' }}>{c.label}</th>
          ))}
        </tr>
      </thead>
      {groups.map((g, gi) => (
        <tbody key={gi}>
          {g.label && (
            <tr className="ps-group"><td colSpan={cols.length}>{g.label}</td></tr>
          )}
          {g.rows.map((r, ri) => (
            <tr key={r.id ?? r.key ?? ri}>
              {cols.map((c, ci) => (
                <td key={ci} className={c.className} style={{ textAlign: c.align === 'center' ? 'center' : 'start' }}>
                  {c.numbered ? ri + 1 : c.render ? c.render(r, ri) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      ))}
    </table>
  );
}

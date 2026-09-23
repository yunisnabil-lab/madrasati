import { useState, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Printer, Download, Flag, PieChart as PieIcon, AlertTriangle, Clock3, Layers, Users } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useApp } from '../lib/AppContext';
import { supabase } from '../lib/supabase';
import { cardFloating, pageBg, skeleton } from '../lib/theme';
import { sectionLabel as fmtSectionLabel } from '../lib/sections';
import { fetchAllRows } from '../lib/fetchAll';
import { exportXlsx } from '../lib/exportXlsx';
import { VIOLATION_TYPE_KEYS } from '../lib/i18n';

const REPEAT_THRESHOLD = 3;
const VIOLATION_COLORS = ['#ee5d50', '#ffb800', '#8b5cf6', '#05cd99', '#3b82f6', '#f472b6', '#94a3b8'];

function todayStr() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function daysAgoStr(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function initials(name) {
  const parts = (name || '').trim().split(/\s+/);
  return ((parts[0] ? parts[0][0] : '') + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

export default function SupervisorReport() {
  const { t, lang, dark, staff } = useApp();

  const [fromDate, setFromDate] = useState(daysAgoStr(30));
  const [toDate, setToDate] = useState(todayStr());
  const [dateError, setDateError] = useState('');
  const [loading, setLoading] = useState(false);
  const [incidents, setIncidents] = useState(null);
  const [typeFilter, setTypeFilter] = useState('all'); // 'all' | 'violation' | 'lateness'

  const load = useCallback(async () => {
    if (!staff) return;
    if (fromDate > toDate) { setDateError(t.invalidDateRange); return; }
    setDateError('');
    setLoading(true);

    const [{ data: violRows }, { data: lateRows }] = await Promise.all([
      fetchAllRows(() => supabase
        .from('behavior_violations')
        .select('id, student_id, violation_type, description, date, created_at, students(name_ar, name_en, sections(grade_name, grade_name_en, section_name, stream, section_number, grade_order)), staff(full_name)')
        .gte('date', fromDate)
        .lte('date', toDate)),
      fetchAllRows(() => supabase
        .from('morning_lateness')
        .select('id, student_id, description, date, created_at, students(name_ar, name_en, sections(grade_name, grade_name_en, section_name, stream, section_number, grade_order)), staff(full_name)')
        .gte('date', fromDate)
        .lte('date', toDate)),
    ]);

    const violations = (violRows || []).map((v) => ({
      key: `v-${v.id}`,
      type: 'violation',
      studentId: v.student_id,
      violationType: v.violation_type,
      detail: t.violationTypeNames[v.violation_type] || v.violation_type,
      description: v.description,
      date: v.date,
      created_at: v.created_at,
      student: v.students,
      staffName: v.staff?.full_name,
    }));

    const lateness = (lateRows || []).map((l) => ({
      key: `l-${l.id}`,
      type: 'lateness',
      studentId: l.student_id,
      violationType: null,
      detail: t.incidentTypeLateness,
      description: l.description,
      date: l.date,
      created_at: l.created_at,
      student: l.students,
      staffName: l.staff?.full_name,
    }));

    const all = [...violations, ...lateness].sort((a, b) => {
      const d = b.date.localeCompare(a.date);
      return d !== 0 ? d : (b.created_at || '').localeCompare(a.created_at || '');
    });

    setIncidents(all);
    setLoading(false);
  }, [staff, fromDate, toDate, t]);

  const violations = useMemo(() => (incidents || []).filter((i) => i.type === 'violation'), [incidents]);
  const lateness = useMemo(() => (incidents || []).filter((i) => i.type === 'lateness'), [incidents]);

  const violationTypeCounts = useMemo(() => {
    const counts = {};
    violations.forEach((v) => { counts[v.violationType] = (counts[v.violationType] || 0) + 1; });
    return counts;
  }, [violations]);

  const topViolationType = useMemo(() => {
    const entries = Object.entries(violationTypeCounts);
    if (entries.length === 0) return null;
    entries.sort((a, b) => b[1] - a[1]);
    const [key, count] = entries[0];
    return { name: t.violationTypeNames[key] || key, count };
  }, [violationTypeCounts, t]);

  const repeatOffenders = useMemo(() => {
    if (!incidents) return [];
    const byStudent = new Map();
    incidents.forEach((i) => {
      if (!i.student || !i.studentId) return;
      const existing = byStudent.get(i.studentId);
      if (existing) {
        existing.count += 1;
        if (i.date > existing.lastDate) existing.lastDate = i.date;
      } else {
        byStudent.set(i.studentId, { id: i.studentId, student: i.student, count: 1, lastDate: i.date });
      }
    });
    return [...byStudent.values()].filter((r) => r.count >= REPEAT_THRESHOLD).sort((a, b) => b.count - a.count);
  }, [incidents]);

  const filteredIncidents = useMemo(() => {
    if (!incidents) return [];
    if (typeFilter === 'violation') return violations;
    if (typeFilter === 'lateness') return lateness;
    return incidents;
  }, [incidents, violations, lateness, typeFilter]);

  const kpiCards = [
    { label: t.kpiTotalIncidents, value: incidents ? incidents.length : '—', icon: Layers, accent: dark ? 'bg-royal/20 text-royal-light' : 'bg-royal/10 text-royal' },
    { label: t.kpiTotalViolations, value: incidents ? violations.length : '—', icon: AlertTriangle, accent: dark ? 'bg-rose-500/20 text-rose-400' : 'bg-rose-500/10 text-rose-600' },
    { label: t.kpiTotalLateness, value: incidents ? lateness.length : '—', icon: Clock3, accent: dark ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-500/10 text-amber-600' },
    { label: t.kpiFlaggedStudents, value: incidents ? repeatOffenders.length : '—', icon: Flag, accent: dark ? 'bg-gold/20 text-gold-light' : 'bg-gold/10 text-gold' },
    { label: t.kpiTopViolationType, value: topViolationType ? topViolationType.name : '—', icon: Users, accent: dark ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-500/10 text-emerald-600', small: true },
  ];

  const exportCsv = () => {
    const header = [t.colNo, t.colStudentName, t.colSection, 'Date', t.colIncidentType, t.colDetail, t.recordedBy];
    const body = filteredIncidents.map((r, i) => {
      const s = r.student || {};
      const name = lang === 'ar' ? (s.name_ar || s.name_en) : (s.name_en || s.name_ar);
      return [
        i + 1,
        name || '—',
        s.sections ? fmtSectionLabel(s.sections, lang) : '—',
        r.date,
        r.type === 'violation' ? t.incidentTypeViolation : t.incidentTypeLateness,
        r.type === 'violation' ? r.detail : (r.description || ''),
        r.staffName || '—',
      ];
    });
    exportXlsx(`supervisor-report-${fromDate}-to-${toDate}.xlsx`, [header, ...body], { lang });
  };

  const fmtDate = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US') : '—');

  const inputCls = `w-full rounded-lg px-3 py-2.5 text-sm outline-none border ${
    dark ? 'bg-navy border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'
  }`;

  const pieData = VIOLATION_TYPE_KEYS
    .map((key, i) => ({ name: t.violationTypeNames[key] || key, value: violationTypeCounts[key] || 0, color: VIOLATION_COLORS[i % VIOLATION_COLORS.length] }))
    .filter((d) => d.value > 0);

  const typeFilters = [
    { key: 'all', label: t.filterAll },
    { key: 'violation', label: t.incidentTypeViolation },
    { key: 'lateness', label: t.incidentTypeLateness },
  ];

  return (
    <div className={lang === 'ar' ? 'font-ar' : 'font-en'}>
      <div className={`min-h-screen transition-colors duration-300 ${pageBg(dark)} ${dark ? 'text-slate-100' : 'text-slate-800'}`}>
        <main className="max-w-6xl mx-auto px-5 py-7 print-area">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6 no-print">
            <h1 className={`text-2xl font-bold ${dark ? 'text-white' : 'text-navy'}`}>{t.supervisorReportTitle}</h1>
          </motion.div>

          <div className="print-only mb-4 text-black">
            <h1 className="text-lg font-bold">{t.school} — {t.schoolSub}</h1>
            <h2 className="text-base font-semibold mt-0.5">{t.supervisorReportTitle}</h2>
            <p className="text-sm mt-1">{t.fromDate}: {fromDate} — {t.toDate}: {toDate}</p>
          </div>

          <div className={cardFloating(dark, 'p-4 mb-5 no-print')}>
            <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
              <div className="flex-1">
                <label className={`block text-xs font-medium mb-1.5 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{t.fromDate}</label>
                <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={`${inputCls} font-en`} />
              </div>
              <div className="flex-1">
                <label className={`block text-xs font-medium mb-1.5 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{t.toDate}</label>
                <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={`${inputCls} font-en`} />
              </div>
              <button
                onClick={load}
                disabled={loading}
                className="text-sm font-medium px-5 py-2.5 rounded-lg bg-royal hover:bg-royal-light text-white transition-colors disabled:opacity-60 whitespace-nowrap"
              >
                {t.showReport}
              </button>
            </div>
            {dateError && <p className="text-xs text-rose-500 mt-2">{dateError}</p>}
          </div>

          {loading ? (
            <div className={cardFloating(dark, 'p-5 space-y-3')}>{[...Array(6)].map((_, i) => <div key={i} className={skeleton(dark, 'h-11 w-full')} />)}</div>
          ) : incidents === null ? (
            <div className={cardFloating(dark, 'p-10 text-center no-print')}>
              <p className={`text-sm ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{t.noReportYet}</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
                {kpiCards.map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <motion.div
                      key={item.label}
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, duration: 0.4 }}
                      className={`${cardFloating(dark)} p-5`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-[13px] font-medium ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{item.label}</span>
                        <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${item.accent}`}>
                          <Icon size={16} />
                        </div>
                      </div>
                      <div className={`mt-2.5 ${item.small ? 'text-lg' : 'text-3xl font-en'} font-bold tracking-tight ${dark ? 'text-white' : 'text-navy'}`}>
                        {item.value}
                        {item.label === t.kpiTopViolationType && topViolationType && (
                          <span className={`ms-1.5 text-xs font-medium font-en ${dark ? 'text-slate-500' : 'text-slate-400'}`}>({topViolationType.count})</span>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {pieData.length > 0 && (
                <div className={cardFloating(dark, 'p-5 mb-5 print-area')}>
                  <div className="flex items-center gap-2 mb-3">
                    <PieIcon size={15} className={dark ? 'text-slate-400' : 'text-slate-500'} />
                    <h3 className="text-sm font-semibold">{t.violationTypeBreakdownTitle}</h3>
                  </div>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}
                        label={({ name, value }) => `${name}: ${value}`}
                        labelLine={false}
                      >
                        {pieData.map((d) => <Cell key={d.name} fill={d.color} />)}
                      </Pie>
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className={cardFloating(dark, 'p-5 mb-5')}>
                <div className="flex items-center gap-2 mb-3">
                  <Flag size={16} className="text-rose-500" />
                  <h2 className={`text-sm font-semibold ${dark ? 'text-white' : 'text-slate-900'}`}>{t.repeatOffendersTitle}</h2>
                </div>
                {repeatOffenders.length === 0 ? (
                  <p className={`text-sm ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{t.noRepeatOffenders}</p>
                ) : (
                  <ul className={`divide-y ${dark ? 'divide-slate-800' : 'divide-slate-100'}`}>
                    {repeatOffenders.map((r) => {
                      const s = r.student;
                      const name = lang === 'ar' ? (s.name_ar || s.name_en) : (s.name_en || s.name_ar);
                      return (
                        <li key={r.id} className="flex items-center gap-3 py-3">
                          <div className="h-9 w-9 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0 text-xs font-semibold">
                            {initials(name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{name}</div>
                            <div className={`text-xs ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
                              {s.sections ? fmtSectionLabel(s.sections, lang) : '—'}
                            </div>
                          </div>
                          <div className="text-end shrink-0">
                            <div className="text-sm font-bold font-en text-rose-500">{r.count}</div>
                            <div className={`text-[11px] ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{t.lastLateDate}: {fmtDate(r.lastDate)}</div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 mb-3 no-print">
                <div className="flex flex-wrap gap-2">
                  {typeFilters.map((f) => (
                    <button
                      key={f.key}
                      onClick={() => setTypeFilter(f.key)}
                      className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                        typeFilter === f.key
                          ? 'bg-royal text-white border-transparent'
                          : dark ? 'border-slate-700 text-slate-400 hover:bg-white/5' : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={exportCsv} className={`flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-lg border ${dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}>
                    <Download size={13} /> {t.exportCsv}
                  </button>
                  <button onClick={() => window.print()} className={`flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-lg border ${dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}>
                    <Printer size={13} /> {t.printReport}
                  </button>
                </div>
              </div>

              <div className={cardFloating(dark, 'overflow-hidden')}>
                <div className="px-4 pt-4 pb-1 flex items-center justify-between">
                  <h2 className={`text-sm font-semibold ${dark ? 'text-white' : 'text-slate-900'}`}>{t.allIncidentsTitle}</h2>
                  <span className={`text-xs font-en ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{t.totalIncidentsCount.replace('{n}', filteredIncidents.length)}</span>
                </div>
                {filteredIncidents.length === 0 ? (
                  <div className="p-10 text-center"><p className={`text-sm ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{t.noIncidentsInRange}</p></div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className={`border-b text-xs ${dark ? 'border-slate-800 text-slate-500' : 'border-slate-100 text-slate-400'}`}>
                          <th className="text-start font-medium px-4 py-3">{t.colNo}</th>
                          <th className="text-start font-medium px-4 py-3">{t.colStudentName}</th>
                          <th className="text-start font-medium px-4 py-3 hidden sm:table-cell">{t.colSection}</th>
                          <th className="text-start font-medium px-4 py-3 font-en">{t.violationDate}</th>
                          <th className="text-start font-medium px-4 py-3">{t.colIncidentType}</th>
                          <th className="text-start font-medium px-4 py-3 hidden md:table-cell">{t.colDetail}</th>
                          <th className="text-start font-medium px-4 py-3 hidden lg:table-cell">{t.recordedBy}</th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${dark ? 'divide-slate-800/60' : 'divide-slate-100'}`}>
                        {filteredIncidents.map((r, i) => {
                          const s = r.student || {};
                          const name = lang === 'ar' ? (s.name_ar || s.name_en) : (s.name_en || s.name_ar);
                          const isViolation = r.type === 'violation';
                          return (
                            <tr key={r.key}>
                              <td className="px-4 py-2.5">{i + 1}</td>
                              <td className="px-4 py-2.5 font-medium">{name || '—'}</td>
                              <td className="px-4 py-2.5 hidden sm:table-cell">{s.sections ? fmtSectionLabel(s.sections, lang) : '—'}</td>
                              <td className="px-4 py-2.5 font-en">{fmtDate(r.date)}</td>
                              <td className="px-4 py-2.5">
                                <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                                  isViolation ? 'bg-rose-500/10 text-rose-500' : 'bg-amber-500/10 text-amber-600'
                                }`}>
                                  {isViolation ? <AlertTriangle size={10} /> : <Clock3 size={10} />}
                                  {isViolation ? t.incidentTypeViolation : t.incidentTypeLateness}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 hidden md:table-cell">{isViolation ? r.detail : (r.description || '—')}</td>
                              <td className="px-4 py-2.5 hidden lg:table-cell">{r.staffName || '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

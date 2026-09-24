import { useState, useEffect, useCallback } from 'react';
import { Mail, MessageCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fetchAllRows } from '../lib/fetchAll';

const pad = (n) => String(n).padStart(2, '0');
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayStr = () => fmt(new Date());
export const daysAgoStr = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return fmt(d); };

// Quick date ranges above a list: today / last 7 days / last 30 days / all.
export function RangeChips({ from, to, onChange, t, dark }) {
  const today = todayStr();
  const chips = [
    { key: 'today', label: t.rangeToday, from: today, to: today },
    { key: 'week', label: t.rangeWeek, from: daysAgoStr(6), to: today },
    { key: 'month', label: t.rangeMonth, from: daysAgoStr(30), to: today },
    { key: 'all', label: t.showAll, from: '', to: '' },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((c) => {
        const on = from === c.from && to === c.to;
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => onChange(c.from, c.to)}
            className={`text-xs font-medium px-3.5 py-1.5 rounded-full border transition-colors ${
              on ? 'bg-royal text-white border-royal' : (dark ? 'border-slate-700 text-slate-200 hover:bg-white/5' : 'border-slate-200 text-slate-600 hover:bg-slate-50')
            }`}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

// Which channels a parent was already contacted through, per student, for one
// context ('violation' / 'lateness') since a date. Best-effort: an older
// database without parent_contacts just shows no marks.
export function useContactChannels(context, since) {
  const [map, setMap] = useState(new Map());
  const reload = useCallback(async () => {
    const { data } = await fetchAllRows(() => {
      let q = supabase.from('parent_contacts').select('id, student_id, channel').eq('context', context).order('id');
      if (since) q = q.gte('created_at', since + 'T00:00:00');
      return q;
    });
    const m = new Map();
    (data || []).forEach((r) => {
      if (!m.has(r.student_id)) m.set(r.student_id, new Set());
      m.get(r.student_id).add(r.channel);
    });
    setMap(m);
  }, [context, since]);
  useEffect(() => { reload(); }, [reload]);
  return [map, reload];
}

// Small icons: a WhatsApp and/or mail mark when the parent was already sent a message.
export function SentMarks({ channels, t }) {
  if (!channels || channels.size === 0) return null;
  return (
    <span className="flex items-center gap-1 text-emerald-500">
      {channels.has('whatsapp') && <span title={t.sentViaWhatsapp}><MessageCircle size={15} /></span>}
      {channels.has('email') && <span title={t.sentViaEmail}><Mail size={15} /></span>}
    </span>
  );
}

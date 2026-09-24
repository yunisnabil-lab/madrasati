import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { MessageCircle, Mail, Check, X, Loader2, Inbox, History, ChevronDown } from 'lucide-react';
import { useApp } from '../lib/AppContext';
import EmptyState from '../components/EmptyState';
import { supabase } from '../lib/supabase';
import { cardFloating, pageBg, skeleton } from '../lib/theme';
import { sectionLabel as fmtSectionLabel } from '../lib/sections';
import { buildWhatsAppLink } from '../lib/whatsapp';

const SELECT = `
  id, channel, recipient, message, status, created_at, reviewed_at, student_id,
  students(name_ar, name_en, sis_no, sections(grade_name, grade_name_en, section_name, stream, section_number, grade_order)),
  requester:staff!contact_requests_requested_by_fkey(full_name),
  reviewer:staff!contact_requests_reviewed_by_fkey(full_name)
`;

export default function ContactRequests() {
  const { t, lang, dark, staff } = useApp();

  const [pending, setPending] = useState(null);
  const [reviewed, setReviewed] = useState(null);
  const [actingId, setActingId] = useState(null);

  const loadAll = useCallback(async () => {
    const [p, r] = await Promise.all([
      supabase.from('contact_requests').select(SELECT).eq('status', 'pending').order('created_at', { ascending: false }),
      supabase.from('contact_requests').select(SELECT).neq('status', 'pending').order('reviewed_at', { ascending: false }).limit(30),
    ]);
    setPending(p.data || []);
    setReviewed(r.data || []);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const [rowErrors, setRowErrors] = useState({}); // request id -> message

  const markApproved = () => ({ status: 'approved', reviewed_by: staff.id, reviewed_at: new Date().toISOString() });

  const approve = async (row) => {
    setRowErrors((m) => ({ ...m, [row.id]: null }));

    if (row.channel === 'whatsapp') {
      const link = buildWhatsAppLink(row.recipient, row.message);
      if (!link) { setRowErrors((m) => ({ ...m, [row.id]: t.saveError })); return; }
      // open WhatsApp right here, inside the click — browsers (Safari/iPhone
      // especially) block a new tab opened after an await, which used to
      // mark the request approved without WhatsApp ever opening
      window.open(link, '_blank', 'noopener,noreferrer');
      setActingId(row.id);
      await supabase.from('contact_requests').update(markApproved()).eq('id', row.id);
      setActingId(null);
      loadAll();
      return;
    }

    // email: send first, and only mark the request approved once it went out
    setActingId(row.id);
    const { data, error } = await supabase.functions.invoke('send-report-email', {
      body: { studentId: row.student_id, to: row.recipient, message: row.message },
    });
    if (error || (data && data.error)) {
      setActingId(null);
      setRowErrors((m) => ({ ...m, [row.id]: t.emailSendError }));
      return;
    }
    await supabase.from('contact_requests').update(markApproved()).eq('id', row.id);
    setActingId(null);
    loadAll();
  };

  const reject = async (row) => {
    setActingId(row.id);
    await supabase.from('contact_requests')
      .update({ status: 'rejected', reviewed_by: staff.id, reviewed_at: new Date().toISOString() })
      .eq('id', row.id);
    setActingId(null);
    loadAll();
  };

  const fmtDateTime = (d) => (d ? new Date(d).toLocaleString(lang === 'ar' ? 'ar-u-nu-latn' : 'en-US', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—');

  // Handled requests pile up fast and don't need the pending card's full
  // real estate — one compact line by default, with the same detail
  // (message, requester, recipient) a tap away instead of gone.
  function CompactReviewedRow({ r }) {
    const [open, setOpen] = useState(false);
    const s = r.students || {};
    const name = lang === 'ar' ? (s.name_ar || s.name_en) : (s.name_en || s.name_ar);
    const ChannelIcon = r.channel === 'whatsapp' ? MessageCircle : Mail;
    const statusColor = r.status === 'approved' ? 'text-emerald-500' : 'text-rose-500';
    const statusLabel = r.status === 'approved' ? t.statusApproved : t.statusRejected;
    return (
      <li>
        <button onClick={() => setOpen((v) => !v)} className={`w-full flex items-center gap-2.5 py-2 text-start transition-colors ${dark ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`}>
          <ChannelIcon size={13} className={r.channel === 'whatsapp' ? 'text-emerald-500' : (dark ? 'text-slate-200' : 'text-slate-500')} />
          <span className="text-xs font-medium truncate flex-1 min-w-0">{name}</span>
          <span className={`text-xs font-medium shrink-0 ${statusColor}`}>{statusLabel}</span>
          <span className={`text-xs shrink-0 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{fmtDateTime(r.reviewed_at)}</span>
          <ChevronDown size={13} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''} ${dark ? 'text-slate-200' : 'text-slate-500'}`} />
        </button>
        {open && (
          <div className="pb-3 ps-5">
            <div className={`text-xs mb-1.5 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>
              {s.sections ? fmtSectionLabel(s.sections, lang) + ' · ' : ''}{t.requestedBy} {r.requester?.full_name || '—'} · {r.recipient}
              {r.reviewer?.full_name ? ` · ${t.recordedBy} ${r.reviewer.full_name}` : ''}
            </div>
            <pre className={`text-xs p-2.5 rounded-lg whitespace-pre-wrap font-sans max-h-28 overflow-y-auto ${dark ? 'bg-black/20 text-slate-300' : 'bg-slate-50 text-slate-600'}`}>
              {r.message}
            </pre>
          </div>
        )}
      </li>
    );
  }

  function Row({ r }) {
    const s = r.students || {};
    const name = lang === 'ar' ? (s.name_ar || s.name_en) : (s.name_en || s.name_ar);
    const ChannelIcon = r.channel === 'whatsapp' ? MessageCircle : Mail;
    const channelBadgeCls = r.channel === 'whatsapp'
      ? (dark ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-500/10 text-emerald-600')
      : (dark ? 'bg-royal/15 text-royal-light' : 'bg-royal/10 text-royal');
    return (
      <li className="py-4">
        <div className="flex items-start gap-3">
          <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${channelBadgeCls}`}>
            <ChannelIcon size={15} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold truncate">{name}</span>
              {s.sections && (
                <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${dark ? 'bg-gold/10 text-gold' : 'bg-amber-50 text-amber-700'}`}>
                  {fmtSectionLabel(s.sections, lang)}
                </span>
              )}
            </div>
            <div className={`text-xs mt-0.5 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>
              {t.requestedBy} {r.requester?.full_name || '—'} · {fmtDateTime(r.created_at)} · {r.recipient}
            </div>
            <pre className={`text-xs mt-2 p-2.5 rounded-lg whitespace-pre-wrap font-sans max-h-28 overflow-y-auto ${dark ? 'bg-black/20 text-slate-300' : 'bg-slate-50 text-slate-600'}`}>
              {r.message}
            </pre>
            <div className="flex gap-2 mt-3">
                <button
                  onClick={() => approve(r)}
                  disabled={actingId === r.id}
                  className="flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-60"
                >
                  {actingId === r.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} {t.approveRequest}
                </button>
                <button
                  onClick={() => reject(r)}
                  disabled={actingId === r.id}
                  className={`flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-lg border disabled:opacity-60 ${dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}
                >
                  <X size={13} /> {t.rejectRequest}
                </button>
              </div>
              {rowErrors[r.id] && <p className="text-xs text-rose-500 mt-2">{rowErrors[r.id]}</p>}
          </div>
        </div>
      </li>
    );
  }

  return (
    <div className={lang === 'ar' ? 'font-ar' : 'font-en'}>
      <div className={`min-h-screen transition-colors duration-300 ${pageBg(dark)} ${dark ? 'text-slate-100' : 'text-slate-800'}`}>
        <main className="max-w-5xl mx-auto px-5 py-7">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6">
            <h1 className={`text-2xl font-bold ${dark ? 'text-white' : 'text-navy'}`}>{t.contactRequestsTitle}</h1>
            <p className={`text-sm mt-1 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.contactRequestsSub}</p>
          </motion.div>

          <div className={cardFloating(dark, 'p-5 mb-5')}>
            <div className="flex items-center gap-2 mb-1">
              <Inbox size={16} className="text-amber-500" />
              <h2 className={`text-sm font-semibold ${dark ? 'text-white' : 'text-slate-900'}`}>{t.pendingRequestsTitle}</h2>
            </div>
            {pending === null ? (
              <div className="space-y-2 mt-3">{[0, 1].map((i) => <div key={i} className={skeleton(dark, 'h-16 w-full')} />)}</div>
            ) : pending.length === 0 ? (
              <EmptyState icon={Inbox} text={t.noPendingRequests} dark={dark} />
            ) : (
              <ul className={`divide-y ${dark ? 'divide-slate-800' : 'divide-slate-100'}`}>
                {pending.map((r) => <Row key={r.id} r={r} />)}
              </ul>
            )}
          </div>

          <div className={cardFloating(dark, 'p-5')}>
            <div className="flex items-center gap-2 mb-1">
              <History size={16} className={dark ? 'text-royal-light' : 'text-royal'} />
              <h2 className={`text-sm font-semibold ${dark ? 'text-white' : 'text-slate-900'}`}>{t.reviewedRequestsTitle}</h2>
            </div>
            {reviewed === null ? (
              <div className="space-y-2 mt-3">{[0, 1].map((i) => <div key={i} className={skeleton(dark, 'h-16 w-full')} />)}</div>
            ) : reviewed.length === 0 ? (
              <p className={`text-sm mt-3 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>—</p>
            ) : (
              <ul className={`divide-y ${dark ? 'divide-slate-800' : 'divide-slate-100'}`}>
                {reviewed.map((r) => <CompactReviewedRow key={r.id} r={r} />)}
              </ul>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import useEscape from '../lib/useEscape';
import { MessageCircle, Mail, Loader2, X, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { buildWhatsAppLink } from '../lib/whatsapp';
import { buildDefaultMessage } from './ContactParentPanel';
import { buildNoticePdf } from '../lib/noticePdf';
import { emailErrorText, realEmail, emailSubject } from '../lib/emailErrors';

// Contact the parents of several students in one pass. WhatsApp can't send to
// many people at once, so each student gets their own row (phone + send
// buttons) under one shared, editable note — the staff member goes down the
// list instead of opening every student one by one. Every send is logged in
// parent_contacts, so the "parent contacted" marks appear afterwards.
export default function BulkContactModal({ students, contextType, defaultNote, staff, t, lang, dark, inputCls, onClose, onSent }) {
  useEscape(onClose);
  const [note, setNote] = useState(defaultNote);
  // behaviour / lateness messages can carry a PDF listing the recorded cases
  const canAttach = contextType === 'violation' || contextType === 'lateness';
  const [attachPdf, setAttachPdf] = useState(true);
  const [rows, setRows] = useState(() => {
    const r = {};
    students.forEach((s) => { r[s.id] = { phone: '', email: '', wa: false, mail: false, sending: false, err: null }; });
    return r;
  });

  // parent emails aren't part of the list queries, so fetch them here
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('students').select('id, parent_email, sis_no').in('id', students.map((s) => s.id));
      if (cancelled || !data) return;
      setRows((prev) => {
        const next = { ...prev };
        data.forEach((d) => { if (next[d.id]) next[d.id] = { ...next[d.id], email: next[d.id].email || realEmail(d.parent_email), sis: d.sis_no || '' }; });
        return next;
      });
    })();
    return () => { cancelled = true; };
  }, [students]);

  const patch = (id, p) => setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...p } }));

  const messageFor = (s) => buildDefaultMessage({ name: s.name, sectionLabel: s.sectionLabel, note, lang, t });

  const log = (s, channel, recipient) => {
    supabase.from('parent_contacts').insert({
      school_id: staff.school_id,
      student_id: s.id,
      staff_id: staff.id,
      channel,
      context: contextType,
      context_id: null,
      recipient,
    }).then(({ error }) => { if (!error && onSent) onSent(); });
  };

  const sendEmail = async (s) => {
    const email = rows[s.id].email.trim();
    if (!email) return;
    patch(s.id, { sending: true, err: null });
    let attachment;
    if (canAttach && attachPdf) {
      try {
        attachment = await buildNoticePdf({ kind: contextType, studentId: s.id, name: s.name, sisNo: rows[s.id].sis, sectionLabel: s.sectionLabel, t, lang });
      } catch {
        patch(s.id, { sending: false, err: t.emailPdfError });
        return;
      }
    }
    const message = attachment ? `${messageFor(s)}\n\n${t.noticePdfLine}` : messageFor(s);
    const { data, error } = await supabase.functions.invoke('send-report-email', {
      body: { studentId: s.id, to: email, subject: emailSubject(contextType, s.name, t), message, attachment },
    });
    if (error || (data && data.error)) { patch(s.id, { sending: false, err: emailErrorText(data, t) }); return; }
    patch(s.id, { sending: false, mail: true });
    log(s, 'email', email);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className={`w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border ${dark ? 'bg-navy-soft border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'}`}>
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="text-base font-semibold">{t.bulkContactTitle.replace('{n}', students.length)}</h2>
          <button onClick={onClose} className={`h-8 w-8 rounded-full flex items-center justify-center ${dark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}><X size={16} /></button>
        </div>
        <p className={`px-5 text-xs mb-3 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.bulkContactHint}</p>

        <div className="px-5 mb-3">
          <label className={`block text-xs font-medium mb-1.5 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.bulkContactNote}</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={3000} rows={3} className={inputCls} />
          {canAttach && (
            <label className={`flex items-center gap-2 text-xs mt-2 cursor-pointer ${dark ? 'text-slate-200' : 'text-slate-600'}`}>
              <input type="checkbox" checked={attachPdf} onChange={(e) => setAttachPdf(e.target.checked)} className="h-4 w-4 accent-royal" />
              {t.attachNoticePdf}
            </label>
          )}
        </div>

        <ul className={`flex-1 overflow-y-auto px-5 pb-2 divide-y ${dark ? 'divide-slate-800' : 'divide-slate-100'}`}>
          {students.map((s) => {
            const r = rows[s.id];
            const link = buildWhatsAppLink(r.phone, messageFor(s));
            return (
              <li key={s.id} className="py-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-semibold truncate">{s.name}</span>
                  <span className={`text-xs shrink-0 ${dark ? 'text-slate-300' : 'text-slate-500'}`}>{s.sectionLabel}</span>
                  {(r.wa || r.mail) && <Check size={14} className="text-emerald-500 shrink-0" />}
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="flex-1 flex gap-2">
                    <input type="tel" dir="ltr" value={r.phone} onChange={(e) => patch(s.id, { phone: e.target.value })} placeholder={t.parentPhonePlaceholder} className={`${inputCls} font-en`} />
                    <a
                      href={link || undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => { if (!link) { e.preventDefault(); return; } patch(s.id, { wa: true }); log(s, 'whatsapp', r.phone.trim()); }}
                      className={`flex items-center gap-1.5 text-xs font-medium px-3 rounded-lg text-white whitespace-nowrap ${link ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-slate-300 cursor-not-allowed'}`}
                    >
                      <MessageCircle size={14} /> {r.wa ? t.sentAgain : t.sendWhatsApp}
                    </a>
                  </div>
                  <div className="flex-1 flex gap-2">
                    <input type="email" dir="ltr" value={r.email} onChange={(e) => patch(s.id, { email: e.target.value })} placeholder="parent@example.com" className={`${inputCls} font-en`} />
                    <button
                      onClick={() => sendEmail(s)}
                      disabled={r.sending || !r.email.trim()}
                      className="flex items-center gap-1.5 text-xs font-medium px-3 rounded-lg text-white whitespace-nowrap bg-royal hover:bg-royal-light disabled:opacity-50"
                    >
                      {r.sending ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />} {r.mail ? t.sentAgain : t.sendEmail}
                    </button>
                  </div>
                </div>
                {r.err && <p className="text-xs text-rose-500 mt-1">{r.err}</p>}
              </li>
            );
          })}
        </ul>

        <div className={`flex justify-end px-5 py-3 border-t ${dark ? 'border-slate-800' : 'border-slate-100'}`}>
          <button onClick={onClose} className={`text-sm font-medium px-5 py-2.5 rounded-lg border ${dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}>{t.closeBtn}</button>
        </div>
      </div>
    </div>
  );
}

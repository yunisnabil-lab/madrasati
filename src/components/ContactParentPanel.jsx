import { useState } from 'react';
import { MessageCircle, Mail, Loader2, Send, Clock3 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { cardFloating } from '../lib/theme';
import { buildWhatsAppLink } from '../lib/whatsapp';
import { buildNoticePdf } from '../lib/noticePdf';
import { emailErrorText, realEmail } from '../lib/emailErrors';

export function buildDefaultMessage({ name, sectionLabel, note, lang, t }) {
  return lang === 'ar'
    ? `${t.school} - ${t.schoolSub}\nبخصوص الطالب: ${name}\nالصف - الشعبة: ${sectionLabel || '—'}\n\n${note}\n\nيرجى التواصل مع إدارة المدرسة لمزيد من التفاصيل.`
    : `${t.school} - ${t.schoolSub}\nRegarding student: ${name}\nGrade - Section: ${sectionLabel || '—'}\n\n${note}\n\nPlease contact the school administration for more details.`;
}

// Contact-parent panel used in two modes:
//  - "direct": admin/supervisor send the WhatsApp message or email right away
//    (used on the Violations and Lateness pages, and by admin/edari on
//    Student Lookup).
//  - "request": a teacher (recorder) can't contact parents directly — they
//    submit a request that goes into contact_requests for a supervisor or
//    admin to approve before anything is actually sent.
export default function ContactParentPanel({ student, name, sectionLabel, defaultNote, mode, staff, t, lang, dark, inputCls, contextType, contextId, onSent }) {
  const isRequest = mode === 'request';
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState(realEmail(student?.parent_email));
  const [message, setMessage] = useState(() => buildDefaultMessage({ name, sectionLabel, note: defaultNote, lang, t }));
  const [sendingWa, setSendingWa] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [waMsg, setWaMsg] = useState(null);
  const [emailMsg, setEmailMsg] = useState(null);
  // behaviour / lateness messages can carry a PDF listing the recorded cases
  const canAttach = !isRequest && (contextType === 'violation' || contextType === 'lateness');
  const [attachPdf, setAttachPdf] = useState(true);

  const link = buildWhatsAppLink(phone, message);

  // Best-effort log of a direct send, so a violation/lateness list can show
  // "already contacted" instead of the staff having to remember or re-check
  // WhatsApp themselves. Never blocks the actual send on this succeeding —
  // an older database without the table (or an RLS hiccup) just means no
  // badge shows up, not a broken send button.
  const logSent = (channel, recipient) => {
    if (isRequest || !contextType) return;
    supabase.from('parent_contacts').insert({
      school_id: staff.school_id,
      student_id: student.id,
      staff_id: staff.id,
      channel,
      context: contextType,
      context_id: contextId || null,
      recipient,
    }).then(({ error }) => { if (!error && onSent) onSent(); });
  };

  const submitRequest = async (channel, recipient) => {
    const { error } = await supabase.from('contact_requests').insert({
      school_id: staff.school_id,
      student_id: student.id,
      requested_by: staff.id,
      channel,
      recipient,
      message,
      status: 'pending',
    });
    return error;
  };

  const handleWhatsApp = async (e) => {
    if (!isRequest) return; // direct mode: the <a href> handles the send itself
    e.preventDefault();
    if (!phone.trim()) return;
    setSendingWa(true);
    setWaMsg(null);
    const error = await submitRequest('whatsapp', phone.trim());
    setSendingWa(false);
    setWaMsg(error ? { type: 'err', text: t.contactRequestError } : { type: 'ok', text: t.contactRequestSent });
  };

  const handleEmail = async () => {
    if (!email.trim()) return;
    if (isRequest) {
      setSendingEmail(true);
      setEmailMsg(null);
      const error = await submitRequest('email', email.trim());
      setSendingEmail(false);
      setEmailMsg(error ? { type: 'err', text: t.contactRequestError } : { type: 'ok', text: t.contactRequestSent });
      return;
    }
    setSendingEmail(true);
    setEmailMsg(null);
    let attachment;
    if (canAttach && attachPdf) {
      try {
        attachment = await buildNoticePdf({ kind: contextType, studentId: student.id, name, sisNo: student.sis_no, sectionLabel, t, lang });
      } catch {
        setSendingEmail(false);
        setEmailMsg({ type: 'err', text: t.emailPdfError });
        return;
      }
    }
    const { data, error } = await supabase.functions.invoke('send-report-email', {
      body: { studentId: student.id, to: email.trim(), message: attachment ? `${message}\n\n${t.noticePdfLine}` : message, attachment },
    });
    setSendingEmail(false);
    if (error || (data && data.error)) {
      setEmailMsg({ type: 'err', text: emailErrorText(data, t) });
    } else {
      setEmailMsg({ type: 'ok', text: t.emailSent });
      logSent('email', email.trim());
    }
  };

  return (
    <div className={cardFloating(dark, 'p-4 mb-5 space-y-4')}>
      <div className="flex items-center gap-2">
        {isRequest ? <Clock3 size={16} className="text-amber-500" /> : <Send size={16} className={dark ? 'text-royal-light' : 'text-royal'} />}
        <h3 className="text-sm font-semibold">{isRequest ? t.requestContactTitle : t.contactParentTitle}</h3>
      </div>
      <p className={`text-xs -mt-2 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>
        {isRequest ? t.requestContactSub : t.contactParentSub}
      </p>

      <div>
        <label className={`block text-xs font-medium mb-1.5 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{lang === 'ar' ? 'نص الرسالة' : 'Message text'}</label>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={4000} rows={4} className={inputCls} />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="flex-1">
          <label className={`block text-xs font-medium mb-1.5 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.parentPhone}</label>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t.parentPhonePlaceholder} className={`${inputCls} font-en`} dir="ltr" />
        </div>
        {isRequest ? (
          <button
            onClick={handleWhatsApp}
            disabled={sendingWa || !phone.trim()}
            className="flex items-center gap-1.5 text-sm font-medium px-4 py-2.5 rounded-lg text-white transition-colors whitespace-nowrap bg-amber-500 hover:bg-amber-600 disabled:opacity-50"
          >
            {sendingWa ? <Loader2 size={15} className="animate-spin" /> : <MessageCircle size={15} />} {t.requestViaWhatsApp}
          </button>
        ) : (
          <a
            href={link || undefined}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => { if (!link) { e.preventDefault(); return; } logSent('whatsapp', phone.trim()); }}
            className={`flex items-center gap-1.5 text-sm font-medium px-4 py-2.5 rounded-lg text-white transition-colors whitespace-nowrap ${link ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-slate-300 cursor-not-allowed'}`}
          >
            <MessageCircle size={15} /> {t.sendWhatsApp}
          </a>
        )}
      </div>
      {waMsg && <p className={`text-xs ${waMsg.type === 'ok' ? 'text-emerald-500' : 'text-rose-500'}`}>{waMsg.text}</p>}

      <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="flex-1">
          <label className={`block text-xs font-medium mb-1.5 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.parentEmail}</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="parent@example.com" className={`${inputCls} font-en`} dir="ltr" />
        </div>
        <button
          onClick={handleEmail}
          disabled={sendingEmail || !email.trim()}
          className={`flex items-center gap-1.5 text-sm font-medium px-4 py-2.5 rounded-lg text-white transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed ${isRequest ? 'bg-amber-500 hover:bg-amber-600' : 'bg-royal hover:bg-royal-light'}`}
        >
          {sendingEmail ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />} {isRequest ? t.requestViaEmail : t.sendEmail}
        </button>
      </div>
      {canAttach && (
        <label className={`flex items-center gap-2 text-xs cursor-pointer ${dark ? 'text-slate-200' : 'text-slate-600'}`}>
          <input type="checkbox" checked={attachPdf} onChange={(e) => setAttachPdf(e.target.checked)} className="h-4 w-4 accent-royal" />
          {t.attachNoticePdf}
        </label>
      )}
      {emailMsg && <p className={`text-xs ${emailMsg.type === 'ok' ? 'text-emerald-500' : 'text-rose-500'}`}>{emailMsg.text}</p>}
    </div>
  );
}

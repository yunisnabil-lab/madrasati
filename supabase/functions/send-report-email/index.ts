// Supabase Edge Function: send-report-email
//
// Called directly from the website when a staff member sends a message to a
// parent by email. Uses the calling user's own session token, so Supabase
// verifies they are really logged in, and Postgres RLS makes sure they can
// only email about a student they are allowed to see (the student lookup
// below runs through their own permissions, not an elevated service key).
//
// Optional PDF attachment: body.attachment = { filename, contentBase64 }
// (the student report, built in the browser). Checked below: must be a .pdf,
// valid base64, and at most ~3 MB.
//
// Required secrets:
//   SENDGRID_API_KEY — the SendGrid API key

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');

const MAX_MESSAGE_CHARS = 4000;
const MAX_ATTACHMENT_BASE64_CHARS = 4_000_000; // about 3 MB of PDF

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

Deno.serve(async (req) => {
  // The browser sends a CORS "preflight" OPTIONS request before the real POST.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (!SENDGRID_API_KEY || !SUPABASE_URL) {
    console.error('send-report-email: missing secret', { hasKey: !!SENDGRID_API_KEY, hasUrl: !!SUPABASE_URL });
    return json({ error: 'Missing required secrets' }, 500);
  }

  let body: {
    studentId?: string;
    to?: string;
    subject?: string;
    message?: string;
    attachment?: { filename?: string; contentBase64?: string };
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { studentId, to, subject, message, attachment } = body;
  if (!studentId || !to || !message) {
    return json({ error: 'studentId, to, and message are required' }, 400);
  }
  if (String(message).length > MAX_MESSAGE_CHARS) {
    return json({ error: 'Message too long' }, 400);
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(to) || to.length > 254) {
    return json({ error: 'Invalid recipient email' }, 400);
  }

  // Optional PDF attachment — validated before anything is sent.
  let sgAttachments: { content: string; filename: string; type: string; disposition: string }[] | undefined;
  if (attachment) {
    const b64 = attachment.contentBase64 || '';
    const rawName = String(attachment.filename || 'report.pdf');
    if (!b64 || b64.length > MAX_ATTACHMENT_BASE64_CHARS || !/^[A-Za-z0-9+/=]+$/.test(b64)) {
      return json({ error: 'Invalid attachment' }, 400);
    }
    // a real PDF starts with "%PDF" -> base64 "JVBER"
    if (!b64.startsWith('JVBER')) {
      return json({ error: 'Attachment is not a PDF' }, 400);
    }
    const safeName = rawName.replace(/[\\/:*?"<>|\r\n]/g, '-').slice(0, 120);
    sgAttachments = [{
      content: b64,
      filename: safeName.toLowerCase().endsWith('.pdf') ? safeName : `${safeName}.pdf`,
      type: 'application/pdf',
      disposition: 'attachment',
    }];
  }

  // A client scoped to the CALLING USER's own session — bound by that user's
  // real RLS permissions. The key is the project's public (publishable) key;
  // the caller's JWT goes in the Authorization header.
  const authHeader = req.headers.get('Authorization') || '';
  const supabase = createClient(SUPABASE_URL, 'sb_publishable_A0JFUviAzdUYu-lfaZNG1A_CwqKjZdm', {
    global: { headers: { Authorization: authHeader } },
  });

  let student: { id: string; name_ar: string } | null = null;
  try {
    const { data, error: studErr } = await supabase
      .from('students')
      .select('id, name_ar')
      .eq('id', studentId)
      .maybeSingle();

    if (studErr || !data) {
      // Either the student doesn't exist, or RLS hid it — same response either way.
      if (studErr) console.error('send-report-email: student lookup error', studErr);
      return json({ error: 'Student not found or not accessible' }, 403);
    }
    student = data;
  } catch (err) {
    console.error('send-report-email: student lookup threw', err);
    return json({ error: 'Student lookup failed', detail: String(err instanceof Error ? err.message : err) }, 500);
  }

  try {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: 'noreply@madrasati.app', name: 'مدرستي' },
        subject: subject || `تقرير حضور — ${student.name_ar}`,
        content: [{
          type: 'text/html',
          value: `<!DOCTYPE html>
<html dir="rtl" lang="ar">
  <head><meta charset="utf-8" /></head>
  <body style="font-family: Tahoma, Arial, sans-serif; font-size: 15px; color: #1a1a1a; white-space: pre-wrap;">
    ${escapeHtml(message)}
  </body>
</html>`,
        }],
        ...(sgAttachments ? { attachments: sgAttachments } : {}),
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('send-report-email: SendGrid API error', res.status, errText);
      return json({ error: 'SendGrid API error', status: res.status, detail: errText }, 502);
    }

    return json({ sent: true });
  } catch (err) {
    console.error('send-report-email: fetch to SendGrid threw', err);
    return json({ error: 'Failed to reach SendGrid', detail: String(err instanceof Error ? err.message : err) }, 500);
  }
});

// The send-report-email function answers { error: 'daily_limit' } when the
// staff member has used up today's email allowance.
export function emailErrorText(data, t) {
  return data && data.error === 'daily_limit' ? t.emailDailyLimit : t.emailSendError;
}

// Imported records sometimes carry a dummy address such as Example@example.com;
// never offer it as the parent's real email.
export function realEmail(e) {
  return e && !/@example\.(com|org|net)$/i.test(String(e).trim()) ? e : '';
}

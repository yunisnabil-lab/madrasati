// The send-report-email function answers { error: 'daily_limit' } when the
// staff member has used up today's email allowance.
export function emailErrorText(data, t) {
  return data && data.error === 'daily_limit' ? t.emailDailyLimit : t.emailSendError;
}

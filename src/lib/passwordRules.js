// Password rules used by sign-up, reset and change-password.
// Returns the i18n key of the first problem, or null when the password is fine.

const COMMON = [
  'password', 'passw0rd', 'qwerty', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm', 'letmein', 'welcome',
  'admin', 'administrator', 'iloveyou', 'abc123', 'monkey', 'dragon', 'football', 'madrasati',
  'zayed', 'school', 'مدرستي', 'كلمةالمرور', 'كلمةسر',
];

// a run of characters going up or down by one (12345, abcde, 54321) that covers
// the whole password, or the password is one short chunk repeated (1212, abcabc)
function isSequenceOrRepeat(pw) {
  const s = pw.toLowerCase();
  if (/^(.+?)\1+$/.test(s)) return true;
  let up = 0;
  let down = 0;
  for (let i = 1; i < s.length; i++) {
    const d = s.charCodeAt(i) - s.charCodeAt(i - 1);
    if (d === 1) up++;
    if (d === -1) down++;
  }
  return up >= s.length - 2 || down >= s.length - 2;
}

export function passwordProblem(pw) {
  if (!pw || pw.length < 10) return 'errPasswordShort';
  const hasLetter = /\p{L}/u.test(pw);
  const hasDigit = /\d/.test(pw);
  if (!hasLetter || !hasDigit) return 'errPasswordWeak';
  if (isSequenceOrRepeat(pw)) return 'errPasswordWeak';
  if (new Set(pw.toLowerCase()).size < 5) return 'errPasswordWeak'; // e.g. 11111111a
  const flat = pw.toLowerCase().replace(/[^\p{L}\d]/gu, '');
  if (COMMON.some((c) => flat === c || (flat.startsWith(c) && flat.length <= c.length + 3))) return 'errPasswordWeak';
  return null;
}

// Supabase's own complaints about a new password -> i18n key
export function passwordServerError(err) {
  const code = String((err && err.code) || '').toLowerCase();
  const msg = String((err && err.message) || '').toLowerCase();
  if (code === 'same_password' || msg.includes('different from the old')) return 'errPasswordSame';
  if (code === 'weak_password' || msg.includes('weak') || msg.includes('at least')) return 'errPasswordWeak';
  return 'errGeneric';
}

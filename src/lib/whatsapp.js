// Builds a wa.me deep link that opens WhatsApp (app or web) with a
// pre-filled message. No API key, no backend — the person still has to
// press send themselves inside WhatsApp.
//
// Staff enter parent numbers the way everyone in the UAE writes and reads
// them locally: starting with 0 (e.g. 0501234567), no country code. wa.me
// links need the full international form with no leading 0 (9715...), so
// that conversion happens here automatically rather than asking staff to
// type a country code they don't normally use.
//
// phone: any format the user typed (spaces, dashes, + are stripped down to
// digits first). A UAE-style local mobile number (starts with 05, 10 digits
// total) gets its leading 0 replaced with the 971 country code. A number
// that's already in full international form (e.g. already starts with 971,
// or any other country code the school might enter) is sent as-is — we only
// ever add the 971 prefix for the specific 0-then-9-digits local shape, so
// we never guess a country code wrong.
//
// Also handled, since numbers are typed or pasted in many shapes:
//   - Arabic-Indic digits (٠٥٠١٢٣٤٥٦٧)
//   - 00971501234567 (international "00" prefix) and +971 501234567
//   - 971 0501234567 (country code followed by the local leading 0)
//   - 501234567 (mobile typed without the leading 0)
export function normalizePhone(phone) {
  let digits = String(phone || '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)) // ٠-٩
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0)) // ۰-۹
    .replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (/^9710\d{9}$/.test(digits)) digits = '971' + digits.slice(4);
  if (/^0\d{9}$/.test(digits)) return '971' + digits.slice(1);
  if (/^5\d{8}$/.test(digits)) return '971' + digits;
  return digits;
}

export function buildWhatsAppLink(phone, message) {
  const digits = normalizePhone(phone);
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

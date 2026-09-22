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
export function buildWhatsAppLink(phone, message) {
  let digits = String(phone || '').replace(/[^\d]/g, '');
  if (!digits) return null;
  if (/^0\d{9}$/.test(digits)) {
    digits = '971' + digits.slice(1);
  }
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

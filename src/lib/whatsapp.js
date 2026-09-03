// Builds a wa.me deep link that opens WhatsApp (app or web) with a
// pre-filled message. No API key, no backend — the person still has to
// press send themselves inside WhatsApp.
//
// phone: any format the user typed (spaces, dashes, +, leading 0 are all
// stripped down to digits). If it doesn't already start with a country
// code, we don't guess one — we just send the digits as-is, since guessing
// wrong silently sends nobody the message.
export function buildWhatsAppLink(phone, message) {
  const digits = String(phone || '').replace(/[^\d]/g, '');
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

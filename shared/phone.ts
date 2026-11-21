/** Egyptian mobile numbers: 11 digits, 010 / 011 / 012 / 015. */
export const EGYPT_MOBILE_RE = /^01[0125]\d{8}$/;

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

/** Turns Arabic digits into 0-9, drops spaces and dashes, and +20 / 0020 into a leading 0. */
export function normalizePhone(raw: string): string {
  let s = raw.trim().replace(/[٠-٩۰-۹]/g, (d) => {
    const i = ARABIC_DIGITS.indexOf(d);
    return String(i >= 0 ? i : PERSIAN_DIGITS.indexOf(d));
  });
  s = s.replace(/[\s\-().‎‏]/g, "");
  if (s.startsWith("+20")) s = "0" + s.slice(3);
  else if (s.startsWith("0020")) s = "0" + s.slice(4);
  return s;
}

export const isEgyptianMobile = (raw: string) =>
  EGYPT_MOBILE_RE.test(normalizePhone(raw));

/**
 * Egyptian landlines: 10 digits with the area code, like 0238221076 (Cairo and
 * Giza 02 + 8 digits; other governorates 0xx + 7 digits). Not 01…, that's mobile.
 */
export const EGYPT_LANDLINE_RE = /^0[2-9]\d{8}$/;
/** A mobile or a landline: what orders accept (WhatsApp needs a mobile). */
export const EGYPT_PHONE_RE = /^(?:01[0125]\d{8}|0[2-9]\d{8})$/;

export const isEgyptianPhone = (raw: string) => EGYPT_PHONE_RE.test(normalizePhone(raw));

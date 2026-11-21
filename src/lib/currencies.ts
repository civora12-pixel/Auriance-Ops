/** Shown first: the Egyptian pound, then the currencies the region trades in most. */
export const COMMON_CURRENCIES = ["EGP", "USD", "EUR", "GBP", "SAR", "AED", "KWD", "QAR", "BHD", "OMR", "JOD"];

export function supportedCurrencies(): string[] {
  try {
    const all = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("currency") : [];
    return [...new Set([...COMMON_CURRENCIES, ...all])];
  } catch {
    return COMMON_CURRENCIES;
  }
}

export function currencyName(code: string, locale: string): string | undefined {
  try {
    const name = new Intl.DisplayNames([locale], { type: "currency" }).of(code);
    return name && name !== code ? name : undefined;
  } catch {
    return undefined;
  }
}

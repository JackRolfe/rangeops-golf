const formats = new Map<string, Intl.NumberFormat>()

/** Cents in a range's currency, as en-AU shows it: $18.00, or A$18.00 is avoided for AUD. */
export function formatMoney(cents: number, currency: string): string {
  let format = formats.get(currency)
  if (!format) {
    format = new Intl.NumberFormat('en-AU', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
    formats.set(currency, format)
  }
  return format.format(cents / 100)
}

/**
 * Money, spelled out.
 *
 * The ending screen says the amount in words because "$22.66" is a receipt and
 * "twenty-two dollars, sixty-six cents" is a sentence — and the whole game is
 * about what that number cost you. Kept pure and dependency-free so it can be
 * tested headlessly.
 */

const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** @param {number} n a non-negative integer below 1000 */
export function numberToWords(n) {
  if (n < 20) return ONES[n];
  if (n < 100) {
    const t = TENS[Math.floor(n / 10)];
    const o = n % 10;
    return o ? `${t}-${ONES[o]}` : t;
  }
  const h = Math.floor(n / 100);
  const r = n % 100;
  return r ? `${ONES[h]} hundred ${numberToWords(r)}` : `${ONES[h]} hundred`;
}

/**
 * Split an amount into its two spoken halves.
 * Works in integer cents so that sums of 0.01 cannot drift.
 *
 * @returns {{dollars: string|null, cents: string|null}}
 */
export function moneyInWords(total) {
  const totalCents = Math.round(total * 100);
  const d = Math.floor(totalCents / 100);
  const c = totalCents % 100;

  const dollars = d > 0 || c === 0
    ? `${numberToWords(d)} dollar${d === 1 ? '' : 's'}`
    : null;
  const cents = c > 0 ? `${numberToWords(c)} cent${c === 1 ? '' : 's'}` : null;

  return { dollars, cents };
}

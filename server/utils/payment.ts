export function normalizeCardNumber(input: string): string {
  return input.replace(/\s|-/g, "");
}

export function isValidLuhn(number: string): boolean {
  const s = normalizeCardNumber(number);
  if (!/^[0-9]{12,19}$/.test(s)) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = s.length - 1; i >= 0; i--) {
    let digit = parseInt(s.charAt(i), 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

export function isValidCardNumber(input: string): boolean {
  try {
    const normalized = normalizeCardNumber(input);

    // If network is recognized, allow Luhn and network-specific lengths/prefixes
    const network = getCardType(normalized);
    if (network && network !== "unknown") {
      // Luhn + length already covered by isValidLuhn (12-19) but some networks have specific lengths
      // We'll rely primarily on Luhn check here; network is useful for UX and for optional stricter checks.
      return isValidLuhn(normalized);
    }

    // Unknown network: accept any number that passes Luhn and has reasonable length
    return isValidLuhn(normalized);
  } catch (e) {
    return false;
  }
}

export type CardNetwork =
  | "visa"
  | "mastercard"
  | "amex"
  | "discover"
  | "jcb"
  | "diners"
  | "maestro"
  | "unionpay"
  | "unknown";

export function getCardType(cardNumber: string): CardNetwork {
  const s = normalizeCardNumber(cardNumber);
  if (!/^[0-9]{12,19}$/.test(s)) return "unknown";

  // Ordered checks (more specific first)
  // American Express: 34,37 (15 digits)
  if (/^3[47][0-9]{13}$/.test(s)) return "amex";

  // Diners Club: 300-305, 36, 38, 39 (14 digits historically)
  if (/^3(?:0[0-5]|[68][0-9])[0-9]{11}$/.test(s)) return "diners";

  // Discover (6011,65,644-649,622126-622925)
  if (/^(?:6011|65|64[4-9]|622(?:12[6-9]|1[3-9]\d|[2-8]\d{2}|9[0-1]\d|92[0-5]))[0-9]{0,}$/.test(s)) return "discover";

  // JCB: 3528-3589
  if (/^35(?:2[89]|[3-8][0-9])[0-9]{12}$/.test(s)) return "jcb";

  // Mastercard: 51-55, 2221-2720 (16 digits)
  if (/^(?:5[1-5][0-9]{14}|2[2-7][0-9]{14})$/.test(s)) return "mastercard";

  // Visa: 13,16,19 starting with 4
  if (/^4[0-9]{12}(?:[0-9]{3})?(?:[0-9]{3})?$/.test(s)) return "visa";

  // Maestro: many prefixes, lengths 12-19
  if (/^(?:5018|5020|5038|56|58|6304|6759|6761|6762|6763)[0-9]{8,15}$/.test(s)) return "maestro";

  // UnionPay: 62
  if (/^62[0-9]{14,17}$/.test(s)) return "unionpay";

  return "unknown";
}

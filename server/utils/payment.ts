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
    return isValidLuhn(input);
  } catch (e) {
    return false;
  }
}

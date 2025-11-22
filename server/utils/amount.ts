export function isValidAmountString(s: string): boolean {
  if (typeof s !== "string") return false;
  // Accept formats like '0', '0.5', '0.50', '1', '10.23' but not '00', '00012', '012.34'
  // Integer part must be either '0' or a non-zero-starting sequence
  const re = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;
  return re.test(s);
}

export function parseAndNormalizeAmount(s: string): number | null {
  if (!isValidAmountString(s)) return null;
  const num = parseFloat(s);
  if (Number.isNaN(num)) return null;
  // Round to two decimals
  return Math.round(num * 100) / 100;
}

export default { isValidAmountString, parseAndNormalizeAmount };

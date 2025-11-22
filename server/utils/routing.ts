export function isValidRoutingNumber(routing: string): boolean {
  if (!/^[0-9]{9}$/.test(routing)) return false;
  const digits = routing.split("").map((d) => parseInt(d, 10));
  if (digits.length !== 9 || digits.some((d) => Number.isNaN(d))) return false;

  // ABA routing number checksum:
  // (3*(d1 + d4 + d7) + 7*(d2 + d5 + d8) + 1*(d3 + d6 + d9)) % 10 === 0
  const checksum =
    3 * (digits[0] + digits[3] + digits[6]) +
    7 * (digits[1] + digits[4] + digits[7]) +
    1 * (digits[2] + digits[5] + digits[8]);

  return checksum % 10 === 0;
}

export default isValidRoutingNumber;

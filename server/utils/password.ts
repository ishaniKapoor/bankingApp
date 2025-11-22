export function isStrongPassword(pw: string): boolean {
  if (typeof pw !== "string") return false;
  // Minimum 12 characters
  if (pw.length < 12) return false;
  // At least one lowercase, one uppercase, one digit, one special character
  const hasLower = /[a-z]/.test(pw);
  const hasUpper = /[A-Z]/.test(pw);
  const hasDigit = /[0-9]/.test(pw);
  const hasSpecial = /[^A-Za-z0-9]/.test(pw);

  return hasLower && hasUpper && hasDigit && hasSpecial;
}

export function passwordFailureReason(pw: string): string | null {
  if (pw.length < 12) return "Password must be at least 12 characters";
  if (!/[a-z]/.test(pw)) return "Password must include a lowercase letter";
  if (!/[A-Z]/.test(pw)) return "Password must include an uppercase letter";
  if (!/[0-9]/.test(pw)) return "Password must include a number";
  if (!/[^A-Za-z0-9]/.test(pw)) return "Password must include a special character (e.g. !@#$%)";
  return null;
}

export default isStrongPassword;

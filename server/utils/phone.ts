import { parsePhoneNumberFromString } from "libphonenumber-js";

export function normalizePhone(input: string): string {
  if (!input) return "";
  return input.trim();
}

export function isValidE164(value: string): boolean {
  if (!value) return false;
  try {
    const parsed = parsePhoneNumberFromString(value);
    return parsed ? parsed.isValid() : false;
  } catch (e) {
    return false;
  }
}

export function formatToE164(input: string): string | null {
  if (!input) return null;
  try {
    const parsed = parsePhoneNumberFromString(input);
    if (parsed && parsed.isValid()) {
      return parsed.number; // returns E.164 string like +15551234567
    }
  } catch (e) {
    // ignore
  }
  return null;
}

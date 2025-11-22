export function parseDateString(dateStr: string): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export function isFutureDate(dateStr: string): boolean {
  const d = parseDateString(dateStr);
  if (!d) return false;
  const today = new Date();
  // Compare only date portion
  return d.setHours(0, 0, 0, 0) > today.setHours(0, 0, 0, 0);
}

export function calculateAge(dateStr: string): number | null {
  const d = parseDateString(dateStr);
  if (!d) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) {
    age--;
  }
  return age;
}

export function isAtLeastAge(dateStr: string, minAge = 18): boolean {
  const age = calculateAge(dateStr);
  if (age === null) return false;
  return age >= minAge;
}

export function isValidStateCode(code?: string | null): boolean {
  if (!code) return false;
  const upper = code.toUpperCase();
  const valid = [
    'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'
  ];
  return valid.includes(upper);
}

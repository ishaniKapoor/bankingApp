export const US_STATE_CODES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'
] as const;

// use a Set<string> so runtime string inputs (like code.toUpperCase()) are accepted
const STATE_SET: Set<string> = new Set(US_STATE_CODES as readonly string[]);

export function isValidUSState(code?: string | null): boolean {
  if (!code) return false;
  return STATE_SET.has(code.toUpperCase());
}
